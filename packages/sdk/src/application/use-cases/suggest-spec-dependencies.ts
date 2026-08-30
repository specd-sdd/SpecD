import { createHash } from 'node:crypto'
import {
  type SpecRepository,
  type GetPersistedSpecDeps,
  type UpdatePersistedSpecDeps,
  type ValidateSpecs,
  type CreateChange,
  SpecNotFoundError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecPath,
  Logger,
} from '@specd/core'
import { type CodeGraphProvider } from '@specd/code-graph'
import { z } from 'zod'
import {
  SuggestImplementationLinks,
  type SuggestImplementationLinksResult,
} from './suggest-implementation-links.js'
import { TransitiveReductionEngine } from '../../domain/services/transitive-reduction-engine.js'
import { type ImplementationSuggestionCachePort } from '../ports/implementation-suggestion-cache-port.js'
import { type SpecDepsSuggestionCachePort } from '../ports/spec-deps-suggestion-cache-port.js'
import { type ImplementationSuggestionSpecEntry } from '../../domain/value-objects/implementation-suggestion-cache.js'

/** Progress event emitted during `SuggestSpecDependencies` execution. */
export type SuggestSpecDepsProgressEvent =
  | { type: 'stale-warning'; stale: boolean }
  | { type: 'warmup-start'; message: string }
  | {
      type: 'warmup-progress'
      event: import('./suggest-implementation-links.js').SuggestImplementationProgressEvent
    }
  | { type: 'warmup-done'; totalSpecs: number }
  | { type: 'start'; totalSpecs: number }
  | { type: 'spec-start'; specId: string; index: number; totalSpecs: number }
  | { type: 'spec-done'; specId: string; suggestedCount: number }
  | { type: 'validation-start'; message: string }
  | { type: 'validation-done'; status: string }
  | { type: 'done'; totalSpecs: number; totalDependencies: number }

/**
 *
 */
export type OnSuggestSpecDepsProgress = (event: SuggestSpecDepsProgressEvent) => void

/** Minimal structural view of a file impact result consumed by this orchestration. */
interface FileImpactLike {
  affectedFiles?: readonly unknown[]
}

/**
 * Runs a depth-1 downstream impact analysis, preferring `analyzeFileImportImpact`
 * and falling back to `analyzeFileImpact` for providers that do not expose it.
 *
 * @param provider - Code graph provider
 * @param filePath - File path to analyze
 * @returns Impact result, or undefined when the provider returns nothing
 */
async function queryDownstreamImpact(
  provider: CodeGraphProvider,
  filePath: string,
): Promise<FileImpactLike | undefined> {
  if (typeof provider.analyzeFileImportImpact === 'function') {
    return (await provider.analyzeFileImportImpact(filePath, 'downstream', 1)) as FileImpactLike
  }
  return (await provider.analyzeFileImpact(filePath, 'downstream', 1)) as FileImpactLike
}

/**
 * Computes a stable fingerprint of the global implementation file-to-spec map
 * so cached dependency suggestions can detect ownership changes of imported
 * files between runs.
 *
 * @param cache - Implementation suggestion cache providing the mapping
 * @returns Hex fingerprint, or null when the map is unavailable
 */
async function computeFileToSpecFingerprint(
  cache: ImplementationSuggestionCachePort,
): Promise<string | null> {
  try {
    const map = await cache.getFileToSpecMap()
    const parts = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, specId]) => `${file}=>${specId}`)
    return createHash('sha256').update(parts.join('|')).digest('hex')
  } catch {
    return null
  }
}

/** Zod input schema for `SuggestSpecDependencies`. */
export const suggestSpecDependenciesInputSchema = z
  .object({
    specId: z.string().min(1, 'specId cannot be empty').optional(),
    specIds: z
      .array(z.string().min(1, 'specId in specIds cannot be empty'))
      .nonempty('specIds cannot be empty')
      .optional(),
    workspace: z.string().min(1, 'workspace cannot be empty').optional(),
    all: z.boolean().optional(),
    apply: z.boolean().optional(),
    rebuildCache: z.boolean().optional(),
    createAlignmentChange: z.boolean().optional(),
    changeNamePrefix: z.string().min(1, 'changeNamePrefix cannot be empty').optional(),
    onProgress: z
      .custom<OnSuggestSpecDepsProgress>((val) => val === undefined || typeof val === 'function')
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!val.all && !val.workspace && !val.specId && (!val.specIds || val.specIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'At least one target criterion (specId, specIds, workspace, or all) must be specified',
      })
    }
  })

/** Input options for `SuggestSpecDependencies`. */
export interface SuggestSpecDependenciesInput {
  /** Target spec ID. */
  readonly specId?: string
  /** List of target spec IDs. */
  readonly specIds?: readonly string[]
  /** Target workspace filter. */
  readonly workspace?: string
  /** Target all specs. */
  readonly all?: boolean
  /** Apply suggested dependencies into spec-lock.json. */
  readonly apply?: boolean
  /** Force cache rebuild. */
  readonly rebuildCache?: boolean
  /** Create alignment change on post-apply validation failures. */
  readonly createAlignmentChange?: boolean
  /** Prefix for created alignment change name. */
  readonly changeNamePrefix?: string
  /** Optional progress callback. */
  readonly onProgress?: OnSuggestSpecDepsProgress
}

/** Suggested dependency item for a spec. */
export interface SuggestedSpecDependency {
  readonly specId: string
  readonly title: string
  readonly reason: string
  readonly status?: 'already-configured' | 'new'
  readonly alreadyIncluded?: boolean
}

/** Dependency suggestion container for a spec. */
export interface SpecDependencySuggestion {
  readonly specId: string
  readonly title: string
  readonly existingDependsOn: readonly string[]
  readonly suggestedDependsOn: readonly SuggestedSpecDependency[]
}

/** Information about a created alignment change. */
export interface CreatedAlignmentChangeInfo {
  readonly name: string
  readonly changePath: string
  readonly specIds: readonly string[]
}

/** Post-apply validation diagnostic. */
export interface PostApplyValidationDiagnostic {
  readonly status: 'all-valid' | 'invalid-specs-detected'
  readonly invalidSpecs: readonly {
    readonly specId: string
    readonly failures: readonly {
      readonly artifactId: string
      readonly description: string
    }[]
  }[]
  readonly suggestedAlignmentCommand?: string
  readonly createdChange?: CreatedAlignmentChangeInfo
}

/** Result returned by `SuggestSpecDependencies`. */
export interface SuggestSpecDependenciesResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string
  readonly codeGraphStale?: boolean
  readonly specs: readonly SpecDependencySuggestion[]
  readonly appliedMutations?: {
    readonly updatedSpecsCount: number
    readonly depsAddedCount: number
  }
  readonly postApplyValidation?: PostApplyValidationDiagnostic
}

/** Dependencies required by `SuggestSpecDependencies`. */
export interface SuggestSpecDependenciesDeps {
  readonly suggestImplementationLinks: SuggestImplementationLinks
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly getPersistedDeps: GetPersistedSpecDeps
  readonly updatePersistedDeps: UpdatePersistedSpecDeps
  readonly validateSpecs?: ValidateSpecs
  readonly codeGraphTraversalPort?: unknown
  readonly codeGraphProvider?: CodeGraphProvider
  readonly createChange?: CreateChange
  readonly cache?: ImplementationSuggestionCachePort
  readonly specDepsCache?: SpecDepsSuggestionCachePort
  readonly projectDir?: string
}

/**
 * Static-analysis orchestration use case to suggest inter-spec dependencies.
 */
export class SuggestSpecDependencies {
  /**
   * Creates an instance of `SuggestSpecDependencies`.
   *
   * @param deps - Injected dependencies
   */
  constructor(private readonly deps: SuggestSpecDependenciesDeps) {}

  /**
   * Executes the suggestion analysis across target specs.
   *
   * @param input - Input query and execution options
   * @returns Dependency suggestion results
   */
  async execute(input: SuggestSpecDependenciesInput): Promise<SuggestSpecDependenciesResult> {
    const parseResult = suggestSpecDependenciesInputSchema.safeParse(input)
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
        .join('; ')
      throw new InvalidInputError(`Invalid SuggestSpecDependencies input: ${issues}`)
    }
    const validatedInput = parseResult.data

    if (validatedInput.apply === true && this.deps.validateSpecs === undefined) {
      throw new InvalidInputError(
        'apply requires a ValidateSpecs dependency, but none was injected',
      )
    }
    if (validatedInput.createAlignmentChange === true && this.deps.createChange === undefined) {
      throw new InvalidInputError(
        'createAlignmentChange requires a CreateChange dependency, but none was injected',
      )
    }

    if (validatedInput.workspace !== undefined) {
      if (!this.deps.specRepositories.has(validatedInput.workspace)) {
        throw new WorkspaceNotFoundError(validatedInput.workspace)
      }
    }

    if (this.deps.codeGraphProvider && typeof this.deps.codeGraphProvider.open === 'function') {
      await this.deps.codeGraphProvider.open().catch(() => {})
    }

    let codeGraphStale = false
    const cgProvider = this.deps.codeGraphProvider
    const graphHealthProvider = cgProvider as unknown as {
      getGraphHealth?: () => Promise<{
        stale?: boolean
        state?: string
        knownStaleSinceLastIndex?: boolean
        reasonCodes?: readonly string[]
      }>
    }
    if (cgProvider && typeof graphHealthProvider.getGraphHealth === 'function') {
      try {
        const health = await graphHealthProvider.getGraphHealth()
        codeGraphStale = Boolean(
          health?.stale ||
          health?.state === 'stale' ||
          health?.knownStaleSinceLastIndex ||
          (Array.isArray(health?.reasonCodes) && health.reasonCodes.length > 0),
        )
      } catch {
        // Advisory
      }
    }

    if (codeGraphStale) {
      validatedInput.onProgress?.({
        type: 'stale-warning',
        stale: true,
      })
    }

    try {
      // Pass 1: Warm-up implementation suggestion cache across monorepo
      input.onProgress?.({
        type: 'warmup-start',
        message: 'Warming up implementation cache across workspaces...',
      })

      const implCache = this.deps.cache
      if (implCache === undefined) {
        throw new InvalidInputError('SuggestSpecDependencies requires an implementation cache port')
      }

      let implResult: SuggestImplementationLinksResult | undefined
      await implCache.withLock(async () => {
        implResult = await this.deps.suggestImplementationLinks.execute({
          all: true,
          apply: false,
          ...(input.rebuildCache !== undefined ? { rebuildCache: input.rebuildCache } : {}),
          onProgress: (evt) => input.onProgress?.({ type: 'warmup-progress', event: evt }),
        })
        input.onProgress?.({ type: 'warmup-done', totalSpecs: implResult?.specs?.length ?? 0 })

        if (implResult?.specs && implResult.specs.length > 0) {
          const entriesToPrime: ImplementationSuggestionSpecEntry[] = []
          for (const s of implResult.specs) {
            // No valid stamp available -> do not persist the entry.
            if (!s.specStamp || (!s.specStamp.lastModified && !s.specStamp.hash)) continue
            entriesToPrime.push({
              specId: s.specId,
              title: s.title,
              specStamp: s.specStamp,
              existing: s.existing,
              suggestions: s.suggestions,
            })
          }
          if (entriesToPrime.length > 0) {
            await implCache.setMany(entriesToPrime)
            await implCache.flush()
          }
        }
      })

      const specDepsCache = this.deps.specDepsCache
      if (specDepsCache === undefined) {
        throw new InvalidInputError('SuggestSpecDependencies requires a spec-deps cache port')
      }
      if (input.rebuildCache) {
        await specDepsCache.invalidate()
      }

      return await specDepsCache.withLock(async () => {
        // Snapshot the global file-to-spec ownership after warm-up so cached
        // dependency suggestions can be invalidated when it shifts.
        const expectedMapFingerprint = await computeFileToSpecFingerprint(implCache)

        // Determine target specs
        const targetSpecs: Array<{
          specId: string
          title: string
          workspace: string
          path: string
        }> = []

        for (const [wsName, repo] of this.deps.specRepositories.entries()) {
          if (input.workspace && input.workspace !== wsName) {
            continue
          }
          const listResult = await repo.list(undefined, { includeMeta: true, includeSummary: true })
          const entries = Array.isArray(listResult) ? listResult : (listResult?.items ?? [])
          for (const rawEntry of entries) {
            const entry = rawEntry as Record<string, unknown>
            const entryWorkspace = typeof entry.workspace === 'string' ? entry.workspace : ''
            const entryPath = typeof entry.path === 'string' ? entry.path : ''
            const entryTitle = typeof entry.title === 'string' ? entry.title : ''
            const specId = `${entryWorkspace}:${entryPath}`

            if (input.specId && input.specId !== specId) {
              continue
            }
            if (input.specIds && !input.specIds.includes(specId)) {
              continue
            }

            targetSpecs.push({
              specId,
              title: entryTitle,
              workspace: entryWorkspace,
              path: entryPath,
            })
          }
        }

        if (input.specId && !targetSpecs.some((s) => s.specId === input.specId)) {
          throw new SpecNotFoundError(input.specId)
        }
        if (input.specIds && input.specIds.length > 0) {
          for (const id of input.specIds) {
            if (!targetSpecs.some((s) => s.specId === id)) {
              throw new SpecNotFoundError(id)
            }
          }
        }
        // A workspace that resolves but yields no specs (or an empty monorepo
        // under `all`) is an input error, not a silent empty result.
        if (targetSpecs.length === 0) {
          if (input.workspace !== undefined) {
            throw new WorkspaceNotFoundError(input.workspace)
          }
          throw new InvalidInputError(
            'No specs found to analyze — the configured spec repositories are empty',
          )
        }

        const resultSpecs: SpecDependencySuggestion[] = []
        let updatedSpecsCount = 0
        let depsAddedCount = 0

        input.onProgress?.({ type: 'start', totalSpecs: targetSpecs.length })

        // Pass 2: Tracing imports & dependencies
        for (let index = 0; index < targetSpecs.length; index++) {
          const target = targetSpecs[index]!
          // Yield to event loop so CLI spinners and TTY output can animate smoothly
          await new Promise<void>((resolve) => setImmediate(resolve))
          input.onProgress?.({
            type: 'spec-start',
            specId: target.specId,
            index: index + 1,
            totalSpecs: targetSpecs.length,
          })
          let existingDependsOn: string[] = []
          try {
            const persisted = await this.deps.getPersistedDeps.execute({ specId: target.specId })
            existingDependsOn = [...persisted.dependsOn]
          } catch {
            // Not initialized
          }

          let cachedSpecDep = input.rebuildCache ? null : await specDepsCache.get(target.specId)
          if (
            cachedSpecDep &&
            expectedMapFingerprint !== null &&
            cachedSpecDep.fileToSpecFingerprint &&
            cachedSpecDep.fileToSpecFingerprint !== expectedMapFingerprint
          ) {
            // Ownership of imported files changed since this entry was computed:
            // discard the cached suggestions so they are recomputed below.
            Logger.debug('[SuggestSpecDependencies] Discarding stale deps cache entry', {
              specId: target.specId,
              reason: 'file-to-spec fingerprint mismatch',
            })
            cachedSpecDep = null
          }

          let suggestedDependsOn: SuggestedSpecDependency[] = []

          if (cachedSpecDep) {
            suggestedDependsOn = cachedSpecDep.suggestedDependsOn.map((item) => ({
              ...item,
              alreadyIncluded: existingDependsOn.includes(item.specId),
              status: existingDependsOn.includes(item.specId)
                ? ('already-configured' as const)
                : ('new' as const),
            }))
          } else {
            const cachedImpl = await implCache.get(target.specId)
            const implSpec = implResult?.specs?.find((s) => s.specId === target.specId)
            const implFiles = new Set<string>()

            const targetRepo = this.deps.specRepositories.get(target.workspace)
            if (targetRepo) {
              try {
                const specData = await targetRepo.get(SpecPath.parse(target.path))
                const implFilesList = (specData as unknown as Record<string, unknown>)
                  ?.implementation
                const filesArr = (implFilesList as Record<string, unknown> | undefined)?.files
                if (Array.isArray(filesArr)) {
                  for (const f of filesArr) {
                    if (typeof f === 'string') implFiles.add(f)
                  }
                }
              } catch {
                // Ignore read errors
              }
            }

            if (implSpec) {
              for (const f of implSpec.existing.files) implFiles.add(f)
              for (const s of implSpec.suggestions) {
                if (s.confidence === 'HIGH' || s.confidence === 'MEDIUM') implFiles.add(s.file)
              }
            }
            if (cachedImpl) {
              for (const f of cachedImpl.existing.files) implFiles.add(f)
              for (const s of cachedImpl.suggestions) {
                if (s.confidence === 'HIGH' || s.confidence === 'MEDIUM') implFiles.add(s.file)
              }
            }

            const suggestedMap = new Map<string, SuggestedSpecDependency>()
            // Outbound (downstream) edges collected during Pass 2, reused by the
            // Directional Validation Pass instead of re-querying the graph.
            const targetOutboundFiles = new Set<string>()

            Logger.debug('[SuggestSpecDependencies] Processing target spec', {
              specId: target.specId,
              implFilesCount: implFiles.size,
              implFiles: Array.from(implFiles),
            })

            if (this.deps.codeGraphProvider) {
              for (const file of implFiles) {
                const rawPath = file.replace(/^[^:]+:/, '')
                if (
                  rawPath.includes('/test/') ||
                  rawPath.startsWith('test/') ||
                  rawPath.endsWith('.spec.ts') ||
                  rawPath.endsWith('.test.ts') ||
                  rawPath.includes('/dev/')
                ) {
                  continue
                }
                try {
                  const impact = await queryDownstreamImpact(this.deps.codeGraphProvider, file)
                  Logger.debug('[SuggestSpecDependencies] analyzeFileImpact result', {
                    pathQuery: file,
                    affectedFiles: impact?.affectedFiles,
                  })
                  const affected = impact?.affectedFiles ?? []
                  for (const aff of affected) {
                    const affObj = aff as Record<string, unknown>
                    const affPath =
                      typeof aff === 'string'
                        ? aff
                        : typeof affObj.filePath === 'string'
                          ? affObj.filePath
                          : typeof affObj.file === 'string'
                            ? affObj.file
                            : ''
                    const affSymbol =
                      typeof affObj.symbol === 'string'
                        ? affObj.symbol
                        : typeof affObj.symbolName === 'string'
                          ? affObj.symbolName
                          : typeof affObj.importedSymbol === 'string'
                            ? affObj.importedSymbol
                            : undefined

                    if (affPath) {
                      targetOutboundFiles.add(affPath)
                      targetOutboundFiles.add(affPath.replace(/^[^:]+:/, ''))
                    }

                    const mappedSpecId = await implCache.findSpecByFile(affPath, affSymbol)
                    Logger.debug('[SuggestSpecDependencies] Mapped affected file to spec', {
                      affPath,
                      affSymbol,
                      mappedSpecId,
                    })
                    const isBarrelFile =
                      affPath.endsWith('/index.ts') ||
                      affPath.endsWith('/index.js') ||
                      affPath.endsWith('/ports.ts') ||
                      affPath.endsWith('/index.d.ts')
                    if (isBarrelFile) {
                      try {
                        const barrelImpact = await queryDownstreamImpact(
                          this.deps.codeGraphProvider,
                          affPath,
                        )
                        for (const bAff of barrelImpact?.affectedFiles ?? []) {
                          const bObj = bAff as Record<string, unknown>
                          const bPath =
                            typeof bAff === 'string'
                              ? bAff
                              : typeof bObj.filePath === 'string'
                                ? bObj.filePath
                                : typeof bObj.file === 'string'
                                  ? bObj.file
                                  : ''
                          const bSymbol =
                            typeof bObj.symbol === 'string'
                              ? bObj.symbol
                              : typeof bObj.symbolName === 'string'
                                ? bObj.symbolName
                                : typeof bObj.importedSymbol === 'string'
                                  ? bObj.importedSymbol
                                  : undefined
                          const bMappedSpecId = await implCache.findSpecByFile(bPath, bSymbol)
                          if (bMappedSpecId && bMappedSpecId !== target.specId) {
                            if (!suggestedMap.has(bMappedSpecId)) {
                              const isAlreadyIncluded = existingDependsOn.includes(bMappedSpecId)
                              const targetOwner = await implCache.get(bMappedSpecId)
                              suggestedMap.set(bMappedSpecId, {
                                specId: bMappedSpecId,
                                title: targetOwner?.title ?? bMappedSpecId,
                                reason: `Code import relationship via ${bPath}`,
                                status: isAlreadyIncluded ? 'already-configured' : 'new',
                                alreadyIncluded: isAlreadyIncluded,
                              })
                            }
                          }
                        }
                      } catch {
                        // Ignore barrel expansion error
                      }
                    }

                    if (mappedSpecId && mappedSpecId !== target.specId) {
                      if (!suggestedMap.has(mappedSpecId)) {
                        const isAlreadyIncluded = existingDependsOn.includes(mappedSpecId)
                        const targetOwner = await implCache.get(mappedSpecId)
                        suggestedMap.set(mappedSpecId, {
                          specId: mappedSpecId,
                          title: targetOwner?.title ?? mappedSpecId,
                          reason: `Code import relationship via ${affPath}`,
                          status: isAlreadyIncluded ? 'already-configured' : 'new',
                          alreadyIncluded: isAlreadyIncluded,
                        })
                      }
                    }
                  }
                } catch (err) {
                  Logger.debug('[SuggestSpecDependencies] Traversal error', { error: err })
                }
              }
            }

            // Pass 2.5: Directional Validation Pass
            // Validate that the target spec actually imports or depends on the candidate spec.
            // If the candidate spec imports the target spec, but the target does NOT import the candidate,
            // the dependency is inverted (e.g. implementation depending on port, not vice versa) and must be pruned.

            if (this.deps.codeGraphProvider && suggestedMap.size > 0) {
              const targetFilesList = Array.from(implFiles)

              for (const candidateSpecId of Array.from(suggestedMap.keys())) {
                const candidateFiles = new Set<string>()

                const candidateOwner = await implCache.get(candidateSpecId)
                if (candidateOwner) {
                  for (const f of candidateOwner.existing.files) candidateFiles.add(f)
                  for (const s of candidateOwner.suggestions) {
                    if (s.confidence === 'HIGH') candidateFiles.add(s.file)
                  }
                }

                if (candidateFiles.size === 0) {
                  const parts = candidateSpecId.includes(':')
                    ? candidateSpecId.split(':')
                    : ['default', candidateSpecId]
                  const cWs = parts[0] ?? 'default'
                  const cPath = parts[1] ?? candidateSpecId
                  const cRepo = this.deps.specRepositories.get(cWs)
                  if (cRepo) {
                    try {
                      const cSpecData = await cRepo.get(SpecPath.parse(cPath))
                      if (cSpecData) {
                        if (typeof cRepo.readPersistedState === 'function') {
                          const persistedState = await cRepo.readPersistedState(cSpecData)
                          for (const link of persistedState?.implementation ?? []) {
                            if (link.file) candidateFiles.add(link.file)
                          }
                        }
                        const cImplList = (cSpecData as unknown as Record<string, unknown>)
                          ?.implementation
                        const cFilesArr = (cImplList as Record<string, unknown> | undefined)?.files
                        if (Array.isArray(cFilesArr)) {
                          for (const f of cFilesArr) {
                            if (typeof f === 'string') candidateFiles.add(f)
                          }
                        }
                      }
                    } catch {
                      // ignore
                    }
                  }
                }

                if (candidateFiles.size === 0) continue
                await new Promise<void>((resolve) => setImmediate(resolve))

                let targetDirectlyImportsCandidate = false
                for (const cFile of candidateFiles) {
                  const rawCPath = cFile.replace(/^[^:]+:/, '')
                  if (targetOutboundFiles.has(cFile) || targetOutboundFiles.has(rawCPath)) {
                    targetDirectlyImportsCandidate = true
                    break
                  }
                }

                // Check if candidate imports target (inverse relationship)
                let candidateDirectlyImportsTarget = false
                for (const cFile of candidateFiles) {
                  try {
                    const cImpact = await queryDownstreamImpact(this.deps.codeGraphProvider, cFile)
                    for (const aff of cImpact?.affectedFiles ?? []) {
                      const affObj = aff as Record<string, unknown>
                      const affPath =
                        typeof aff === 'string'
                          ? aff
                          : typeof affObj.filePath === 'string'
                            ? affObj.filePath
                            : typeof affObj.file === 'string'
                              ? affObj.file
                              : ''
                      const rawAff = affPath.replace(/^[^:]+:/, '')
                      for (const tFile of targetFilesList) {
                        const rawT = tFile.replace(/^[^:]+:/, '')
                        if (affPath === tFile || rawAff === rawT) {
                          candidateDirectlyImportsTarget = true
                          break
                        }
                      }
                      if (candidateDirectlyImportsTarget) break
                    }
                  } catch {
                    // ignore
                  }
                  if (candidateDirectlyImportsTarget) break
                }

                if (candidateDirectlyImportsTarget && !targetDirectlyImportsCandidate) {
                  Logger.debug('[SuggestSpecDependencies] Pruning inverted dependency suggestion', {
                    targetSpec: target.specId,
                    invertedCandidateSpec: candidateSpecId,
                  })
                  suggestedMap.delete(candidateSpecId)
                }
              }
            }

            // Pass 2.6: Transitive Reduction Pass via TransitiveReductionEngine
            if (suggestedMap.size > 1) {
              const candidateGraph = new Map<string, Set<string>>()
              candidateGraph.set(target.specId, new Set(suggestedMap.keys()))

              for (const candidateSpecId of suggestedMap.keys()) {
                const depsSet = new Set<string>()
                try {
                  const persisted = await this.deps.getPersistedDeps.execute({
                    specId: candidateSpecId,
                  })
                  for (const d of persisted.dependsOn) depsSet.add(d)
                } catch {
                  // ignore
                }
                candidateGraph.set(candidateSpecId, depsSet)
              }

              const reduced = TransitiveReductionEngine.reduce(candidateGraph)
              const remainingCandidates = new Set(reduced.get(target.specId) ?? [])

              for (const candidateSpecId of Array.from(suggestedMap.keys())) {
                if (!remainingCandidates.has(candidateSpecId)) {
                  Logger.debug(
                    '[SuggestSpecDependencies] Pruning redundant recommendation via transitive reduction',
                    {
                      targetSpec: target.specId,
                      prunedCandidate: candidateSpecId,
                    },
                  )
                  suggestedMap.delete(candidateSpecId)
                }
              }
            }

            suggestedDependsOn = Array.from(suggestedMap.values())

            const storedSuggestedItems = suggestedDependsOn.map((item) => ({
              specId: item.specId,
              title: item.title,
              reason: item.reason,
            }))

            await specDepsCache.set(target.specId, {
              title: target.title,
              existingDependsOn,
              suggestedDependsOn: storedSuggestedItems,
              ...(expectedMapFingerprint !== null
                ? { fileToSpecFingerprint: expectedMapFingerprint }
                : {}),
            })
            await specDepsCache.flush()
          }

          resultSpecs.push({
            specId: target.specId,
            title: target.title,
            existingDependsOn,
            suggestedDependsOn,
          })

          input.onProgress?.({
            type: 'spec-done',
            specId: target.specId,
            suggestedCount: suggestedDependsOn.length,
          })

          // Pass 3: Apply mutations if requested (only add new dependencies)
          const newDepIds = suggestedDependsOn
            .filter((d) => !d.alreadyIncluded)
            .map((d) => d.specId)

          if (input.apply && newDepIds.length > 0) {
            await this.deps.updatePersistedDeps.execute({
              specId: target.specId,
              add: newDepIds,
            })
            updatedSpecsCount += 1
            depsAddedCount += newDepIds.length
          }
        }

        // Post-apply validation & conditional change creation
        let postApplyValidation: PostApplyValidationDiagnostic | undefined

        if (input.apply && this.deps.validateSpecs) {
          input.onProgress?.({
            type: 'validation-start',
            message: 'Validating specifications consistency...',
          })
          const valRes = await this.deps.validateSpecs.execute({})
          const invalidSpecs = valRes.entries
            .filter((entry) => !entry.passed)
            .map((entry) => ({
              specId: entry.spec,
              failures: [
                ...entry.failures,
                ...entry.warnings.map((warning) => ({
                  artifactId: warning.artifactId,
                  description: `Warning: ${warning.description}`,
                })),
              ],
            }))

          if (invalidSpecs.length > 0) {
            const invalidSpecIds = invalidSpecs.map((s) => s.specId)
            let createdChangeInfo: CreatedAlignmentChangeInfo | undefined

            if (input.createAlignmentChange && this.deps.createChange) {
              const prefix = input.changeNamePrefix ?? 'align-spec-deps'
              const changeName = `${prefix}-${Date.now()}`
              const explorationContent = [
                `# Exploration: Spec Dependency Alignment`,
                ``,
                `The following specs require alignment after dependency application:`,
                ``,
                ...invalidSpecs.flatMap((s) => [
                  `## Spec: ${s.specId}`,
                  ...s.failures.map((f) => `- [${f.artifactId}]: ${f.description}`),
                  ``,
                ]),
              ].join('\n')
              const changeResult = await this.deps.createChange.execute({
                name: changeName,
                specIds: invalidSpecIds,
                explorationContent,
              })

              createdChangeInfo = {
                name: changeName,
                changePath: changeResult.changePath,
                specIds: invalidSpecIds,
              }
            }

            postApplyValidation = {
              status: 'invalid-specs-detected',
              invalidSpecs,
              suggestedAlignmentCommand: `node packages/cli/dist/index.js changes create align-spec-deps --spec ${invalidSpecIds.join(' --spec ')}`,
              ...(createdChangeInfo !== undefined ? { createdChange: createdChangeInfo } : {}),
            }
          } else {
            postApplyValidation = {
              status: 'all-valid',
              invalidSpecs: [],
            }
          }
          input.onProgress?.({
            type: 'validation-done',
            status: postApplyValidation?.status ?? 'all-valid',
          })
        }

        await specDepsCache.flush()

        const totalDepsCount = resultSpecs.reduce((acc, s) => acc + s.suggestedDependsOn.length, 0)
        input.onProgress?.({
          type: 'done',
          totalSpecs: resultSpecs.length,
          totalDependencies: totalDepsCount,
        })

        return {
          result: 'ok',
          ...(input.workspace ? { targetWorkspace: input.workspace } : {}),
          codeGraphStale,
          specs: resultSpecs,
          ...(input.apply
            ? {
                appliedMutations: {
                  updatedSpecsCount,
                  depsAddedCount,
                },
              }
            : {}),
          ...(postApplyValidation ? { postApplyValidation } : {}),
        }
      })
    } finally {
      if (this.deps.codeGraphProvider && typeof this.deps.codeGraphProvider.close === 'function') {
        await this.deps.codeGraphProvider.close().catch(() => {})
      }
    }
  }
}

/**
 * Factory function creating a `SuggestSpecDependencies` instance.
 *
 * @param deps - Dependencies instance
 * @returns Configured `SuggestSpecDependencies`
 */
export function createSuggestSpecDependencies(
  deps: SuggestSpecDependenciesDeps,
): SuggestSpecDependencies {
  return new SuggestSpecDependencies(deps)
}
