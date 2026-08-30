import { join, resolve, relative } from 'node:path'

import {
  type SpecRepository,
  type GetPersistedSpecImplementation,
  type UpdatePersistedSpecImplementation,
  type GetSpecMetadata,
  Logger,
  SpecNotFoundError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecPath,
} from '@specd/core'
import {
  type CodeGraphProvider,
  type AdapterRegistryPort,
  SymbolKind,
  type SymbolNode,
} from '@specd/code-graph'
import { z } from 'zod'
import {
  type ImplementationSuggestionLockData,
  type ImplementationSuggestionEntry,
  type ImplementationSuggestionSpecStamp,
} from '../../domain/value-objects/implementation-suggestion-cache.js'
import { type ImplementationSuggestionCachePort } from '../ports/implementation-suggestion-cache-port.js'
import { SpecSymbolClassifier } from '../../domain/services/spec-symbol-classifier.js'
import {
  extractMarkdownSymbolEvidence,
  type MarkdownEvidenceSource,
  SPEC_PROSE_KEYWORDS,
} from '../services/extract-markdown-symbol-evidence.js'

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Absolute or relative path to check.
 * @returns True when the path is accessible as a file.
 */
export interface SuggestionFileObserver {
  exists(filePath: string): Promise<boolean>
  readText(filePath: string): Promise<string>
}

const confidenceThresholdSchema = z
  .enum(['HIGH', 'MEDIUM', 'MED', 'LOW', 'high', 'medium', 'med', 'low'])
  .transform((val) => {
    const upper = val.toUpperCase()
    return upper === 'MED' ? 'MEDIUM' : (upper as 'HIGH' | 'MEDIUM' | 'LOW')
  })

/** Zod input schema for `SuggestImplementationLinks`. */
export const suggestImplementationLinksInputSchema = z
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
    confidenceThreshold: confidenceThresholdSchema.optional(),
    onProgress: z
      .custom<OnSuggestImplementationProgress>(
        (val) => val === undefined || typeof val === 'function',
      )
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

/** Progress event emitted during `SuggestImplementationLinks` execution. */
export type SuggestImplementationProgressEvent =
  | { type: 'stale-warning'; stale: boolean }
  | { type: 'discovery-start'; message: string }
  | { type: 'discovery-done'; totalSpecs: number }
  | { type: 'start'; totalSpecs: number }
  | { type: 'spec-start'; specId: string; index: number; totalSpecs: number }
  | { type: 'spec-done'; specId: string; candidatesCount: number }
  | { type: 'spec-error'; specId: string; error: string }
  | { type: 'done'; totalSpecs: number; totalSuggestions: number }

/** Callback invoked with progress events during suggestion analysis. */
export type OnSuggestImplementationProgress = (event: SuggestImplementationProgressEvent) => void

/** Input options for `SuggestImplementationLinks`. */
export interface SuggestImplementationLinksInput {
  /** Single target spec ID. */
  readonly specId?: string
  /** List of target spec IDs. */
  readonly specIds?: readonly string[]
  /** Target workspace filter. */
  readonly workspace?: string
  /** Whether to target all specs across workspaces. */
  readonly all?: boolean
  /** Whether to apply suggested links into spec-lock.json. */
  readonly apply?: boolean
  /** Force cache rebuild. */
  readonly rebuildCache?: boolean
  /** Confidence threshold filter. */
  readonly confidenceThreshold?: 'HIGH' | 'MEDIUM' | 'MED' | 'LOW'
  /** Optional progress callback. */
  readonly onProgress?: OnSuggestImplementationProgress
}

/** Implementation suggestion for a spec. */
export interface SpecImplementationSuggestion {
  readonly specId: string
  readonly title: string
  readonly existing: ImplementationSuggestionLockData
  readonly suggestions: readonly ImplementationSuggestionEntry[]
  /** Stamp of the analyzed spec content when it could be resolved. */
  readonly specStamp?: ImplementationSuggestionSpecStamp
}

/** Result of executing `SuggestImplementationLinks`. */
export interface SuggestImplementationLinksResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string
  readonly codeGraphStale?: boolean
  readonly specs: readonly SpecImplementationSuggestion[]
  readonly appliedMutations?: {
    readonly updatedSpecsCount: number
    readonly filesAddedCount: number
    readonly symbolsAddedCount: number
  }
}

/** Dependencies required by `SuggestImplementationLinks`. */
export interface SuggestImplementationLinksDeps {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly getPersistedImplementation: GetPersistedSpecImplementation
  readonly updatePersistedImplementation: UpdatePersistedSpecImplementation
  readonly getSpecMetadata?: GetSpecMetadata
  readonly symbolModelPort?: unknown
  readonly codeGraphProvider?: CodeGraphProvider
  readonly adapterRegistry: AdapterRegistryPort
  readonly cache?: ImplementationSuggestionCachePort
  readonly fileObserver: SuggestionFileObserver
  readonly projectDir?: string
  readonly workspaces?: readonly { readonly name: string; readonly codeRoot: string }[]
}

/**
 * Evaluates token alignment between a spec capability path and a candidate file path.
 *
 * @param specCapPath - Spec capability path or identifier
 * @param filePath - Candidate code file path
 * @returns Token coverage and missing distinctive token indications
 */
function computePathSpecAffinity(
  specCapPath: string,
  filePath: string,
): {
  readonly coverage: number
  readonly hasMissingSpecTokens: boolean
  readonly missingTokens: readonly string[]
} {
  const normalize = (t: string) => {
    const l = t.toLowerCase()
    return l.length > 2 && !l.endsWith('ss') ? l.replace(/s$/, '') : l
  }
  const splitRegex = /[\/\\_\-.:]+/
  const rawSpecTokens = specCapPath
    .split(splitRegex)
    .map(normalize)
    .filter((t) => t.length >= 2)

  const cleanPathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const pathTokens = cleanPathWithoutExt
    .split(splitRegex)
    .map(normalize)
    .filter((t) => t.length >= 2)

  const pathTokenSet = new Set(pathTokens)
  const missingTokens: string[] = []
  let matched = 0

  for (const st of rawSpecTokens) {
    if (
      pathTokenSet.has(st) ||
      (st.length >= 4 &&
        pathTokens.some((pt) => pt.length >= 4 && (pt.includes(st) || st.includes(pt))))
    ) {
      matched++
    } else {
      missingTokens.push(st)
    }
  }

  const coverage = rawSpecTokens.length > 0 ? matched / rawSpecTokens.length : 1
  return {
    coverage,
    hasMissingSpecTokens: missingTokens.length > 0,
    missingTokens,
  }
}

/**
 * Static-analysis orchestration use case to suggest implementation links for specs.
 */
export class SuggestImplementationLinks {
  /**
   * Creates an instance of SuggestImplementationLinks.
   *
   * @param deps - Injected dependencies
   */
  constructor(private readonly deps: SuggestImplementationLinksDeps) {}

  /**
   * Executes the suggestion analysis across target specs.
   *
   * @param input - Input query and execution options
   * @returns Suggestion results and optional mutation counts
   */
  async execute(input: SuggestImplementationLinksInput): Promise<SuggestImplementationLinksResult> {
    const parseResult = suggestImplementationLinksInputSchema.safeParse(input)
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
        .join('; ')
      throw new InvalidInputError(`Invalid SuggestImplementationLinks input: ${issues}`)
    }
    const validatedInput = parseResult.data

    if (validatedInput.workspace !== undefined) {
      if (!this.deps.specRepositories.has(validatedInput.workspace)) {
        throw new WorkspaceNotFoundError(validatedInput.workspace)
      }
    }

    const normalizedConfidence = validatedInput.confidenceThreshold

    const cache = this.deps.cache
    if (cache === undefined) {
      throw new InvalidInputError('SuggestImplementationLinks requires an injected cache port')
    }
    if (validatedInput.rebuildCache) {
      await cache.invalidate()
    }

    let shouldCloseCodeGraphProvider = false
    const codeGraphProvider = this.deps.codeGraphProvider
    const isCodeGraphProviderOpen =
      Boolean((codeGraphProvider as { isOpen?: unknown })?.isOpen) ||
      Boolean((codeGraphProvider as { _isOpen?: unknown })?._isOpen)
    if (
      codeGraphProvider &&
      typeof codeGraphProvider.open === 'function' &&
      !isCodeGraphProviderOpen
    ) {
      await codeGraphProvider.open().catch(() => {})
      shouldCloseCodeGraphProvider = true
    }

    let codeGraphStale = false
    const graphHealthProvider = codeGraphProvider as unknown as {
      getGraphHealth?: () => Promise<{
        stale?: boolean
        state?: string
        knownStaleSinceLastIndex?: boolean
        reasonCodes?: readonly string[]
      }>
    }
    if (codeGraphProvider && typeof graphHealthProvider.getGraphHealth === 'function') {
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

    return await cache.withLock(async () => {
      try {
        validatedInput.onProgress?.({
          type: 'discovery-start',
          message: 'Discovering specifications across workspaces...',
        })
        const targetSpecs: Array<{
          specId: string
          workspace: string
          path: string
          title: string
        }> = []

        for (const [wsName, repo] of this.deps.specRepositories.entries()) {
          if (validatedInput.workspace && validatedInput.workspace !== wsName) {
            continue
          }

          await new Promise<void>((resolve) => setImmediate(resolve))
          const listResult = await repo.list(undefined, { includeMeta: true, includeSummary: true })
          const entries = Array.isArray(listResult) ? listResult : (listResult?.items ?? [])
          for (const rawEntry of entries) {
            const entry = rawEntry as Record<string, unknown>
            const entryWorkspace = typeof entry.workspace === 'string' ? entry.workspace : ''
            const entryPath = typeof entry.path === 'string' ? entry.path : ''
            const entryTitle = typeof entry.title === 'string' ? entry.title : ''
            const specId = `${entryWorkspace}:${entryPath}`

            if (validatedInput.specId && validatedInput.specId !== specId) {
              continue
            }
            if (validatedInput.specIds && !validatedInput.specIds.includes(specId)) {
              continue
            }

            targetSpecs.push({
              specId,
              workspace: entryWorkspace,
              path: entryPath,
              title: entryTitle,
            })
          }
        }

        validatedInput.onProgress?.({ type: 'discovery-done', totalSpecs: targetSpecs.length })

        if (validatedInput.specId && !targetSpecs.some((s) => s.specId === validatedInput.specId)) {
          throw new SpecNotFoundError(validatedInput.specId)
        }
        if (validatedInput.specIds && validatedInput.specIds.length > 0) {
          for (const id of validatedInput.specIds) {
            if (!targetSpecs.some((s) => s.specId === id)) {
              throw new SpecNotFoundError(id)
            }
          }
        }

        const resultSpecs: SpecImplementationSuggestion[] = []
        let updatedSpecsCount = 0
        let filesAddedCount = 0
        let symbolsAddedCount = 0
        const symbolQueryCache = new Map<string, SymbolNode[]>()
        const fileCanonicalCache = new Map<string, string>()

        validatedInput.onProgress?.({ type: 'start', totalSpecs: targetSpecs.length })

        Logger.debug('[SuggestImplementationLinks] Target specs discovery complete', {
          totalSpecs: targetSpecs.length,
        })

        for (let index = 0; index < targetSpecs.length; index++) {
          const target = targetSpecs[index]!
          // Yield to event loop so CLI spinners and TTY output can animate smoothly
          await new Promise<void>((resolve) => setImmediate(resolve))
          validatedInput.onProgress?.({
            type: 'spec-start',
            specId: target.specId,
            index: index + 1,
            totalSpecs: targetSpecs.length,
          })
          Logger.debug('[SuggestImplementationLinks] Processing spec', {
            index: index + 1,
            totalSpecs: targetSpecs.length,
            specId: target.specId,
          })

          try {
            let suggestions: ImplementationSuggestionEntry[] = []
            let existingLockData: ImplementationSuggestionLockData = {
              files: [],
              symbols: [],
              dependsOn: [],
            }

            try {
              const existingImpl = await this.deps.getPersistedImplementation.execute({
                specId: target.specId,
              })
              const existingFiles = existingImpl.implementation.map((link) => link.file)
              const existingSymbols = existingImpl.implementation.flatMap(
                (link) => link.symbols ?? [],
              )
              existingLockData = {
                files: existingFiles,
                symbols: existingSymbols,
                dependsOn: [],
              }
            } catch {
              // If not initialized or missing lock
            }

            const cached = validatedInput.rebuildCache ? null : await cache.get(target.specId)

            let specStamp: ImplementationSuggestionSpecStamp | undefined
            if (cached) {
              suggestions = [...cached.suggestions]
              specStamp = cached.specStamp
            } else {
              const analysis = await this.analyzeSpec(
                target.workspace,
                target.path,
                target.title,
                symbolQueryCache,
              )
              suggestions = analysis.suggestions
              await cache.set(target.specId, {
                title: target.title,
                existing: existingLockData,
                suggestions,
                ...(analysis.realContentHash ? { specContentHash: analysis.realContentHash } : {}),
              })
              await cache.flush()
              if (analysis.lastModified || analysis.realContentHash) {
                specStamp = {
                  lastModified: analysis.lastModified,
                  hash: analysis.realContentHash,
                  ...(analysis.realContentSize !== undefined
                    ? { size: analysis.realContentSize }
                    : {}),
                  artifacts: [],
                }
              }
            }

            const filteredSuggestions = this.filterByConfidence(suggestions, normalizedConfidence)

            const canonicalExistingFiles = await Promise.all(
              existingLockData.files.map((f) =>
                this.toCanonicalWorkspacePath(f, fileCanonicalCache),
              ),
            )
            const existingFileSet = new Set(canonicalExistingFiles)

            const markedSuggestions = await Promise.all(
              filteredSuggestions.map(async (sug) => {
                const canonicalSugPath = await this.toCanonicalWorkspacePath(
                  sug.file,
                  fileCanonicalCache,
                )
                return {
                  ...sug,
                  file: canonicalSugPath,
                  alreadyIncluded: existingFileSet.has(canonicalSugPath),
                }
              }),
            )

            resultSpecs.push({
              specId: target.specId,
              title: target.title,
              existing: existingLockData,
              suggestions: markedSuggestions,
              ...(specStamp ? { specStamp } : {}),
            })

            validatedInput.onProgress?.({
              type: 'spec-done',
              specId: target.specId,
              candidatesCount: markedSuggestions.length,
            })
            Logger.debug('[SuggestImplementationLinks] Spec analysis complete', {
              specId: target.specId,
              suggestionsCount: markedSuggestions.length,
            })
          } catch (specError: unknown) {
            const errMsg = specError instanceof Error ? specError.message : String(specError)
            validatedInput.onProgress?.({
              type: 'spec-error',
              specId: target.specId,
              error: errMsg,
            })
            Logger.error(
              '[SuggestImplementationLinks] Failed analyzing spec during loop iteration',
              {
                specId: target.specId,
                workspace: target.workspace,
                path: target.path,
                error: errMsg,
                stack: specError instanceof Error ? specError.stack : undefined,
              },
            )
          }

          const lastResultSpec = resultSpecs.find((s) => s.specId === target.specId)
          if (validatedInput.apply && lastResultSpec && lastResultSpec.suggestions.length > 0) {
            let specMutated = false
            for (const sug of lastResultSpec.suggestions) {
              if (sug.alreadyIncluded) continue
              const updateInput =
                sug.symbols.length > 0
                  ? {
                      specId: target.specId,
                      action: 'add' as const,
                      file: sug.file,
                      symbols: sug.symbols,
                    }
                  : { specId: target.specId, action: 'add' as const, file: sug.file }
              const res = await this.deps.updatePersistedImplementation.execute(updateInput)
              if (res.created || res.implementation.length > 0) {
                specMutated = true
                filesAddedCount += 1
                symbolsAddedCount += sug.symbols.length
              }
            }
            if (specMutated) {
              updatedSpecsCount += 1
            }
          }
        }

        await cache.flush()

        const totalDiscovered = resultSpecs.reduce((acc, s) => acc + s.suggestions.length, 0)
        validatedInput.onProgress?.({
          type: 'done',
          totalSpecs: resultSpecs.length,
          totalSuggestions: totalDiscovered,
        })

        return {
          result: 'ok',
          ...(validatedInput.workspace ? { targetWorkspace: validatedInput.workspace } : {}),
          codeGraphStale,
          specs: resultSpecs,
          ...(validatedInput.apply
            ? {
                appliedMutations: {
                  updatedSpecsCount,
                  filesAddedCount,
                  symbolsAddedCount,
                },
              }
            : {}),
        }
      } finally {
        if (
          shouldCloseCodeGraphProvider &&
          codeGraphProvider &&
          typeof codeGraphProvider.close === 'function'
        ) {
          await codeGraphProvider.close().catch(() => {})
        }
      }
    })
  }

  /**
   * Filters suggestions based on confidence threshold.
   *
   * @param suggestions - Raw suggestion entries
   * @param threshold - Confidence threshold filter
   * @returns Filtered suggestion entries
   */
  private filterByConfidence(
    suggestions: ImplementationSuggestionEntry[],
    threshold?: 'HIGH' | 'MEDIUM' | 'LOW',
  ): ImplementationSuggestionEntry[] {
    if (!threshold) return suggestions
    if (threshold === 'HIGH') {
      return suggestions.filter((s) => s.confidence === 'HIGH')
    }
    if (threshold === 'MEDIUM') {
      return suggestions.filter((s) => s.confidence === 'HIGH' || s.confidence === 'MEDIUM')
    }
    return suggestions
  }

  /**
   * Resolves a file path string to its canonical workspace-qualified form using code-graph file data.
   *
   * @param pathString - File path with optional workspace prefix (e.g. 'core:src/file.ts' or 'core:packages/core/src/file.ts')
   * @param fileCanonicalCache - Optional in-memory cache for already-resolved canonical paths
   * @returns Canonical workspace path string
   */
  private async toCanonicalWorkspacePath(
    pathString: string,
    fileCanonicalCache?: Map<string, string>,
  ): Promise<string> {
    if (fileCanonicalCache && fileCanonicalCache.has(pathString)) {
      return fileCanonicalCache.get(pathString)!
    }
    const parts = pathString.split(':')
    if (parts.length < 2) {
      if (fileCanonicalCache) fileCanonicalCache.set(pathString, pathString)
      return pathString
    }
    const wsName = parts[0]!
    const relPath = parts.slice(1).join(':')

    let resolved = pathString
    if (this.deps.codeGraphProvider && typeof this.deps.codeGraphProvider.getFile === 'function') {
      try {
        const fileNode = await this.deps.codeGraphProvider.getFile(relPath)
        if (fileNode && fileNode.path) {
          resolved = `${fileNode.workspace}:${fileNode.path}`
        }
      } catch {
        // fallback
      }
    }

    if (resolved === pathString) {
      const wsConfig = this.deps.workspaces?.find((w) => w.name === wsName)
      if (wsConfig && wsConfig.codeRoot) {
        const projectDir = this.deps.projectDir ?? process.cwd()
        const codeRootAbs = resolve(projectDir, wsConfig.codeRoot)
        const absPath = relPath.startsWith('/') ? relPath : resolve(projectDir, relPath)
        if (absPath.startsWith(codeRootAbs)) {
          const wsRel = relative(codeRootAbs, absPath).replace(/\\/g, '/')
          resolved = `${wsName}:${wsRel}`
        }
      }
    }

    if (fileCanonicalCache) {
      fileCanonicalCache.set(pathString, resolved)
    }
    return resolved
  }

  /**
   * Caches findSymbols queries in memory during a SuggestImplementationLinks execution session.
   *
   * @param query - Symbol query filter (name, file path, or workspace)
   * @param query.name - Optional symbol name to match
   * @param query.filePath - Optional file path to filter by
   * @param query.workspace - Optional workspace to filter by
   * @param symbolQueryCache - Optional in-memory query cache for session-level lookups
   * @returns Matching symbols from the code graph
   */
  private async cachedFindSymbols(
    query: { name?: string; filePath?: string; workspace?: string },
    symbolQueryCache?: Map<string, SymbolNode[]>,
  ): Promise<SymbolNode[]> {
    if (!this.deps.codeGraphProvider) return []
    const cacheKey = `${query.workspace ?? '*'}:${query.filePath ?? ''}:${query.name ?? ''}`
    if (symbolQueryCache && symbolQueryCache.has(cacheKey)) {
      return symbolQueryCache.get(cacheKey)!
    }
    try {
      const results = await this.deps.codeGraphProvider.findSymbols(
        query as { name?: string; filePath?: string; workspace?: string },
      )
      const resArr = results ?? []
      if (symbolQueryCache) {
        symbolQueryCache.set(cacheKey, resArr)
      }
      return resArr
    } catch {
      if (symbolQueryCache) {
        symbolQueryCache.set(cacheKey, [])
      }
      return []
    }
  }

  /**
   * Analyzes spec markdown content and graph symbols to produce suggestions.
   *
   * @param workspace - Target workspace name
   * @param capPath - Target spec path
   * @param initialTitle - Optional pre-resolved title from spec list metadata
   * @param symbolQueryCache - In-memory query cache for session-level findSymbols lookups
   * @returns Array of implementation suggestion entries
   */
  private async analyzeSpec(
    workspace: string,
    capPath: string,
    initialTitle?: string,
    symbolQueryCache?: Map<string, SymbolNode[]>,
  ): Promise<{
    suggestions: ImplementationSuggestionEntry[]
    realContentHash: string
    lastModified: string
    realContentSize?: number
  }> {
    const repo = this.deps.specRepositories.get(workspace)
    if (!repo) return { suggestions: [], realContentHash: '', lastModified: '' }

    Logger.debug('[SuggestImplementationLinks] Analyzing spec', { workspace, capPath })

    const spec = await repo.get(SpecPath.parse(capPath))
    if (!spec) return { suggestions: [], realContentHash: '', lastModified: '' }

    let content = ''
    let realContentHash = ''
    let lastModified = ''
    let realContentSize: number | undefined

    const artifactsList =
      spec.artifacts && spec.artifacts.length > 0
        ? [...spec.artifacts].sort((a, b) => {
            if (a.filename === 'spec.md') return -1
            if (b.filename === 'spec.md') return 1
            return a.filename.localeCompare(b.filename)
          })
        : [{ filename: 'spec.md' }]

    if (typeof repo.artifact === 'function') {
      const loadedParts: string[] = []
      for (const art of artifactsList) {
        const loaded = await repo.artifact(spec, art.filename).catch(() => null)
        if (loaded?.content) {
          loadedParts.push(loaded.content)
        }
      }
      content = loadedParts.join('\n\n')
    }

    if (typeof repo.artifactMeta === 'function') {
      for (const art of artifactsList) {
        const meta = await repo
          .artifactMeta(spec, art.filename, { includeHash: true })
          .catch(() => null)
        if (meta?.hash) {
          realContentHash = realContentHash ? `${realContentHash}:${meta.hash}` : meta.hash
        }
        if (meta?.lastModified && (!lastModified || meta.lastModified > lastModified)) {
          lastModified = meta.lastModified
        }
        if (meta && typeof meta.size === 'number') {
          realContentSize = (realContentSize || 0) + meta.size
        }
      }
    }

    const extractedSymbols = new Set<string>()
    const sourceExtensions = this.deps.adapterRegistry.getSupportedExtensions()
    const supportedExtensions = new Set(sourceExtensions)
    const supportedLanguages = new Set(
      this.deps.adapterRegistry
        .getAdapters()
        .flatMap((a) => a.languages().map((l) => l.toLowerCase())),
    )
    const languageKeywords = new Set(
      Array.from(this.deps.adapterRegistry.getReservedKeywords()).map((k) => k.toLowerCase()),
    )

    const isReservedKeyword = (word: string): boolean =>
      SPEC_PROSE_KEYWORDS.has(word.toLowerCase()) || languageKeywords.has(word.toLowerCase())

    let specTitle = initialTitle ?? ''
    if (!specTitle && this.deps.getSpecMetadata) {
      try {
        const fullSpecId = workspace !== 'default' ? `${workspace}:${capPath}` : capPath
        const metaResult = await this.deps.getSpecMetadata.execute({ specId: fullSpecId })
        if (metaResult && metaResult.metadata && typeof metaResult.metadata.title === 'string') {
          specTitle = metaResult.metadata.title
        }
      } catch {
        // ignore metadata retrieval errors
      }
    }

    Logger.debug('[SuggestImplementationLinks] Resolved spec title', {
      workspace,
      capPath,
      specTitle,
    })

    const isCompoundIdentifier = (name: string): boolean => {
      return /[a-z0-9][A-Z]/.test(name) || name.includes('_')
    }

    const isCodeIdentifierCandidate = (term: string): boolean => {
      const clean = term.replace(/\(.*\)$/, '').trim()
      if (/\(.*\)$/.test(term.trim())) {
        return true
      }
      if (clean.includes('.')) {
        return true
      }
      if (/^[A-Z][A-Za-z0-9_]*$/.test(clean) && clean.length >= 3) {
        return true
      }
      if (/^[a-z][a-zA-Z0-9_]*$/.test(clean) && /[A-Z]/.test(clean) && clean.length >= 3) {
        return true
      }
      return false
    }

    const primaryTargetSymbols = new Set<string>()
    const ARCHITECTURAL_STOPWORDS = new Set([
      'port',
      'adapter',
      'service',
      'usecase',
      'use-case',
      'view',
      'entity',
      'valueobject',
      'value-object',
      'specification',
      'model',
      'interface',
      'class',
    ])

    if (specTitle) {
      const words: string[] = []
      const identRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g
      let tMatch: RegExpExecArray | null
      while ((tMatch = identRegex.exec(specTitle)) !== null) {
        const word = tMatch[0]
        if (
          word.length >= 3 &&
          !isReservedKeyword(word) &&
          /^[a-zA-Z]/.test(word) &&
          !ARCHITECTURAL_STOPWORDS.has(word.toLowerCase())
        ) {
          words.push(word)
          primaryTargetSymbols.add(word)
        }
      }
      if (words.length > 1) {
        const pascalCompound = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
        if (isCodeIdentifierCandidate(pascalCompound)) {
          extractedSymbols.add(pascalCompound)
          primaryTargetSymbols.add(pascalCompound)
        }
      }
    }

    const cleanCapPath = capPath.replace(/^\//, '')
    const nameOnly = cleanCapPath.split('/').pop() ?? cleanCapPath
    const cleanSpecSlug = nameOnly
    const kebabToPascal = (str: string): string =>
      str
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
    const kebabToCamel = (str: string): string => {
      const p = kebabToPascal(str)
      return p.charAt(0).toLowerCase() + p.slice(1)
    }
    const kebabToSnake = (str: string): string => str.replace(/-/g, '_')

    const slugPascal = kebabToPascal(cleanSpecSlug)
    const slugCamel = kebabToCamel(cleanSpecSlug)
    const slugSnake = kebabToSnake(cleanSpecSlug)

    if (slugPascal.length >= 3 && !ARCHITECTURAL_STOPWORDS.has(slugPascal.toLowerCase())) {
      primaryTargetSymbols.add(slugPascal)
      extractedSymbols.add(slugPascal)
      extractedSymbols.add(slugCamel)
      extractedSymbols.add(slugSnake)

      // Common universal function / factory / handler prefixes across languages
      for (const prefix of ['register', 'create', 'get', 'handle', 'parse', 'resolve']) {
        extractedSymbols.add(`${prefix}${slugPascal}`)
        primaryTargetSymbols.add(`${prefix}${slugPascal}`)
        extractedSymbols.add(`${prefix}_${slugSnake}`)
        primaryTargetSymbols.add(`${prefix}_${slugSnake}`)
      }
      extractedSymbols.add(`New${slugPascal}`)
      primaryTargetSymbols.add(`New${slugPascal}`)
    }

    const mdastEvidence = extractMarkdownSymbolEvidence({
      markdown: content,
      supportedExtensions,
      supportedLanguages,
      reservedKeywords: languageKeywords,
    })

    const fullSpecIdentifier = workspace !== 'default' ? `${workspace}:${capPath}` : capPath
    const classifiedSymbols = SpecSymbolClassifier.classify(content, fullSpecIdentifier)
    for (const owned of classifiedSymbols.ownedSymbols) {
      primaryTargetSymbols.add(owned)
      extractedSymbols.add(owned)
    }

    const symbolEvidenceMap = new Map<
      string,
      { source: MarkdownEvidenceSource; reason: string; bonus: number }
    >()

    const derivedPaths: string[] = []
    const wsConfig = this.deps.workspaces?.find((w) => w.name === workspace)
    const wsCodeRoot = wsConfig?.codeRoot
      ? wsConfig.codeRoot.replace(/^\.\//, '')
      : workspace !== 'default'
        ? `packages/${workspace}`
        : ''

    for (const ev of mdastEvidence) {
      if (ev.kind === 'file-path') {
        const cleanWord = ev.candidate
        const cleanFileName = cleanWord.split('/').pop() ?? cleanWord
        derivedPaths.push(`${workspace}:${cleanWord}`)
        if (wsCodeRoot) {
          derivedPaths.push(`${workspace}:${wsCodeRoot}/${cleanWord}`)
          derivedPaths.push(`${workspace}:${wsCodeRoot}/src/${cleanFileName}`)
        } else {
          derivedPaths.push(`${workspace}:src/${cleanFileName}`)
        }
      } else if (ev.kind === 'symbol') {
        if (ev.source === 'fenced-code') {
          extractedSymbols.add(ev.candidate)
          symbolEvidenceMap.set(ev.candidate, {
            source: 'fenced-code',
            reason: 'fenced-code-evidence',
            bonus: 30,
          })
        } else if (ev.source === 'inline-code') {
          extractedSymbols.add(ev.candidate)
          symbolEvidenceMap.set(ev.candidate, {
            source: 'inline-code',
            reason: 'inline-code-evidence',
            bonus: 20,
          })
        } else if (ev.source === 'prose') {
          // Gate prose evidence through code graph in the target workspace
          let isResolvedInWorkspace = false
          if (this.deps.codeGraphProvider) {
            try {
              const query: { name: string; workspace?: string } = { name: ev.candidate }
              if (workspace !== 'default') {
                query.workspace = workspace
              }
              const found = await this.cachedFindSymbols(query, symbolQueryCache)
              if (found && found.length > 0) {
                isResolvedInWorkspace = true
              }
            } catch {
              // ignore
            }
          }
          if (isResolvedInWorkspace) {
            extractedSymbols.add(ev.candidate)
            symbolEvidenceMap.set(ev.candidate, {
              source: 'prose',
              reason: 'prose-symbol-evidence',
              bonus: 5,
            })
          }
        }
      }
    }

    // Generic candidate path exploration across common project source directories
    const searchSubdirs = [
      '',
      'src',
      'src/commands',
      'src/commands/spec',
      'src/commands/workflow',
      'src/core',
      'src/core/artifact-graph',
      'src/core/templates',
      'src/utils',
      'src/services',
      'src/helpers',
      'src/ports',
      'src/adapters',
      'src/application',
      'src/application/use-cases',
      'src/domain',
      'src/domain/services',
      'src/domain/entities',
      'src/orchestration',
      'src/infrastructure',
      'core',
      'utils',
      'lib',
      'pkg',
      'app',
      'cmd',
      'internal',
    ]

    const pathVariants = new Set<string>()
    pathVariants.add(cleanCapPath)
    pathVariants.add(nameOnly)
    pathVariants.add(cleanSpecSlug)
    if (nameOnly.includes('-')) {
      const parts = nameOnly.split('-')
      if (parts.length > 1) {
        pathVariants.add(parts[0]!)
        pathVariants.add(`${parts[0]}/${parts[1]}`)
        pathVariants.add(`${parts[0]}-${parts[1]}`)
        pathVariants.add(parts.slice(1).join('-'))
        pathVariants.add(`${parts[0]}/${parts.slice(1).join('-')}`)
      }
    }

    // Validate each candidate source directory once before expanding its
    // variants and extensions so the full cross product is never probed.
    const projectRoot = this.deps.projectDir ?? '.'
    const validPrefixes = new Set<string>()
    for (const subdir of searchSubdirs) {
      const prefixes = wsCodeRoot
        ? [subdir ? `${wsCodeRoot}/${subdir}` : wsCodeRoot, subdir]
        : [subdir]
      for (const prefix of prefixes) {
        if (prefix === '' || (await this._fileExists(join(projectRoot, prefix)))) {
          validPrefixes.add(prefix)
        }
      }
    }

    for (const prefix of validPrefixes) {
      for (const variant of pathVariants) {
        const rel = prefix ? `${prefix}/${variant}` : variant
        for (const ext of sourceExtensions) {
          derivedPaths.push(`${workspace}:${rel}${ext}`)
        }
      }
    }

    Logger.debug('[SuggestImplementationLinks] Pass 1 Extracted Symbols & Derived Paths', {
      workspace,
      capPath,
      extractedSymbolsCount: extractedSymbols.size,
      extractedSymbols: Array.from(extractedSymbols),
      primaryTargetSymbols: Array.from(primaryTargetSymbols),
      derivedPathsCount: derivedPaths.length,
      derivedPaths,
    })

    const suggestionMap = new Map<
      string,
      { symbols: Set<string>; score: number; reasons: Set<string> }
    >()

    if (this.deps.codeGraphProvider) {
      await new Promise<void>((resolve) => setImmediate(resolve))
      for (const symbol of extractedSymbols) {
        try {
          const symbolQuery: { name: string; workspace?: string } = { name: symbol }
          if (workspace !== 'default') {
            symbolQuery.workspace = workspace
          }
          const graphSymbols = await this.cachedFindSymbols(symbolQuery, symbolQueryCache)
          for (const gSym of graphSymbols) {
            const symObj = gSym as unknown as Record<string, unknown>
            const symKind = symObj.kind ?? gSym.kind
            if (symKind === SymbolKind.Variable || symKind === 'variable') {
              continue
            }
            const locObj = symObj.location as Record<string, unknown> | undefined
            const relPath =
              typeof locObj?.filePath === 'string'
                ? locObj.filePath
                : typeof symObj.filePath === 'string'
                  ? symObj.filePath
                  : ''
            if (!relPath) {
              continue
            }
            if (workspace !== 'default') {
              if (relPath.includes(':')) {
                const symWs = relPath.split(':')[0]
                if (symWs !== workspace) {
                  continue
                }
              }
              const tempClean = relPath.replace(/^[^:]+:/, '')
              if (tempClean.startsWith('packages/')) {
                const pkgName = tempClean.split('/')[1]
                if (pkgName !== workspace) {
                  continue
                }
              }
            }
            let cleanRelPath = relPath.replace(/^[^:]+:/, '')
            if (
              workspace !== 'default' &&
              !cleanRelPath.startsWith('packages/') &&
              !cleanRelPath.startsWith('apps/') &&
              !cleanRelPath.startsWith('dev/') &&
              !cleanRelPath.includes('config.')
            ) {
              cleanRelPath = `packages/${workspace}/${cleanRelPath}`
            }
            if (
              cleanRelPath.includes('/test/') ||
              cleanRelPath.startsWith('test/') ||
              cleanRelPath.endsWith('.spec.ts') ||
              cleanRelPath.endsWith('.test.ts') ||
              (workspace !== 'default' &&
                (cleanRelPath.startsWith('dev/') || cleanRelPath.includes('config.')))
            ) {
              continue
            }
            const fullDiskPath = join(this.deps.projectDir ?? '.', cleanRelPath)
            if (!(await this._fileExists(fullDiskPath))) {
              continue
            }
            const filePath = `${workspace}:${cleanRelPath}`
            const existing = suggestionMap.get(filePath) ?? {
              symbols: new Set(),
              score: 0,
              reasons: new Set(),
            }
            existing.symbols.add(symbol)

            const fileBaseName =
              cleanRelPath
                .split('/')
                .pop()
                ?.replace(/\.[^.]+$/, '')
                .toLowerCase() ?? ''
            const symName = (gSym.name ?? symbol).toLowerCase()

            const isExactPrimaryMatch = Array.from(primaryTargetSymbols).some((p) => {
              return symName === p.toLowerCase()
            })

            const isDerivativeMatch =
              !isExactPrimaryMatch &&
              Array.from(primaryTargetSymbols).some((p) => {
                const pLower = p.toLowerCase()
                if (pLower.length >= 6 && (symName.startsWith(pLower) || symName.endsWith(pLower)))
                  return true
                if (
                  fileBaseName === cleanSpecSlug &&
                  (symName.includes(pLower) || pLower.includes(symName))
                )
                  return true
                return false
              })

            if (isExactPrimaryMatch) {
              existing.score += 200
              existing.reasons.add('exact-primary-symbol-match')
            } else if (isDerivativeMatch) {
              existing.score += 50
              existing.reasons.add('derivative-symbol-match')
            } else {
              existing.score += 20
              existing.reasons.add('secondary-symbol-match')
            }

            const affinity = computePathSpecAffinity(capPath, cleanRelPath)

            const isFilenameMatch =
              (fileBaseName === cleanSpecSlug ||
                (cleanSpecSlug.length >= 6 && fileBaseName.endsWith(cleanSpecSlug)) ||
                (cleanSpecSlug.length >= 6 && fileBaseName.startsWith(cleanSpecSlug))) &&
              !affinity.hasMissingSpecTokens

            if (isFilenameMatch) {
              existing.score += 150
              existing.reasons.add('filename-slug-match')
            }

            if (affinity.coverage === 1) {
              existing.score += 100
              existing.reasons.add('exact-token-affinity')
            } else if (affinity.hasMissingSpecTokens) {
              existing.score -= affinity.missingTokens.length * 150
              existing.reasons.add('missing-distinctive-tokens')
            }

            suggestionMap.set(filePath, existing)
          }
        } catch {
          // Fallback if graph query fails
        }
      }
    }

    await new Promise<void>((resolve) => setImmediate(resolve))
    for (const dPath of derivedPaths) {
      const cleanRelPath = dPath.replace(/^[^:]+:/, '')
      const fullDiskPath = join(this.deps.projectDir ?? '.', cleanRelPath)
      if (!(await this._fileExists(fullDiskPath))) {
        continue
      }
      const affinity = computePathSpecAffinity(capPath, cleanRelPath)
      if (affinity.coverage >= 0.75 && !affinity.hasMissingSpecTokens) {
        const existing = suggestionMap.get(dPath)
        if (existing) {
          existing.score += 100
          existing.reasons.add('naming-derivative-match')
        } else {
          const cleanFileName =
            cleanRelPath
              .split('/')
              .pop()
              ?.replace(/\.[^.]+$/, '') ?? ''
          const entrySymbols = new Set<string>()
          for (const sym of extractedSymbols) {
            if (cleanFileName.toLowerCase().includes(sym.toLowerCase())) {
              entrySymbols.add(sym)
            }
          }
          suggestionMap.set(dPath, {
            symbols: entrySymbols,
            score: 100,
            reasons: new Set(['naming-derivative-match']),
          })
        }
      } else if (this.deps.codeGraphProvider && affinity.coverage >= 0.3) {
        // Hierarchical fallback: file path matches domain prefix (e.g. schema.ts)
        // Check if missing distinctive sub-tokens (e.g. 'which') exist inside candidate file via code-graph search
        const genericNoise = new Set([
          'command',
          'spec',
          'specification',
          'feature',
          'service',
          'handler',
          'endpoint',
          'controller',
          'port',
          'adapter',
          'usecase',
        ])
        const distinctiveMissing = affinity.missingTokens.filter(
          (t) => !genericNoise.has(t) && t.length >= 3,
        )
        if (distinctiveMissing.length > 0) {
          let allFound = true
          for (const mToken of distinctiveMissing) {
            let tokenFound = false
            try {
              if (await this._fileExists(fullDiskPath)) {
                const diskContent = (await this._readText(fullDiskPath)).toLowerCase()
                if (diskContent.includes(mToken.toLowerCase())) {
                  tokenFound = true
                }
              }
            } catch {
              // ignore
            }
            if (!tokenFound && typeof this.deps.codeGraphProvider?.search === 'function') {
              try {
                const searchRes = await this.deps.codeGraphProvider.search({
                  query: mToken,
                  categories: ['files', 'symbols'],
                  filePattern: `*${cleanRelPath}`,
                  workspace: workspace !== 'default' ? workspace : undefined,
                  limit: 5,
                  includeSnippet: false,
                })
                if (
                  (searchRes?.files && searchRes.files.length > 0) ||
                  (searchRes?.symbols && searchRes.symbols.length > 0)
                ) {
                  tokenFound = true
                }
              } catch {
                // ignore
              }
            }
            if (!tokenFound) {
              allFound = false
              break
            }
          }
          if (allFound) {
            const existing = suggestionMap.get(dPath) ?? {
              symbols: new Set(),
              score: 0,
              reasons: new Set(),
            }
            existing.score += 160
            existing.reasons.add('subtoken-content-match')
            existing.reasons.add('exact-token-affinity')
            try {
              const declared = await this.cachedFindSymbols(
                { filePath: cleanRelPath },
                symbolQueryCache,
              )
              for (const d of declared) {
                if (d.name && isCodeIdentifierCandidate(d.name)) {
                  existing.symbols.add(d.name)
                }
              }
            } catch {
              // ignore
            }
            if (existing.symbols.size === 0) {
              const cleanFileName =
                cleanRelPath
                  .split('/')
                  .pop()
                  ?.replace(/\.[^.]+$/, '') ?? ''
              existing.symbols.add(cleanFileName)
            }
            suggestionMap.set(dPath, existing)
          }
        }
      }
    }

    // Tier 3 Fallback: If Tiers 1 and 2 yielded 0 candidates, search for distinctive syntax tags and requirement keywords
    if (suggestionMap.size === 0 && this.deps.codeGraphProvider && content) {
      await new Promise<void>((resolve) => setImmediate(resolve))
      const distinctiveTags = new Set<string>()
      const tagRegex = /<([a-zA-Z_][a-zA-Z0-9_-]*)>/g
      let tagMatch: RegExpExecArray | null
      while ((tagMatch = tagRegex.exec(content)) !== null) {
        const tag = tagMatch[1]
        if (
          tag &&
          tag.length >= 3 &&
          !['br', 'div', 'span', 'p', 'pre', 'code', 'table'].includes(tag.toLowerCase())
        ) {
          distinctiveTags.add(`<${tag}>`)
          distinctiveTags.add(tag)
        }
      }

      const reqRegex = /###\s+Requirement:\s+(.+)/gi
      let reqMatch: RegExpExecArray | null
      while ((reqMatch = reqRegex.exec(content)) !== null) {
        const reqTitle = reqMatch[1] ?? ''
        const words = reqTitle
          .split(/\s+/)
          .map((w) => w.replace(/[^a-zA-Z0-9_-]/g, ''))
          .filter((w) => w.length >= 4 && !isReservedKeyword(w.toLowerCase()))
        for (const w of words) {
          distinctiveTags.add(w)
        }
      }

      const fileHits = new Map<string, { count: number; terms: Set<string> }>()
      for (const queryTerm of distinctiveTags) {
        await new Promise<void>((resolve) => setImmediate(resolve))
        try {
          const searchRes =
            typeof this.deps.codeGraphProvider.search === 'function'
              ? await this.deps.codeGraphProvider.search({
                  query: queryTerm,
                  categories: ['files', 'symbols'],
                  workspace: workspace !== 'default' ? workspace : undefined,
                  limit: 10,
                  includeSnippet: false,
                })
              : null

          for (const f of searchRes?.files ?? []) {
            const rawPath = f.file.path
            const cleanPath = rawPath.replace(/^[^:]+:/, '')
            if (
              cleanPath.includes('/test/') ||
              cleanPath.startsWith('test/') ||
              cleanPath.endsWith('.spec.ts') ||
              cleanPath.endsWith('.test.ts') ||
              cleanPath.startsWith('dev/') ||
              cleanPath.endsWith('.config.ts') ||
              cleanPath.endsWith('.config.js') ||
              cleanPath.endsWith('.config.mjs') ||
              cleanPath.includes('eslint') ||
              cleanPath.includes('robots.ts')
            ) {
              continue
            }
            const fullDiskPath = join(this.deps.projectDir ?? '.', cleanPath)
            if (!(await this._fileExists(fullDiskPath))) continue

            const filePathKey = `${workspace}:${cleanPath}`
            const current = fileHits.get(filePathKey) ?? { count: 0, terms: new Set() }
            current.count++
            current.terms.add(queryTerm)
            fileHits.set(filePathKey, current)
          }
        } catch {
          // ignore
        }
      }

      // Sort candidate files by co-occurrence count and keep top matches
      const sortedHits = Array.from(fileHits.entries()).sort((a, b) => b[1].count - a[1].count)
      for (const [filePathKey, hitData] of sortedHits.slice(0, 5)) {
        const cleanPath = filePathKey.replace(/^[^:]+:/, '')
        const hasTagMatch = Array.from(hitData.terms).some(
          (t) => t.startsWith('<') && t.endsWith('>'),
        )
        if (hitData.count >= 2 || hasTagMatch) {
          const entrySymbols = new Set<string>()
          const cleanFileName =
            cleanPath
              .split('/')
              .pop()
              ?.replace(/\.[^.]+$/, '') ?? ''
          entrySymbols.add(cleanFileName)
          const fallbackScore = Math.min(140, 80 + hitData.count * 15)
          suggestionMap.set(filePathKey, {
            symbols: entrySymbols,
            score: fallbackScore,
            reasons: new Set(['fallback-content-co-occurrence', 'exact-token-affinity']),
          })
        }
      }
    }

    Logger.debug(
      '[SuggestImplementationLinks] Candidate map after graph queries & derived path correlation',
      {
        workspace,
        capPath,
        candidatesCount: suggestionMap.size,
        candidates: Array.from(suggestionMap.entries()).map(([file, d]) => ({
          file,
          score: d.score,
          symbols: Array.from(d.symbols),
          reasons: Array.from(d.reasons),
        })),
      },
    )

    if (this.deps.codeGraphProvider) {
      for (const [filePath, data] of suggestionMap.entries()) {
        const cleanRelPath = filePath.replace(/^[^:]+:/, '')
        const shortRelPath = cleanRelPath.replace(/^packages\/[^/]+\//, '')
        try {
          const declaredNodes1 = await this.cachedFindSymbols(
            { filePath: cleanRelPath },
            symbolQueryCache,
          )
          const declaredNodes2 = await this.cachedFindSymbols(
            { filePath: shortRelPath },
            symbolQueryCache,
          )
          const declaredNodes3 = await this.cachedFindSymbols(
            { filePath: filePath },
            symbolQueryCache,
          )
          const declaredNodes4 = await this.cachedFindSymbols(
            { filePath: `*${cleanRelPath}` },
            symbolQueryCache,
          )
          const allNodesRaw = [
            ...declaredNodes1,
            ...declaredNodes2,
            ...declaredNodes3,
            ...declaredNodes4,
          ]
          const seenNodeIds = new Set<string>()
          const allNodes: SymbolNode[] = []
          for (const n of allNodesRaw) {
            const k =
              n.id ?? `${n.name}:${String((n as unknown as Record<string, unknown>).filePath)}`
            if (!seenNodeIds.has(k)) {
              seenNodeIds.add(k)
              allNodes.push(n)
            }
          }

          if (
            specTitle &&
            allNodes.length > 0 &&
            !data.reasons.has('subtoken-content-match') &&
            !data.reasons.has('filename-slug-match') &&
            !data.reasons.has('fallback-content-co-occurrence')
          ) {
            const titleWords: string[] = []
            const identRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g
            let tMatch: RegExpExecArray | null
            while ((tMatch = identRegex.exec(specTitle)) !== null) {
              const word = tMatch[0]
              if (word.length >= 3 && !isReservedKeyword(word) && /^[a-zA-Z]/.test(word)) {
                titleWords.push(word)
              }
            }
            const pascalCompound =
              titleWords.length > 1
                ? titleWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
                : ''
            const compoundLower = pascalCompound.toLowerCase()

            const hasTitleMatch = allNodes.some((n) => {
              const nameLower = n.name.toLowerCase()
              if (
                compoundLower &&
                (nameLower === compoundLower ||
                  nameLower.includes(compoundLower) ||
                  compoundLower.includes(nameLower))
              ) {
                return true
              }
              if (titleWords.length > 1) {
                return titleWords.every((word) => nameLower.includes(word.toLowerCase()))
              }
              if (titleWords.length === 1) {
                const singleWord = titleWords[0]!.toLowerCase()
                return nameLower === singleWord || nameLower.includes(singleWord)
              }
              return false
            })

            if (!hasTitleMatch) {
              Logger.debug(
                '[SuggestImplementationLinks] Discarding candidate file lacking spec title symbol match',
                {
                  filePath,
                  specTitle,
                  declaredSymbols: allNodes.map((n) => n.name),
                },
              )
              suggestionMap.delete(filePath)
              continue
            }
          }

          const topLevelNodeNames = new Set(
            allNodes
              .filter(
                (n) =>
                  !n.parentId &&
                  (n as unknown as Record<string, unknown>).parentSymbolId === undefined,
              )
              .map((n) => n.name),
          )

          const nodeById = new Map<string, (typeof allNodes)[0]>()
          const nodeByName = new Map<string, (typeof allNodes)[0][]>()
          for (const n of allNodes) {
            if (n.id) nodeById.set(n.id, n)
            const list = nodeByName.get(n.name) ?? []
            list.push(n)
            nodeByName.set(n.name, list)
          }

          const verifiedSymbols = new Set<string>()
          for (const sym of data.symbols) {
            if (!isCodeIdentifierCandidate(sym)) {
              continue
            }
            if (!isCompoundIdentifier(sym) && !topLevelNodeNames.has(sym)) {
              continue
            }
            const matchingNodes = nodeByName.get(sym) ?? []
            if (matchingNodes.length === 0) {
              verifiedSymbols.add(sym)
            } else {
              for (const node of matchingNodes) {
                const parentId =
                  node.parentId ??
                  ((node as unknown as Record<string, unknown>).parentSymbolId as
                    | string
                    | undefined)
                if (!parentId) {
                  verifiedSymbols.add(sym)
                } else {
                  const parentNode = nodeById.get(parentId)
                  if (parentNode) {
                    if (extractedSymbols.has(parentNode.name) || extractedSymbols.has(sym)) {
                      if (
                        isCompoundIdentifier(parentNode.name) ||
                        topLevelNodeNames.has(parentNode.name)
                      ) {
                        verifiedSymbols.add(parentNode.name)
                      }
                    }
                  }
                }
              }
            }
          }

          for (const sym of extractedSymbols) {
            if (!isCodeIdentifierCandidate(sym)) {
              continue
            }
            if (!isCompoundIdentifier(sym) && !topLevelNodeNames.has(sym)) {
              continue
            }
            const matchingNodes = nodeByName.get(sym) ?? []
            for (const node of matchingNodes) {
              const parentId =
                node.parentId ??
                ((node as unknown as Record<string, unknown>).parentSymbolId as string | undefined)
              if (!parentId) {
                verifiedSymbols.add(sym)
              }
            }
          }

          if (verifiedSymbols.size === 0 && allNodes.length > 0) {
            for (const n of allNodes) {
              const parentId =
                n.parentId ??
                ((n as unknown as Record<string, unknown>).parentSymbolId as string | undefined)
              if (!parentId && isCodeIdentifierCandidate(n.name)) {
                verifiedSymbols.add(n.name)
              }
            }
          }

          if (verifiedSymbols.size === 0) {
            for (const s of data.symbols) {
              if (isCodeIdentifierCandidate(s)) {
                verifiedSymbols.add(s)
              }
            }
          }

          if (verifiedSymbols.size === 0) {
            suggestionMap.delete(filePath)
            continue
          }

          suggestionMap.set(filePath, { ...data, symbols: verifiedSymbols })
        } catch {
          // Fallback if findSymbols by filePath fails
        }
      }
    }

    const suggestions: ImplementationSuggestionEntry[] = []
    for (const [file, data] of suggestionMap.entries()) {
      if (data.symbols.size === 0) {
        continue
      }
      let maxEvidence: { reason: string; bonus: number } | null = null
      for (const sym of data.symbols) {
        const ev = symbolEvidenceMap.get(sym)
        if (ev && (!maxEvidence || ev.bonus > maxEvidence.bonus)) {
          maxEvidence = ev
        }
      }
      if (maxEvidence && !data.reasons.has(maxEvidence.reason)) {
        data.score += maxEvidence.bonus
        data.reasons.add(maxEvidence.reason)
      }

      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
      const hasExactTokenOrSlug =
        data.reasons.has('exact-token-affinity') || data.reasons.has('filename-slug-match')
      const hasPrimarySymbol = data.reasons.has('exact-primary-symbol-match')
      const isCleanAffinity = !data.reasons.has('missing-distinctive-tokens')

      if (data.score >= 150 && (hasPrimarySymbol || hasExactTokenOrSlug) && isCleanAffinity) {
        confidence = 'HIGH'
      } else if (data.score >= 80) {
        confidence = 'MEDIUM'
      }

      suggestions.push({
        file,
        symbols: Array.from(data.symbols),
        confidence,
        reasons: Array.from(data.reasons),
        score: data.score,
        alreadyIncluded: false,
      })
    }

    const sortedSuggestions = suggestions.sort((a, b) => b.score - a.score)

    Logger.debug('[SuggestImplementationLinks] Final implementation suggestions for spec', {
      workspace,
      capPath,
      suggestionsCount: sortedSuggestions.length,
      suggestions: sortedSuggestions,
    })

    return {
      suggestions: sortedSuggestions,
      realContentHash,
      lastModified,
      ...(realContentSize !== undefined ? { realContentSize } : {}),
    }
  }

  /**
   * Observes file existence through an injected edge dependency.
   *
   * @param filePath - Candidate source path
   * @returns Whether the candidate exists
   */
  private async _fileExists(filePath: string): Promise<boolean> {
    return this.deps.fileObserver.exists(filePath)
  }

  /**
   * Reads source text through an injected edge dependency.
   *
   * @param filePath - Candidate source path
   * @returns Source text
   */
  private async _readText(filePath: string): Promise<string> {
    return this.deps.fileObserver.readText(filePath)
  }
}

/**
 * Factory function creating a `SuggestImplementationLinks` instance.
 *
 * @param deps - Dependencies instance
 * @returns Configured `SuggestImplementationLinks`
 * @throws {InvalidInputError} When the required file-observation port is absent
 */
export function createSuggestImplementationLinks(
  deps: SuggestImplementationLinksDeps,
): SuggestImplementationLinks {
  if (deps.adapterRegistry === undefined) {
    throw new InvalidInputError('SuggestImplementationLinks requires an injected adapter registry')
  }
  if (deps.fileObserver === undefined) {
    throw new InvalidInputError(
      'SuggestImplementationLinks requires an injected file-observation port',
    )
  }
  return new SuggestImplementationLinks(deps)
}
