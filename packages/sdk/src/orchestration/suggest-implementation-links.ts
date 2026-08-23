import { constants } from 'node:fs'
import { readFile, access } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Absolute or relative path to check.
 * @returns True when the path is accessible as a file.
 */
async function asyncFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
import {
  type SpecRepository,
  type GetPersistedSpecImplementation,
  type UpdatePersistedSpecImplementation,
  type GetSpecMetadata,
  createGetPersistedSpecImplementation,
  createUpdatePersistedSpecImplementation,
  createGetSpecMetadata,
  type SpecdConfig,
  type CompositionResolutionOptions,
  type CompositionResolver,
  createCompositionResolver,
  Logger,
  SpecNotFoundError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecPath,
} from '@specd/core'
import {
  type CodeGraphProvider,
  createCodeGraphProvider,
  createBuiltinAdapterRegistry,
  SymbolKind,
  type SymbolNode,
} from '@specd/code-graph'
import { z } from 'zod'
import {
  type ImplementationSuggestionLockData,
  type ImplementationSuggestionEntry,
} from '../domain/value-objects/implementation-suggestion-cache.js'
import { type ImplementationSuggestionCachePort } from '../application/ports/implementation-suggestion-cache-port.js'
import { FsImplementationSuggestionCache } from '../infrastructure/fs/fs-implementation-suggestion-cache.js'

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
  | { type: 'discovery-start'; message: string }
  | { type: 'discovery-done'; totalSpecs: number }
  | { type: 'start'; totalSpecs: number }
  | { type: 'spec-start'; specId: string; index: number; totalSpecs: number }
  | { type: 'spec-done'; specId: string; candidatesCount: number }
  | { type: 'done'; totalSpecs: number; totalSuggestions: number }

/**
 *
 */
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
}

/** Result of executing `SuggestImplementationLinks`. */
export interface SuggestImplementationLinksResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string
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
  readonly cache?: ImplementationSuggestionCachePort
  readonly projectDir?: string
  readonly configPath?: string
  readonly workspaces?: readonly { readonly name: string; readonly codeRoot: string }[]
}

const SPEC_PROSE_KEYWORDS = new Set([
  'given',
  'when',
  'then',
  'must',
  'shall',
  'should',
  'each',
  'all',
  'more',
  'some',
  'only',
  'can',
  'may',
  'result',
  'status',
  'error',
  'message',
  'input',
  'output',
  'options',
  'target',
  'index',
  'array',
  'object',
  'set',
  'get',
  'after',
  'before',
  'first',
  'second',
  'third',
  'next',
  'last',
  'will',
  'into',
  'onto',
  'over',
  'under',
  'above',
  'below',
  'have',
  'has',
  'had',
  'been',
  'being',
  'does',
  'done',
  'did',
  'same',
  'such',
  'than',
  'that',
  'this',
  'they',
  'them',
  'their',
  'there',
  'here',
  'were',
  'what',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'whose',
  'why',
  'name',
  'key',
  'value',
  'base',
  'source',
  'mode',
  'data',
  'item',
  'list',
  'path',
  'file',
  'the',
  'and',
  'with',
])

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

    const projectDir = this.deps.projectDir ?? process.cwd()
    const configPath = this.deps.configPath ?? '.specd'
    const cache =
      this.deps.cache ??
      new FsImplementationSuggestionCache({
        projectDir,
        configPath,
        specRepositories: this.deps.specRepositories,
        codeGraphProvider: this.deps.codeGraphProvider,
      })
    if (input.rebuildCache) {
      await cache.invalidate()
    }

    let shouldCloseCodeGraphProvider = false
    const codeGraphProvider = this.deps.codeGraphProvider
    if (
      codeGraphProvider &&
      typeof codeGraphProvider.open === 'function' &&
      (codeGraphProvider as { isOpen?: unknown }).isOpen !== true
    ) {
      await codeGraphProvider.open().catch(() => {})
      shouldCloseCodeGraphProvider = true
    }

    try {
      input.onProgress?.({
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
        if (input.workspace && input.workspace !== wsName) {
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

          if (input.specId && input.specId !== specId) {
            continue
          }
          if (input.specIds && !input.specIds.includes(specId)) {
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

      input.onProgress?.({ type: 'discovery-done', totalSpecs: targetSpecs.length })

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

      const resultSpecs: SpecImplementationSuggestion[] = []
      let updatedSpecsCount = 0
      let filesAddedCount = 0
      let symbolsAddedCount = 0

      input.onProgress?.({ type: 'start', totalSpecs: targetSpecs.length })

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
          const existingSymbols = existingImpl.implementation.flatMap((link) => link.symbols ?? [])
          existingLockData = {
            files: existingFiles,
            symbols: existingSymbols,
            dependsOn: [],
          }
        } catch {
          // If not initialized or missing lock
        }

        const cached = input.rebuildCache ? null : await cache.get(target.specId)

        if (cached) {
          suggestions = [...cached.suggestions]
        } else {
          const analysis = await this.analyzeSpec(target.workspace, target.path, target.title)
          suggestions = analysis.suggestions
          await cache.set(target.specId, {
            title: target.title,
            existing: existingLockData,
            suggestions,
            ...(analysis.realContentHash ? { specContentHash: analysis.realContentHash } : {}),
          })
        }

        const filteredSuggestions = this.filterByConfidence(suggestions, normalizedConfidence)

        const canonicalExistingFiles = await Promise.all(
          existingLockData.files.map((f) => this.toCanonicalWorkspacePath(f)),
        )
        const existingFileSet = new Set(canonicalExistingFiles)

        const markedSuggestions = await Promise.all(
          filteredSuggestions.map(async (sug) => {
            const canonicalSugPath = await this.toCanonicalWorkspacePath(sug.file)
            return {
              ...sug,
              alreadyIncluded: existingFileSet.has(canonicalSugPath),
            }
          }),
        )

        resultSpecs.push({
          specId: target.specId,
          title: target.title,
          existing: existingLockData,
          suggestions: markedSuggestions,
        })

        input.onProgress?.({
          type: 'spec-done',
          specId: target.specId,
          candidatesCount: markedSuggestions.length,
        })

        if (input.apply && markedSuggestions.length > 0) {
          let specMutated = false
          for (const sug of markedSuggestions) {
            if (sug.alreadyIncluded) continue
            try {
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
            } catch {
              // Ignore boundary errors during apply
            }
          }
          if (specMutated) {
            updatedSpecsCount += 1
          }
        }
      }

      await cache.flush()

      const totalDiscovered = resultSpecs.reduce((acc, s) => acc + s.suggestions.length, 0)
      input.onProgress?.({
        type: 'done',
        totalSpecs: resultSpecs.length,
        totalSuggestions: totalDiscovered,
      })

      return {
        result: 'ok',
        ...(input.workspace ? { targetWorkspace: input.workspace } : {}),
        specs: resultSpecs,
        ...(input.apply
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
   * @returns Canonical workspace path string
   */
  private async toCanonicalWorkspacePath(pathString: string): Promise<string> {
    const parts = pathString.split(':')
    if (parts.length < 2) return pathString
    const wsName = parts[0]!
    const relPath = parts.slice(1).join(':')

    if (this.deps.codeGraphProvider && typeof this.deps.codeGraphProvider.getFile === 'function') {
      try {
        const fileNode = await this.deps.codeGraphProvider.getFile(relPath)
        if (fileNode && fileNode.path) {
          return `${fileNode.workspace}:${fileNode.path}`
        }
      } catch {
        // fallback
      }
    }

    const wsConfig = this.deps.workspaces?.find((w) => w.name === wsName)
    if (wsConfig && wsConfig.codeRoot) {
      const projectDir = this.deps.projectDir ?? process.cwd()
      const codeRootAbs = resolve(projectDir, wsConfig.codeRoot)
      const absPath = relPath.startsWith('/') ? relPath : resolve(projectDir, relPath)
      if (absPath.startsWith(codeRootAbs)) {
        const wsRel = relative(codeRootAbs, absPath).replace(/\\/g, '/')
        return `${wsName}:${wsRel}`
      }
    }

    return pathString
  }

  /**
   * Analyzes spec markdown content and graph symbols to produce suggestions.
   *
   * @param workspace - Target workspace name
   * @param capPath - Target spec path
   * @param initialTitle - Optional pre-resolved title from spec list metadata
   * @returns Array of implementation suggestion entries
   */
  private async analyzeSpec(
    workspace: string,
    capPath: string,
    initialTitle?: string,
  ): Promise<{ suggestions: ImplementationSuggestionEntry[]; realContentHash: string }> {
    const repo = this.deps.specRepositories.get(workspace)
    if (!repo) return { suggestions: [], realContentHash: '' }

    Logger.debug('[SuggestImplementationLinks] Analyzing spec', { workspace, capPath })

    const spec = await repo.get(SpecPath.parse(capPath))
    if (!spec) return { suggestions: [], realContentHash: '' }

    let content = ''
    let realContentHash = ''
    if (typeof repo.artifact === 'function') {
      const mainArtifact = await repo.artifact(spec, 'spec.md')
      content = mainArtifact?.content ?? ''
    }
    if (typeof repo.artifactMeta === 'function') {
      const meta = await repo.artifactMeta(spec, 'spec.md', { includeHash: true })
      if (meta?.hash) {
        realContentHash = meta.hash
      }
    }

    const extractedSymbols = new Set<string>()
    const codeBlockRegex = /```(?:typescript|ts)?\n([\s\S]*?)\n```/g
    let match: RegExpExecArray | null

    const builtinRegistry = createBuiltinAdapterRegistry()
    const sourceExtensions = builtinRegistry.getSupportedExtensions()
    const languageKeywords = builtinRegistry.getReservedKeywords()

    const isReservedKeyword = (word: string): boolean =>
      SPEC_PROSE_KEYWORDS.has(word) || languageKeywords.has(word)

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

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const code = match[1] ?? ''
      const identRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g
      let idMatch: RegExpExecArray | null
      while ((idMatch = identRegex.exec(code)) !== null) {
        const word = idMatch[0]
        if (word.length >= 3 && !isReservedKeyword(word) && isCodeIdentifierCandidate(word)) {
          extractedSymbols.add(word)
        }
      }
    }

    const derivedPaths: string[] = []
    const wsConfig = this.deps.workspaces?.find((w) => w.name === workspace)
    const wsCodeRoot = wsConfig?.codeRoot
      ? wsConfig.codeRoot.replace(/^\.\//, '')
      : workspace !== 'default'
        ? `packages/${workspace}`
        : ''

    const inlineRegex = /`([A-Za-z0-9_\-\.\/\(\)]+)`/g
    while ((match = inlineRegex.exec(content)) !== null) {
      const word = match[1] ?? ''
      if (sourceExtensions.some((ext: string) => word.endsWith(ext))) {
        const cleanFileName = word.split('/').pop() ?? word
        derivedPaths.push(`${workspace}:${word}`)
        if (wsCodeRoot) {
          derivedPaths.push(`${workspace}:${wsCodeRoot}/${word}`)
          derivedPaths.push(`${workspace}:${wsCodeRoot}/src/${cleanFileName}`)
        } else {
          derivedPaths.push(`${workspace}:src/${cleanFileName}`)
        }
      }

      if (isCodeIdentifierCandidate(word)) {
        const cleanSym = word
          .replace(/\(.*\)$/, '')
          .replace(/.*\./, '')
          .trim()
        if (cleanSym.length >= 3 && !isReservedKeyword(cleanSym)) {
          extractedSymbols.add(cleanSym)
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
        if (prefix === '' || (await asyncFileExists(join(projectRoot, prefix)))) {
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
          const graphSymbols = await this.deps.codeGraphProvider.findSymbols(symbolQuery)
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
            if (!(await asyncFileExists(fullDiskPath))) {
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
              existing.reasons.add('primary-symbol-match')
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
      if (!(await asyncFileExists(fullDiskPath))) {
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
              if (await asyncFileExists(fullDiskPath)) {
                const diskContent = (await readFile(fullDiskPath, 'utf8')).toLowerCase()
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
              const declared = await this.deps.codeGraphProvider.findSymbols({
                filePath: cleanRelPath,
              })
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
            if (!(await asyncFileExists(fullDiskPath))) continue

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
          const declaredNodes1 = await this.deps.codeGraphProvider.findSymbols({
            filePath: cleanRelPath,
          })
          const declaredNodes2 = await this.deps.codeGraphProvider.findSymbols({
            filePath: shortRelPath,
          })
          const declaredNodes3 = await this.deps.codeGraphProvider.findSymbols({
            filePath: filePath,
          })
          const declaredNodes4 = await this.deps.codeGraphProvider.findSymbols({
            filePath: `*${cleanRelPath}`,
          })
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
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
      const hasExactTokenOrSlug =
        data.reasons.has('exact-token-affinity') || data.reasons.has('filename-slug-match')
      const hasPrimarySymbol = data.reasons.has('primary-symbol-match')
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
      })
    }

    const sortedSuggestions = suggestions.sort((a, b) => b.score - a.score)

    Logger.debug('[SuggestImplementationLinks] Final implementation suggestions for spec', {
      workspace,
      capPath,
      suggestionsCount: sortedSuggestions.length,
      suggestions: sortedSuggestions,
    })

    return { suggestions: sortedSuggestions, realContentHash }
  }
}

/**
 * Resolves dependencies for `SuggestImplementationLinks` from a composition resolver.
 *
 * @param resolver - Composition resolver instance
 * @returns Resolved dependencies bundle
 */
export function resolveSuggestImplementationLinksDeps(
  resolver: CompositionResolver,
): SuggestImplementationLinksDeps {
  const specRepositories = resolver.getSpecRepositories()
  const projectDir = resolver.config.projectRoot

  const getPersistedImplementation = createGetPersistedSpecImplementation(resolver.config)
  const updatePersistedImplementation = createUpdatePersistedSpecImplementation(resolver.config)
  const getSpecMetadata = createGetSpecMetadata(resolver.config)
  const codeGraphProvider = createCodeGraphProvider(resolver.config)

  return {
    specRepositories,
    getPersistedImplementation,
    updatePersistedImplementation,
    getSpecMetadata,
    codeGraphProvider,
    cache: new FsImplementationSuggestionCache({
      projectDir,
      configPath: resolver.config.configPath,
      specRepositories,
      codeGraphProvider,
    }),
    projectDir,
    configPath: resolver.config.configPath,
    workspaces: resolver.config.workspaces,
  }
}

/**
 * Factory function creating a `SuggestImplementationLinks` instance.
 *
 * @param deps - Dependencies instance
 * @returns Configured `SuggestImplementationLinks`
 */
export function createSuggestImplementationLinks(
  deps: SuggestImplementationLinksDeps,
): SuggestImplementationLinks
/**
 * Factory function creating a `SuggestImplementationLinks` instance from configuration.
 *
 * @param config - SpecD project configuration
 * @param options - Composition resolution options
 * @returns Configured `SuggestImplementationLinks`
 */
export function createSuggestImplementationLinks(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestImplementationLinks
/**
 * Factory function overload handler.
 *
 * @param depsOrConfig - Dependencies or configuration
 * @param options - Composition resolution options
 * @returns Configured `SuggestImplementationLinks`
 */
export function createSuggestImplementationLinks(
  depsOrConfig: SuggestImplementationLinksDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestImplementationLinks {
  if (isSuggestImplementationLinksDeps(depsOrConfig)) {
    return new SuggestImplementationLinks(depsOrConfig)
  }
  const resolver = createCompositionResolver(depsOrConfig, options)
  return new SuggestImplementationLinks(resolveSuggestImplementationLinksDeps(resolver))
}

/**
 * Type guard for `SuggestImplementationLinksDeps`.
 *
 * @param value - Candidate object
 * @returns True if value satisfies `SuggestImplementationLinksDeps`
 */
function isSuggestImplementationLinksDeps(
  value: SuggestImplementationLinksDeps | SpecdConfig,
): value is SuggestImplementationLinksDeps {
  return (
    'specRepositories' in value &&
    'getPersistedImplementation' in value &&
    'updatePersistedImplementation' in value
  )
}
