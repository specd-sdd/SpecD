import {
  type SpecRepository,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecPath,
  Logger,
} from '@specd/core'
import {
  type CodeGraphProvider,
  type AdapterRegistryPort,
  type SymbolNode,
  type FileNode,
} from '@specd/code-graph'
import { z } from 'zod'
export {
  type CandidateSpec,
  type SuggestSpecsResult,
  type AnchorSymbol,
  type HotspotSummary,
} from '../../domain/value-objects/candidate-spec.js'
import {
  type CandidateSpec,
  type SuggestSpecsResult,
  type AnchorSymbol,
  type HotspotSummary,
  type SpecCategory,
} from '../../domain/value-objects/candidate-spec.js'
import { CapabilityClusteringEngine } from '../../domain/services/capability-clustering-engine.js'
import { SpecSymbolClassifier } from '../../domain/services/spec-symbol-classifier.js'
import { DependencyInferenceEngine } from '../../domain/services/dependency-inference-engine.js'
import { TransitiveReductionEngine } from '../../domain/services/transitive-reduction-engine.js'
import { ConfidenceScorer } from '../../domain/services/confidence-scorer.js'
import {
  type SuggestionFileObserver,
  type SuggestImplementationLinks,
  type SuggestImplementationProgressEvent,
} from './suggest-implementation-links.js'
import { type ImplementationSuggestionCachePort } from '../ports/implementation-suggestion-cache-port.js'

/**
 * Progress event emitted during SuggestSpecs execution.
 */
export type SuggestSpecsProgressEvent =
  | { type: 'start'; message: string }
  | { type: 'indexing-check'; message: string }
  | { type: 'stale-warning'; stale: boolean }
  | { type: 'warmup-start'; message: string }
  | { type: 'warmup-progress'; event: SuggestImplementationProgressEvent }
  | { type: 'warmup-done'; totalSpecs: number }
  | { type: 'gap-audit-start'; totalSpecs: number }
  | { type: 'clustering-start'; totalFiles: number }
  | { type: 'done'; totalSpecsSuggested: number }

/**
 * Callback invoked with progress events during analysis.
 */
export type OnSuggestSpecsProgress = (event: SuggestSpecsProgressEvent) => void

/**
 * Input options for SuggestSpecs.
 */
export interface SuggestSpecsInput {
  readonly startDir?: string
  readonly workspaceFilter?: string | string[]
  readonly ignoreCurrentSpecs?: boolean
  readonly minConfidence?: number
  readonly limit?: number
  readonly rebuildCache?: boolean
  readonly onProgress?: OnSuggestSpecsProgress
}

/**
 * Zod validation schema for SuggestSpecsInput.
 */
export const suggestSpecsInputSchema = z
  .object({
    startDir: z.string().optional(),
    workspaceFilter: z
      .union([z.string().min(1, 'workspaceFilter cannot be empty'), z.array(z.string().min(1))])
      .optional(),
    ignoreCurrentSpecs: z.boolean().optional(),
    minConfidence: z
      .number()
      .min(0, 'minConfidence must be between 0.0 and 1.0')
      .max(1, 'minConfidence must be between 0.0 and 1.0')
      .optional(),
    limit: z.number().int().min(1, 'limit must be >= 1').optional(),
    rebuildCache: z.boolean().optional(),
    onProgress: z
      .custom<OnSuggestSpecsProgress>((val) => val === undefined || typeof val === 'function')
      .optional(),
  })
  .strict()

/**
 * Injected dependencies required by SuggestSpecs.
 */
export interface SuggestSpecsDeps {
  readonly codeGraphProvider?: CodeGraphProvider
  readonly adapterRegistry: AdapterRegistryPort
  readonly fileObserver: SuggestionFileObserver
  readonly projectDir?: string
  readonly specRepositories?: ReadonlyMap<string, SpecRepository>
  readonly implementationCache?: ImplementationSuggestionCachePort
  readonly suggestImplementationLinks?: SuggestImplementationLinks
}

/**
 * Determines whether a code symbol is structurally substantive and eligible for specification.
 * Discards private helpers, internal variables, getters/setters, and anonymous lambdas.
 *
 * @param sym - Symbol node from the code graph
 * @returns `true` if the symbol merits a specification entry
 */
function isSpeccableSymbol(sym: SymbolNode): boolean {
  if (sym.name.startsWith('_')) return false
  const lower = sym.name.toLowerCase()
  const genericLocalNames = new Set([
    'usecase',
    'use_case',
    'handler',
    'action',
    'fn',
    'cb',
    'helper',
    'opts',
    'options',
    'default',
    'fmt',
    'pct',
    'str',
    'len',
    'val',
    'res',
    'req',
    'err',
    'msg',
    'doc',
    'ctx',
    'cfg',
    'ptr',
    'arg',
    'cmd',
    'url',
    'obj',
    'arr',
    'map',
    'num',
    'buf',
    'tmp',
    'tag',
    'key',
    'init',
    'main',
    'run',
    'execute',
    'temp',
    'noop',
    'self',
  ])
  if (genericLocalNames.has(lower)) {
    return false
  }
  if (sym.kind === 'class' || sym.kind === 'interface' || sym.kind === 'enum') {
    return true
  }
  if (sym.kind === 'type') {
    return sym.name.length > 2 && !sym.parentId
  }
  if (sym.kind === 'function') {
    // Top-level use cases, services, algorithms, factories (not nested methods/short local lambdas)
    return !sym.parentId && sym.name.length >= 4
  }
  return false
}

/** Shape of the code graph health status returned by optional `getGraphHealth()`. */
type GraphHealthResult = {
  stale?: boolean
  state?: string
  knownStaleSinceLastIndex?: boolean
  reasonCodes?: string[]
}

/** Shape of a single hotspot entry as returned by various `getHotspots()` response formats. */
type RawHotspotEntry = {
  symbol?: { name?: string; kind?: string; filePath?: string }
  name?: string
  kind?: string
  filePath?: string
  score?: number
  directCallers?: number
  crossWorkspaceCallers?: number
  riskLevel?: string
}

/** Recognized risk levels for candidate specs. */
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

/** Union of the recognized risk levels for candidate specs. */
type RiskLevel = (typeof RISK_LEVELS)[number]

/**
 * Coerces an arbitrary risk-level string to a known `RiskLevel`, defaulting to `LOW`.
 *
 * @param value - Raw risk-level string to normalize
 * @returns A recognized risk level value
 */
function toRiskLevel(value: string | undefined): RiskLevel {
  return RISK_LEVELS.includes(value as RiskLevel) ? (value as RiskLevel) : 'LOW'
}

/** Possible shapes for the `getHotspots()` result depending on provider implementation. */
type RawHotspotsResult = {
  hotspots?: RawHotspotEntry[]
  entries?: RawHotspotEntry[]
}

/**
 * Application use case for discovering candidate specifications and auditing specification gaps.
 */
export class SuggestSpecs {
  /**
   * Creates a new SuggestSpecs use case instance.
   *
   * @param deps - Injected runtime dependencies
   */
  constructor(private readonly deps: SuggestSpecsDeps) {}

  /**
   * Executes the brownfield capability discovery and gap analysis pipeline.
   *
   * @param input - Optional analysis options (workspace filter, confidence threshold, etc.)
   * @returns Structured result with candidate specs, coverage metrics, and per-workspace breakdown
   */
  async execute(input?: SuggestSpecsInput): Promise<SuggestSpecsResult> {
    const parseResult = suggestSpecsInputSchema.safeParse(input || {})
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
        .join('; ')
      throw new InvalidInputError(`Invalid SuggestSpecs input: ${issues}`)
    }
    const validatedInput = parseResult.data

    if (
      validatedInput.workspaceFilter !== undefined &&
      this.deps.specRepositories &&
      this.deps.specRepositories.size > 0
    ) {
      const filters = Array.isArray(validatedInput.workspaceFilter)
        ? validatedInput.workspaceFilter
        : [validatedInput.workspaceFilter]
      for (const filter of filters) {
        for (const ws of filter
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          if (!this.deps.specRepositories.has(ws)) {
            throw new WorkspaceNotFoundError(ws)
          }
        }
      }
    }

    let shouldCloseProvider = false
    const provider = this.deps.codeGraphProvider
    const isProviderOpen =
      Boolean((provider as { isOpen?: unknown })?.isOpen) ||
      Boolean((provider as { _isOpen?: unknown })?._isOpen)
    if (provider && typeof provider.open === 'function' && !isProviderOpen) {
      await provider.open().catch(() => {})
      shouldCloseProvider = true
    }

    try {
      validatedInput.onProgress?.({
        type: 'start',
        message: 'Initializing capability discovery...',
      })

      let codeGraphStale = false
      const providerWithHealth = provider as unknown as {
        getGraphHealth?: () => Promise<GraphHealthResult>
      }
      if (provider && typeof providerWithHealth.getGraphHealth === 'function') {
        try {
          const health = await providerWithHealth.getGraphHealth()
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

      // Pass 0: Warm up implementation suggestion cache across monorepo for gap analysis
      if (this.deps.suggestImplementationLinks && !validatedInput.ignoreCurrentSpecs) {
        Logger.debug('[SuggestSpecs] Phase 0: Warming up implementation cache across workspaces...')
        validatedInput.onProgress?.({
          type: 'warmup-start',
          message: 'Warming up implementation cache across workspaces...',
        })
        const implCache = this.deps.implementationCache
        const executeWarmup = async () => {
          Logger.debug('[SuggestSpecs] Executing suggestImplementationLinks for cache warmup...')
          const implResult = await this.deps.suggestImplementationLinks!.execute({
            all: true,
            apply: false,
            ...(validatedInput.rebuildCache !== undefined
              ? { rebuildCache: validatedInput.rebuildCache }
              : {}),
            onProgress: (evt) => {
              Logger.debug('[SuggestSpecs] Warmup progress event', { type: evt.type })
              validatedInput.onProgress?.({ type: 'warmup-progress', event: evt })
            },
          })
          Logger.debug('[SuggestSpecs] Cache warmup execute complete', {
            warmedSpecsCount: implResult?.specs?.length ?? 0,
          })
          validatedInput.onProgress?.({
            type: 'warmup-done',
            totalSpecs: implResult?.specs?.length ?? 0,
          })
        }

        try {
          if (implCache) {
            await implCache.withLock(executeWarmup)
          } else {
            await executeWarmup()
          }
        } catch (err: unknown) {
          if ((err as { code?: string })?.code === 'CACHE_LOCKED') {
            throw err
          }
          Logger.warn('[SuggestSpecs] Cache warmup pass encountered an exception', {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            code: (err as { code?: string })?.code,
          })
          // Non-fatal if other warmup failures occur, continue with in-memory AST correlation
        }
      }

      // 1. Retrieve all indexed files and symbols from CodeGraph
      Logger.debug('[SuggestSpecs] Phase 1: Retrieving indexed files and symbols from CodeGraph...')
      let allFiles: FileNode[] = []
      let allSymbols: SymbolNode[] = []
      let hotspots: Array<{
        name: string
        kind: string
        filePath: string
        score: number
        directCallers: number
        crossWorkspaceCallers: number
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      }> = []

      if (provider) {
        if (typeof provider.open === 'function') {
          await provider.open().catch(() => {})
        }

        try {
          const providerWithAllFiles = provider as unknown as {
            getAllFiles?: () => Promise<FileNode[]>
            store?: { getAllFiles?: () => Promise<FileNode[]> }
          }
          if (typeof providerWithAllFiles.getAllFiles === 'function') {
            allFiles = await providerWithAllFiles.getAllFiles()
          } else if (
            providerWithAllFiles.store &&
            typeof providerWithAllFiles.store.getAllFiles === 'function'
          ) {
            allFiles = await providerWithAllFiles.store.getAllFiles()
          }
        } catch {
          // Fallback if store not accessible directly
        }

        try {
          allSymbols = await provider.findSymbols({})
        } catch {
          allSymbols = []
        }

        try {
          const providerWithHotspots = provider as unknown as {
            getHotspots?: (opts: {
              limit: number
              minScore: number
            }) => Promise<RawHotspotsResult | RawHotspotEntry[]>
          }
          const rawResult = await providerWithHotspots.getHotspots?.({ limit: 1000, minScore: 0 })
          const rawHotspots: RawHotspotEntry[] =
            rawResult && !Array.isArray(rawResult) && Array.isArray(rawResult.hotspots)
              ? rawResult.hotspots
              : rawResult && !Array.isArray(rawResult) && Array.isArray(rawResult.entries)
                ? rawResult.entries.map((e) => ({
                    name: e.symbol?.name || e.name || '',
                    kind: e.symbol?.kind || e.kind || 'function',
                    filePath: e.symbol?.filePath || e.filePath || '',
                    score: e.score || 0,
                    directCallers: e.directCallers || 0,
                    crossWorkspaceCallers: e.crossWorkspaceCallers || 0,
                    riskLevel: e.riskLevel || 'LOW',
                  }))
                : Array.isArray(rawResult)
                  ? rawResult
                  : []

          hotspots = rawHotspots.map((h) => ({
            name: typeof h.name === 'string' ? h.name : '',
            kind: typeof h.kind === 'string' ? h.kind : 'function',
            filePath: typeof h.filePath === 'string' ? h.filePath : '',
            score: typeof h.score === 'number' ? h.score : 0,
            directCallers: typeof h.directCallers === 'number' ? h.directCallers : 0,
            crossWorkspaceCallers:
              typeof h.crossWorkspaceCallers === 'number' ? h.crossWorkspaceCallers : 0,
            riskLevel: toRiskLevel(h.riskLevel),
          }))
        } catch {
          hotspots = []
        }
      }

      const rawWs = validatedInput.workspaceFilter
      const targetWorkspaces = rawWs
        ? new Set(
            (Array.isArray(rawWs) ? rawWs : [rawWs])
              .flatMap((w) => w.split(',').map((s) => s.trim()))
              .filter(Boolean),
          )
        : undefined

      if (targetWorkspaces && targetWorkspaces.size > 0) {
        allFiles = allFiles.filter((f) => targetWorkspaces.has(f.workspace || 'default'))
        const filePathsInTarget = new Set(allFiles.map((f) => f.path))
        allSymbols = allSymbols.filter((s) => filePathsInTarget.has(s.filePath))
        hotspots = hotspots.filter((h) => filePathsInTarget.has(h.filePath))
      }

      // Filter non-source files (keep code)
      const isTestFile = (path: string) => {
        const clean = path.replaceAll('\\', '/')
        const noWs = clean.includes(':') ? clean.substring(clean.indexOf(':') + 1) : clean
        return (
          clean.includes('.spec.') ||
          clean.includes('.test.') ||
          clean.includes('/test/') ||
          clean.includes('/tests/') ||
          clean.includes('__tests__') ||
          noWs.startsWith('test/') ||
          noWs.startsWith('tests/') ||
          noWs.startsWith('dev/scripts') ||
          clean.includes('/fixtures/') ||
          clean.includes('/mocks/')
        )
      }

      const testFilesSet = new Set<string>()
      const productionFiles: FileNode[] = []

      for (const file of allFiles) {
        if (isTestFile(file.path)) {
          testFilesSet.add(file.path)
        } else {
          productionFiles.push(file)
        }
      }

      // 2. Audit Existing Specs & Build Symbol Coverage Map (Gap Analysis Mode)
      const fullyClaimedFiles = new Set<string>()
      const symbolCoverageMap = new Map<string, string>() // symbolId -> specId
      const symbolNameCoverageMap = new Map<string, string>() // `${ws}::${symbolName}` -> specId
      const existingSpecSlugs = new Set<string>() // `${ws}::${slug}`
      let existingSpecsCount = 0

      if (!validatedInput.ignoreCurrentSpecs && this.deps.specRepositories) {
        const activeRepos =
          targetWorkspaces && targetWorkspaces.size > 0
            ? new Map(
                [...this.deps.specRepositories.entries()].filter(([ws]) =>
                  targetWorkspaces.has(ws),
                ),
              )
            : this.deps.specRepositories

        validatedInput.onProgress?.({
          type: 'gap-audit-start',
          totalSpecs: activeRepos.size,
        })

        const markClaimedFile = (filePath: string, ws: string) => {
          const clean = filePath.replaceAll('\\', '/')
          fullyClaimedFiles.add(clean)
          const relativePath = clean
            .replace(/^[^:]+:/, '')
            .replace(new RegExp(`^(?:packages|apps)/${ws}/`, 'i'), '')
            .replace(new RegExp(`^${ws}/`, 'i'), '')
          fullyClaimedFiles.add(relativePath)
          if (ws) {
            fullyClaimedFiles.add(`${ws}:${relativePath}`)
            fullyClaimedFiles.add(`packages/${ws}/${relativePath}`)
            if (!relativePath.startsWith('src/')) {
              fullyClaimedFiles.add(`packages/${ws}/src/${relativePath}`)
            }
            fullyClaimedFiles.add(`apps/${ws}/${relativePath}`)
            if (!relativePath.startsWith('src/')) {
              fullyClaimedFiles.add(`apps/${ws}/src/${relativePath}`)
            }

            // Hierarchical claim propagation for composition wiring and helpers
            if (relativePath.includes('application/use-cases/')) {
              const compPath = relativePath.replace(
                'application/use-cases/',
                'composition/use-cases/',
              )
              fullyClaimedFiles.add(`${ws}:${compPath}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${compPath}`)
              const compRoot = relativePath.replace('application/use-cases/', 'composition/')
              fullyClaimedFiles.add(`${ws}:${compRoot}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${compRoot}`)
            }
            if (relativePath.includes('application/ports/')) {
              const fsPath = relativePath.replace('application/ports/', 'infrastructure/fs/')
              fullyClaimedFiles.add(`${ws}:${fsPath}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${fsPath}`)
              const fsPrefixed = relativePath.replace('application/ports/', 'infrastructure/fs/fs-')
              fullyClaimedFiles.add(`${ws}:${fsPrefixed}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${fsPrefixed}`)
              const nodePath = relativePath.replace('application/ports/', 'infrastructure/node/')
              fullyClaimedFiles.add(`${ws}:${nodePath}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${nodePath}`)
              const compPath = relativePath.replace('application/ports/', 'composition/')
              fullyClaimedFiles.add(`${ws}:${compPath}`)
              fullyClaimedFiles.add(`packages/${ws}/src/${compPath}`)
            }
          }
        }

        for (const [wsName, repo] of activeRepos.entries()) {
          const listResult = await repo.list(undefined, { includeMeta: true })
          const entries = Array.isArray(listResult) ? listResult : (listResult?.items ?? [])
          for (const rawEntry of entries) {
            const entry = rawEntry as Record<string, unknown>
            const entryWorkspace = typeof entry.workspace === 'string' ? entry.workspace : wsName
            const entryPath = typeof entry.path === 'string' ? entry.path : ''
            const specId = `${entryWorkspace}:${entryPath}`
            existingSpecsCount++

            const rawSpecSlug = entryPath.split('/').pop() || entryPath
            existingSpecSlugs.add(`${entryWorkspace}::${entryPath}`)
            existingSpecSlugs.add(`${entryWorkspace}::${rawSpecSlug}`)
            existingSpecSlugs.add(
              `${entryWorkspace}::${rawSpecSlug.replace(/-(?:use-case|usecase|workflow|action|service|repository|port|adapter|language-adapter)$/, '')}`,
            )
            existingSpecSlugs.add(
              `${entryWorkspace}::${rawSpecSlug.replace(/^(?:fs|sqlite|memory|mock|git|hg|svn)-/, '')}`,
            )

            // Read spec content and audit links through SpecRepository
            try {
              const spec = await repo.get(SpecPath.parse(entryPath))
              let specContent = ''
              if (spec && typeof repo.artifact === 'function') {
                const artifactsList =
                  spec.artifacts && spec.artifacts.length > 0
                    ? [...spec.artifacts].sort((a, b) => {
                        if (a.filename === 'spec.md') return -1
                        if (b.filename === 'spec.md') return 1
                        return a.filename.localeCompare(b.filename)
                      })
                    : [{ filename: 'spec.md' }]

                const loadedParts: string[] = []
                for (const art of artifactsList) {
                  const loaded = await repo.artifact(spec, art.filename).catch(() => null)
                  if (loaded?.content) {
                    loadedParts.push(loaded.content)
                  }
                }
                specContent = loadedParts.join('\n\n')
              }

              let linkedFiles: string[] = []
              let linkedSymbols: string[] = []
              if (spec && typeof repo.readPersistedState === 'function') {
                const state = await repo.readPersistedState(spec)
                if (state?.implementation) {
                  for (const link of state.implementation) {
                    if (link.symbols && link.symbols.length > 0) {
                      for (const sym of link.symbols) {
                        symbolNameCoverageMap.set(`${entryWorkspace}::${sym}`, specId)
                      }
                    } else {
                      markClaimedFile(link.file, entryWorkspace)
                    }
                  }
                  linkedFiles = state.implementation.map((link) => link.file)
                  linkedSymbols = state.implementation.flatMap((link) =>
                    link.symbols ? [...link.symbols] : [],
                  )
                }
              }

              // Check implementation suggestions from cache if available
              if (this.deps.implementationCache) {
                try {
                  const cached = await this.deps.implementationCache.get(specId)
                  if (cached && cached.suggestions) {
                    for (const sug of cached.suggestions) {
                      if (sug.confidence === 'HIGH') {
                        if (!sug.symbols || sug.symbols.length === 0) {
                          markClaimedFile(sug.file, entryWorkspace)
                        }
                        for (const sym of sug.symbols || []) {
                          symbolNameCoverageMap.set(`${entryWorkspace}::${sym}`, specId)
                        }
                      }
                    }
                  }
                } catch {
                  // Ignore cache lookup errors
                }
              }

              const audit = SpecSymbolClassifier.classify(
                specContent,
                specId,
                linkedSymbols,
                linkedFiles,
              )

              // Also claim files and symbols declaring owned symbols of this spec (even if spec-lock is absent)
              const ownedVariants = new Set<string>()
              for (const owned of audit.ownedSymbols) {
                ownedVariants.add(owned)
                symbolNameCoverageMap.set(`${entryWorkspace}::${owned}`, specId)
                const camel = owned.charAt(0).toLowerCase() + owned.slice(1)
                ownedVariants.add(camel)
                symbolNameCoverageMap.set(`${entryWorkspace}::${camel}`, specId)
                ownedVariants.add(`create${owned}`)
                ownedVariants.add(`create${owned}FromNormalized`)
                ownedVariants.add(`resolve${owned}Deps`)
                ownedVariants.add(`open${owned}`)
              }

              for (const s of allSymbols) {
                if (ownedVariants.has(s.name)) {
                  symbolCoverageMap.set(s.id, specId)
                }
              }

              // Semantic token stem matching: claim files containing distinctive spec tokens
              const specTokens = rawSpecSlug
                .split(/[-_]+/)
                .filter(
                  (t) => t.length >= 4 && !/^(?:spec|usecase|service|repo|port|adapter)$/i.test(t),
                )
              if (specTokens.length > 0) {
                for (const pFile of productionFiles) {
                  const pWs = pFile.workspace || 'default'
                  if (pWs === entryWorkspace) {
                    const pClean = pFile.path.toLowerCase()
                    const matchesTokens = specTokens.some((t) => pClean.includes(t.toLowerCase()))
                    if (matchesTokens) {
                      markClaimedFile(pFile.path, entryWorkspace)
                    }
                  }
                }
              }
            } catch {
              // Ignore read errors during audit
            }
          }
        }
      }

      // 3. Cluster Files and Speccable Symbols into Capabilities
      validatedInput.onProgress?.({
        type: 'clustering-start',
        totalFiles: productionFiles.length,
      })

      const supportedExtensions = new Set(
        this.deps.adapterRegistry.getSupportedExtensions?.() || [],
      )

      /** Aggregated capability cluster grouping related source files and symbols under one spec boundary. */
      interface CapabilityCluster {
        workspace: string
        capabilitySlug: string
        category: SpecCategory
        titleSuffix: string
        layer: string
        primaryFiles: Set<string>
        testFiles: Set<string>
        symbols: SymbolNode[]
      }

      const clustersMap = new Map<string, CapabilityCluster>()

      /**
       * Strips architectural role suffixes and action verbs from a symbol name
       * to reveal its underlying domain concept root (OOP + Functional).
       *
       * @param symbolName - Raw exported symbol name (e.g. `PasswordResetService`, `createUser`)
       * @returns Canonical concept root (e.g. `PasswordReset`, `User`)
       *
       * @example
       *   extractConceptRoot("PasswordResetService") // → "PasswordReset"
       *   extractConceptRoot("createUser")           // → "User"
       *   extractConceptRoot("registerSpecSuggest")  // → "SpecSuggest"
       *   extractConceptRoot("formatImpactResult")   // → "Impact"
       */
      function extractConceptRoot(symbolName: string): string {
        let name = symbolName

        // 1. Strip common functional action/verb prefixes (camelCase or snake_case)
        const verbPrefixes = [
          'create',
          'register',
          'get',
          'find',
          'list',
          'fetch',
          'read',
          'write',
          'update',
          'edit',
          'set',
          'delete',
          'remove',
          'validate',
          'process',
          'handle',
          'render',
          'format',
          'parse',
          'resolve',
          'build',
          'open',
          'close',
          'execute',
          'run',
          'check',
          'assert',
          'load',
          'save',
          'send',
          'calc',
          'calculate',
          'emit',
          'track',
          'dispatch',
          'warn',
          'normalize',
          'extend',
          'fork',
          'show',
          'discard',
          'approve',
          'archive',
          'skip',
          'preview',
          'install',
          'uninstall',
        ]

        for (const verb of verbPrefixes) {
          const regex = new RegExp(`^${verb}([A-Z0-9_].*)$`, 'i')
          const match = name.match(regex)
          if (match && match[1] && match[1].length >= 3) {
            const rest = match[1].replace(/^[_\s]+/, '')
            name = rest.charAt(0).toUpperCase() + rest.slice(1)
            break
          }
        }

        // 2. Strip architectural role suffixes
        const roleSuffixes = [
          'UseCase',
          'Workflow',
          'Interactor',
          'Executor',
          'Runner',
          'Service',
          'Repository',
          'Controller',
          'Factory',
          'Manager',
          'Handler',
          'Adapter',
          'Resolver',
          'Gateway',
          'Registry',
          'Store',
          'Cache',
          'Builder',
          'Validator',
          'Formatter',
          'Parser',
          'Serializer',
          'Transformer',
          'Provider',
          'Listener',
          'Observer',
          'Emitter',
          'Processor',
          'Dispatcher',
          'Loader',
          'Writer',
          'Reader',
          'Fetcher',
          'Command',
          'Cmd',
          'Query',
          'Port',
          'Input',
          'Result',
          'Output',
          'Options',
          'Config',
          'Settings',
          'Props',
          'State',
          'Event',
          'Error',
          'Exception',
          'Presenter',
          'Helper',
          'Helpers',
          'Context',
          'Types',
          'Type',
          'Report',
          'Summary',
          'Payload',
          'Response',
          'Request',
          'Record',
          'Entry',
          'Manifest',
          'Snapshot',
          'View',
          'DTO',
          'Dto',
          'Model',
        ].sort((a, b) => b.length - a.length) // longest first

        for (const suffix of roleSuffixes) {
          if (name.endsWith(suffix) && name.length > suffix.length + 1) {
            name = name.slice(0, -suffix.length)
            break
          }
        }
        return name || symbolName
      }

      /**
       * Groups symbols by semantic concept root.
       * Roots where one is a prefix of another (min 4 chars) are merged into the shorter one:
       *   "User", "UserProfile", "UserPreferences" → all merge into "User"
       *   "UserLogin", "PasswordReset" → distinct roots → 2 groups
       *
       * This naturally handles both SRP files (1 group → 1 spec) and legacy multi-concept files
       * (N distinct groups → N specs), with no dependency on file names or folder structure.
       *
       * @param symbols - Speccable symbols from a single source file
       * @returns Map from canonical concept root to the symbols sharing that root
       */
      function groupByConceptRoots(symbols: SymbolNode[]): Map<string, SymbolNode[]> {
        const withRoots = symbols.map((s) => ({ sym: s, root: extractConceptRoot(s.name) }))
        const uniqueRoots = [...new Set(withRoots.map((x) => x.root))].sort(
          (a, b) => a.length - b.length,
        )

        // Build canonical root mapping: merge longer roots into shorter prefix roots (≥ 4 chars)
        const canonical = new Map<string, string>()
        for (const r of uniqueRoots) canonical.set(r, r)
        for (let i = 0; i < uniqueRoots.length; i++) {
          for (let j = i + 1; j < uniqueRoots.length; j++) {
            const shorter = uniqueRoots[i]!
            const longer = uniqueRoots[j]!
            if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.endsWith(shorter))) {
              canonical.set(longer, canonical.get(shorter)!)
            }
          }
        }

        const groups = new Map<string, SymbolNode[]>()
        for (const { sym, root } of withRoots) {
          const canon = canonical.get(root) ?? root
          if (!groups.has(canon)) groups.set(canon, [])
          groups.get(canon)!.push(sym)
        }
        return groups
      }

      const isEntrypointOrBarrelFile = (filePath: string) => {
        const clean = filePath.replaceAll('\\', '/')
        return (
          clean.endsWith('/index.ts') ||
          clean.endsWith('/index.js') ||
          clean.endsWith('/main.ts') ||
          clean.endsWith('/main.js') ||
          clean.endsWith('/main.go') ||
          clean.endsWith('/main.py') ||
          clean.endsWith('/app.ts') ||
          clean.endsWith('/app.js') ||
          clean.endsWith('/entrypoint.ts') ||
          clean.endsWith('/ports.ts')
        )
      }

      for (const file of productionFiles) {
        const ws = file.workspace || 'default'
        if (targetWorkspaces && targetWorkspaces.size > 0 && !targetWorkspaces.has(ws)) {
          continue
        }

        const cleanFilePath = file.path.replaceAll('\\', '/')
        const noWs = cleanFilePath.replace(/^[^:]+:/, '')
        const isClaimedFile =
          !validatedInput.ignoreCurrentSpecs &&
          (fullyClaimedFiles.has(cleanFilePath) ||
            fullyClaimedFiles.has(noWs) ||
            fullyClaimedFiles.has(`${ws}:${noWs}`) ||
            fullyClaimedFiles.has(`packages/${ws}/${noWs}`) ||
            fullyClaimedFiles.has(`packages/${ws}/src/${noWs}`))

        if (isClaimedFile) continue

        const fileSymbols = allSymbols.filter((s) => s.filePath === file.path)
        const speccableSymbols = fileSymbols.filter(isSpeccableSymbol)

        const uncoveredSymbols = validatedInput.ignoreCurrentSpecs
          ? speccableSymbols
          : speccableSymbols.filter(
              (s) => !symbolCoverageMap.has(s.id) && !symbolNameCoverageMap.has(`${ws}::${s.name}`),
            )

        // Skip files with no uncovered speccable definitions
        if (uncoveredSymbols.length === 0) continue

        // Group uncovered symbols by semantic concept root.
        // Entrypoints/barrels → 1 unified spec.
        // 1 group → SRP file → 1 spec (slug from file name).
        // N groups → multi-concept file → N specs (slug from primary symbol in each group).
        const isEntrypoint = isEntrypointOrBarrelFile(file.path)
        const conceptGroups = isEntrypoint
          ? new Map([['entrypoint', uncoveredSymbols]])
          : groupByConceptRoots(uncoveredSymbols)

        for (const [, groupSymbols] of conceptGroups) {
          // Prefer top-level class as anchor, then interface, then any speccable symbol
          const primaryClass =
            groupSymbols.find((s) => s.kind === 'class' && !s.parentId) ??
            groupSymbols.find((s) => s.kind === 'interface' && !s.parentId) ??
            groupSymbols[0]

          const anchor = CapabilityClusteringEngine.resolveCapabilityAnchor(
            ws,
            file.path,
            supportedExtensions,
            // Pass primarySymbolName only for multi-concept files so each group gets a distinct slug.
            // Single-concept files derive slug from the file name directly.
            conceptGroups.size > 1 ? primaryClass?.name : undefined,
          )

          if (!validatedInput.ignoreCurrentSpecs && existingSpecSlugs.has(anchor.capabilityKey)) {
            continue
          }

          let cluster = clustersMap.get(anchor.capabilityKey)
          if (!cluster) {
            cluster = {
              workspace: anchor.workspace,
              capabilitySlug: anchor.capabilitySlug,
              category: anchor.category,
              titleSuffix: anchor.titleSuffix,
              layer: anchor.layer,
              primaryFiles: new Set<string>(),
              testFiles: new Set<string>(),
              symbols: [],
            }
            clustersMap.set(anchor.capabilityKey, cluster)
          }

          cluster.primaryFiles.add(file.path)
          cluster.symbols.push(...groupSymbols)
        }
      }

      // Correlate test files to clusters
      for (const testPath of testFilesSet) {
        for (const cluster of clustersMap.values()) {
          const slugClean = cluster.capabilitySlug.replace(/-/g, '')
          const testPathClean = testPath.toLowerCase().replace(/[-_.]/g, '')
          if (testPathClean.includes(slugClean)) {
            cluster.testFiles.add(testPath)
          }
        }
      }

      // Map each file to its candidate spec ID
      const fileToSpecMap = new Map<string, string>()
      for (const cluster of clustersMap.values()) {
        const specId = `${cluster.workspace}:${cluster.capabilitySlug}`
        for (const f of cluster.primaryFiles) {
          fileToSpecMap.set(f, specId)
        }
      }

      // 4. Trace Caller Graph & Infer Inter-Spec Dependencies
      const outgoingCallsByFile = new Map<string, Set<string>>()
      for (const sym of allSymbols) {
        if (!outgoingCallsByFile.has(sym.filePath)) {
          outgoingCallsByFile.set(sym.filePath, new Set())
        }
      }

      const rawDependencies = DependencyInferenceEngine.inferRawDependencies(
        fileToSpecMap,
        outgoingCallsByFile,
        testFilesSet,
      )

      const reducedDependencies = TransitiveReductionEngine.reduce(rawDependencies)

      // 5. Evaluate Confidence, Anchor Symbols, Hotspots, and Scenarios
      const candidateSpecs: CandidateSpec[] = []
      const byPriority: Record<string, number> = {
        'P0 (Critical)': 0,
        'P1 (High)': 0,
        'P2 (Medium)': 0,
      }
      const byCategory: Record<string, number> = {}

      for (const cluster of clustersMap.values()) {
        if (cluster.primaryFiles.size === 0) continue

        const specId = `${cluster.workspace}:${cluster.capabilitySlug}`
        const primaryFilesList = [...cluster.primaryFiles].sort()
        const testFilesList = [...cluster.testFiles].sort()

        // Extract symbols in cluster
        const clusterSymbols =
          cluster.symbols.length > 0
            ? cluster.symbols
            : allSymbols.filter((s) => cluster.primaryFiles.has(s.filePath))
        const clusterHotspots = hotspots.filter((h) => cluster.primaryFiles.has(h.filePath))

        const maxHotspotScore =
          clusterHotspots.length > 0 ? Math.max(...clusterHotspots.map((h) => h.score)) : 0
        const totalIncomingCallers = clusterHotspots.reduce((sum, h) => sum + h.directCallers, 0)
        const totalCrossWorkspaceCallers = clusterHotspots.reduce(
          (sum, h) => sum + h.crossWorkspaceCallers,
          0,
        )
        const hasPrimaryClasses = clusterSymbols.some((s) => s.kind === 'class')
        const hasPublicExports = primaryFilesList.some((f) =>
          /index|public|api|commands|routes|ports|use-cases/i.test(f),
        )

        // Filter out empty or trivial facade barrels without symbols or callers
        const hasSubstantiveAnchor =
          hasPrimaryClasses ||
          clusterSymbols.some((s) => s.kind === 'interface' || s.kind === 'function')

        const isPrimaryArchitecturalCategory =
          cluster.category === 'APPLICATION_USE_CASE' ||
          cluster.category === 'CORE_DOMAIN_ENTITY' ||
          cluster.category === 'PORT_OR_CONTRACT' ||
          cluster.category === 'DOMAIN_SERVICE' ||
          cluster.category === 'INFRASTRUCTURE_SUBSYSTEM'

        if (
          !hasSubstantiveAnchor &&
          !isPrimaryArchitecturalCategory &&
          clusterHotspots.length === 0
        ) {
          continue
        }

        if (
          cluster.category === 'UTILITY_SUPPORT' &&
          clusterHotspots.length === 0 &&
          totalIncomingCallers === 0 &&
          clusterSymbols.length === 0
        ) {
          continue
        }

        const confidenceResult = ConfidenceScorer.compute({
          maxHotspotScore,
          totalIncomingCallers,
          totalCrossWorkspaceCallers,
          hasPrimaryClasses,
          category: cluster.category,
          hasAnchorSymbols: clusterSymbols.length > 0,
          fileCount: primaryFilesList.length,
          symbolCount: clusterSymbols.length,
          hasPublicExports,
          testSuitesCount: testFilesList.length,
        })

        // Apply minConfidence filter
        if (
          validatedInput.minConfidence !== undefined &&
          confidenceResult.score < validatedInput.minConfidence
        ) {
          continue
        }

        // Format Title & Anchor Symbols
        const titleWords = cluster.capabilitySlug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        const title = `${titleWords} ${cluster.titleSuffix}`

        const anchorSymbols: AnchorSymbol[] = clusterSymbols.slice(0, 8).map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          filePath: s.filePath,
        }))

        const hotspotsSummary: HotspotSummary[] = clusterHotspots.slice(0, 5)
        const dependsOnSpecs = reducedDependencies.get(specId) || []

        const candidate: CandidateSpec = {
          id: specId,
          title,
          workspace: cluster.workspace,
          category: cluster.category,
          priority: confidenceResult.priority,
          confidence: confidenceResult.score,
          confidenceBreakdown: confidenceResult.breakdown,
          rationale: {
            whyNeeded: `Discovered architectural ${cluster.layer} capability in ${cluster.workspace} containing ${primaryFilesList.length} source file(s) and ${clusterSymbols.length} symbol(s).`,
            blastRadiusSummary:
              totalIncomingCallers > 0
                ? `Directly referenced by ${totalIncomingCallers} incoming callers with max hotspot risk ${maxHotspotScore}.`
                : 'Isolated or leaf capability with local caller surface.',
            architecturalRole: `Encapsulates ${cluster.layer} invariants for ${titleWords}.`,
            keyEvidence: [
              `Primary implementation: ${primaryFilesList[0] || 'none'}`,
              `Discovered ${clusterSymbols.length} symbols and ${testFilesList.length} test suite(s).`,
              `Category: ${cluster.category} (Score: ${(confidenceResult.score * 100).toFixed(0)}%)`,
            ],
          },
          primaryFiles: primaryFilesList,
          testFiles: testFilesList,
          anchorSymbols,
          hotspots: hotspotsSummary,
          dependsOnSpecs,
        }

        candidateSpecs.push(candidate)
        byPriority[confidenceResult.priority] = (byPriority[confidenceResult.priority] || 0) + 1
        const categoryKey = cluster.category as string
        byCategory[categoryKey] = (byCategory[categoryKey] || 0) + 1
      }

      // Sort candidate specs by confidence descending, then ID
      candidateSpecs.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))

      // Apply limit if specified
      const limitedSpecs =
        validatedInput.limit !== undefined
          ? candidateSpecs.slice(0, validatedInput.limit)
          : candidateSpecs

      // Compute aggregate metrics
      const totalSuggestedFiles = candidateSpecs.reduce((sum, s) => sum + s.primaryFiles.length, 0)
      const coveredFilesCount = fullyClaimedFiles.size + totalSuggestedFiles
      const codeCoveragePercentage =
        productionFiles.length > 0
          ? Math.min(100, Number(((coveredFilesCount / productionFiles.length) * 100).toFixed(1)))
          : 100

      const averageConfidence =
        candidateSpecs.length > 0
          ? Number(
              (
                candidateSpecs.reduce((sum, s) => sum + s.confidence, 0) / candidateSpecs.length
              ).toFixed(2),
            )
          : 0

      const highConfidenceSpecsCount = candidateSpecs.filter((s) => s.confidence >= 0.8).length

      validatedInput.onProgress?.({
        type: 'done',
        totalSpecsSuggested: candidateSpecs.length,
      })

      const formattedTargetWorkspace =
        targetWorkspaces && targetWorkspaces.size > 0
          ? Array.from(targetWorkspaces).join(', ')
          : undefined

      return {
        result: 'ok',
        targetWorkspace: formattedTargetWorkspace,
        codeGraphStale,
        summary: {
          totalFilesAnalyzed: productionFiles.length,
          totalSymbolsAnalyzed: allSymbols.length,
          totalWorkspaces: new Set(productionFiles.map((f) => f.workspace || 'default')).size,
          totalSpecsSuggested: candidateSpecs.length,
          highConfidenceSpecsCount,
          codeCoveragePercentage,
          averageConfidence,
          byPriority,
          byCategory,
          uncoveredFilesCount: Math.max(0, productionFiles.length - coveredFilesCount),
          existingSpecsCount,
          missingSpecsCount: candidateSpecs.length,
        },
        suggestedSpecs: limitedSpecs,
      }
    } finally {
      if (shouldCloseProvider && provider && typeof provider.close === 'function') {
        await provider.close().catch(() => {})
      }
    }
  }
}
