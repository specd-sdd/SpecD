import {
  type GraphStore,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
} from '../../domain/ports/graph-store.js'
import { expandSearchQuery } from '../../domain/services/expand-search-query.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import {
  type SourceContentMatch,
  type SourceFileSearchResult,
  type SourceSearchMatchKind,
} from '../../domain/value-objects/source-search.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { type SourceRange, type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import {
  type LogicalSymbol,
  type PublicBinding,
} from '../../domain/value-objects/symbol-reference.js'

/** Search categories supported by the authoritative Code Graph search operation. */
export type SearchCategory = 'symbols' | 'files' | 'specs' | 'documents'

/** Stable semantic tier attached to reference-aware symbol groups. */
export type SymbolSearchMatchTier =
  | 'exact-logical-identity'
  | 'exact-public-binding'
  | 'exact-declaration'
  | 'normalized-declaration'
  | 'logical-component'
  | 'exact-local-symbol'
  | 'textual'

/** Original full-text hit retained within one reference-aware logical group. */
export interface ReferenceAwareSymbolHit {
  readonly symbol: SymbolNode
  readonly score: number
  readonly snippet: string
  readonly startLine: number
  readonly endLine: number
}

/** Search projection grouped by logical identity while retaining every declaration and binding. */
export interface ReferenceAwareSymbolResult {
  readonly logicalTarget: LogicalSymbol | null
  readonly declarations: readonly LogicalDeclaration[]
  readonly publicBindings: readonly PublicBinding[]
  /** Public bindings whose identity directly matched the request. */
  readonly matchedPublicBindings: readonly PublicBinding[]
  readonly hits: readonly ReferenceAwareSymbolHit[]
  readonly score: number
  readonly matchTier: SymbolSearchMatchTier
  readonly matchReasons: readonly string[]
}

/** Unified request accepted by CodeGraphProvider.search. */
export interface SearchCodeGraphInput {
  readonly query: string
  readonly categories: readonly SearchCategory[]
  readonly limit: number
  readonly includeSnippet: boolean
  readonly kinds?: readonly SymbolKind[] | undefined
  readonly filePattern?: string | undefined
  /** True only when Code Graph resolved filePattern to one exact graph file. */
  readonly exactFile?: boolean | undefined
  readonly workspace?: string | undefined
  readonly excludePaths?: readonly string[] | undefined
  readonly excludeWorkspaces?: readonly string[] | undefined
}

/** Spec search row retained in the unified projection. */
export interface UnifiedSpecSearchResult {
  readonly spec: SpecNode
  readonly score: number
  readonly snippet: string
  readonly startLine: number
  readonly endLine: number
}

/** Document search row retained in the unified projection. */
export interface UnifiedDocumentSearchResult {
  readonly document: DocumentNode
  readonly score: number
  readonly snippet: string
  readonly startLine: number
  readonly endLine: number
}

/** Deterministic category-grouped result returned by the Code Graph search use case. */
export interface SearchCodeGraphResult {
  readonly symbols: readonly ReferenceAwareSymbolResult[]
  readonly files: readonly SourceFileSearchResult[]
  readonly specs: readonly UnifiedSpecSearchResult[]
  readonly documents: readonly UnifiedDocumentSearchResult[]
}

const SYMBOL_TIER_WEIGHT: Readonly<Record<SymbolSearchMatchTier, number>> = {
  'exact-logical-identity': 7,
  'exact-public-binding': 6,
  'exact-declaration': 5,
  'normalized-declaration': 4,
  'logical-component': 3,
  'exact-local-symbol': 2,
  textual: 1,
}

const MATCH_KIND_WEIGHT: Readonly<Record<SourceSearchMatchKind, number>> = {
  'full-query': 3,
  'raw-token': 2,
  'expanded-token': 1,
}

/** Orchestrates semantic and content search lanes for every graph category. */
export class SearchCodeGraph {
  /**
   * Creates a unified graph-search use case.
   * @param store - Open graph store.
   */
  constructor(private readonly store: GraphStore) {}

  /**
   * Executes one multi-category search and applies all grouping, suppression, and
   * final limits inside Code Graph.
   * @param input - Query, selected categories, filters, limit, and snippet preference.
   * @returns Deterministic category-grouped search projection.
   */
  async execute(input: SearchCodeGraphInput): Promise<SearchCodeGraphResult> {
    const plan = expandSearchQuery(input.query)
    if (plan.normalizedQuery.length === 0) {
      return { symbols: [], files: [], specs: [], documents: [] }
    }
    const selected = new Set(input.categories)
    const options: SearchOptions = {
      query: input.query,
      limit: Math.max(input.limit * 4, input.limit),
      ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
      ...(input.filePattern !== undefined ? { filePattern: input.filePattern } : {}),
      ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
      ...(input.excludePaths !== undefined ? { excludePaths: input.excludePaths } : {}),
      ...(input.excludeWorkspaces !== undefined
        ? { excludeWorkspaces: input.excludeWorkspaces }
        : {}),
    }

    const [symbolCandidates, specs, documents] = await Promise.all([
      selected.has('symbols') ? this.executeSymbols(options) : Promise.resolve([]),
      selected.has('specs') ? this.store.searchSpecs(options) : Promise.resolve([]),
      selected.has('documents') ? this.store.searchDocuments(options) : Promise.resolve([]),
    ])
    const symbols = symbolCandidates.slice(0, input.limit)
    const files = selected.has('files') ? await this.searchFiles(input, plan, symbols) : []

    return {
      symbols,
      files,
      specs: specs.slice(0, input.limit),
      documents: documents.slice(0, input.limit),
    }
  }

  /**
   * Preserves the compatibility symbol-only operation while using semantic tiers.
   * @param options - Existing symbol-search query and filters.
   * @returns Logically grouped symbol results.
   */
  async executeSymbols(options: SearchOptions): Promise<readonly ReferenceAwareSymbolResult[]> {
    const [hits, queriedBindings, directLogicalTargets] = await Promise.all([
      this.store.searchSymbols(options),
      this.store.findPublicBindingsByExportedNames([options.query.trim()]),
      this.store.findLogicalSymbolsByIds([options.query.trim()]),
    ])
    if (hits.length === 0 && queriedBindings.length === 0 && directLogicalTargets.length === 0) {
      return []
    }

    const lookups = deduplicateLogicalLookups(
      hits.map(({ symbol }) => ({
        workspace: workspaceFromPath(symbol.filePath, options.workspace),
        surface: undefined,
        name: symbol.name,
        space: undefined,
        ownerId: undefined,
        memberForm: undefined,
      })),
    )
    const [hitTargets, bindingTargets] = await Promise.all([
      this.store.findLogicalSymbols(lookups),
      this.store.findLogicalSymbolsByIds(
        queriedBindings.flatMap((binding) =>
          binding.targetId === undefined ? [] : [binding.targetId],
        ),
      ),
    ])
    const logicalTargets = deduplicateBy(
      [...directLogicalTargets, ...hitTargets, ...bindingTargets],
      (target) => target.id,
    )
    const declarations =
      logicalTargets.length === 0
        ? []
        : await this.store.findDeclarations(logicalTargets.map((target) => target.id))
    const targetIdsBySymbolId = new Map(
      declarations.map((declaration) => [
        declaration.declaration.symbolId,
        declaration.logicalSymbolId,
      ]),
    )
    const targetById = new Map(logicalTargets.map((target) => [target.id, target]))
    const publicBindings = await this.store.findPublicBindingsByExportedNames(
      [
        ...new Set(logicalTargets.flatMap((target) => identityTerms(options.query, target.name))),
      ].sort(),
    )
    const declarationsByTarget = groupBy(declarations, (item) => item.logicalSymbolId)
    const bindingsByTarget = groupBy(
      publicBindings.filter((binding) => binding.targetId !== undefined),
      (binding) => binding.targetId!,
    )
    const hitsByTarget = groupBy(
      hits,
      ({ symbol }) => targetIdsBySymbolId.get(symbol.id) ?? symbol.id,
    )
    const resultIds = new Set([
      ...directLogicalTargets.map((target) => target.id),
      ...hitsByTarget.keys(),
      ...publicBindings.flatMap((binding) =>
        binding.targetId === undefined ? [] : [binding.targetId],
      ),
    ])

    return [...resultIds]
      .map((targetId): ReferenceAwareSymbolResult => {
        const groupedHits = hitsByTarget.get(targetId) ?? []
        const logicalTarget = targetById.get(targetId) ?? null
        const bindings = sortBindings(bindingsByTarget.get(targetId) ?? [])
        const semantic = classifySymbolMatch(options.query, logicalTarget, bindings, groupedHits)
        return {
          logicalTarget,
          declarations: sortDeclarations(declarationsByTarget.get(targetId) ?? []),
          publicBindings: bindings,
          matchedPublicBindings: bindings.filter((binding) =>
            isExactBindingMatch(options.query, binding),
          ),
          hits: [...groupedHits].sort(compareHits),
          score: groupedHits.length === 0 ? 0 : Math.max(...groupedHits.map((hit) => hit.score)),
          ...semantic,
        }
      })
      .sort(compareResults)
      .slice(0, options.limit ?? 20)
  }

  /**
   * Resolves exact persisted source occurrences, refilling pages after suppression.
   * @param input - Unified request and active filters.
   * @param plan - Shared normalized and expanded query plan.
   * @param symbols - Semantic symbol groups eligible to suppress declaration duplicates.
   * @returns Ordered file groups capped after suppression.
   */
  private async searchFiles(
    input: SearchCodeGraphInput,
    plan: ReturnType<typeof expandSearchQuery>,
    symbols: readonly ReferenceAwareSymbolResult[],
  ): Promise<SourceFileSearchResult[]> {
    const result: SourceFileSearchResult[] = []
    const pageSize = Math.max(64, input.limit * 4)
    let cursor: string | undefined
    const consumedCursors = new Set<string>()
    const consumedFiles = new Set<string>()

    do {
      const page = await this.store.searchSourceContentCandidates({
        normalizedQuery: plan.normalizedQuery,
        rawTerms: plan.rawTokens,
        expandedTerms: plan.expandedTokens,
        limit: pageSize,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(input.filePattern !== undefined ? { filePattern: input.filePattern } : {}),
        ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
        ...(input.excludePaths !== undefined ? { excludePaths: input.excludePaths } : {}),
        ...(input.excludeWorkspaces !== undefined
          ? { excludeWorkspaces: input.excludeWorkspaces }
          : {}),
      })
      for (const candidate of page.candidates) {
        if (consumedFiles.has(candidate.file.path)) continue
        consumedFiles.add(candidate.file.path)
        const visibleMatches = findSourceMatches(
          candidate.file.content ?? '',
          plan,
          input.includeSnippet,
        ).filter((match) => !isRepresentedByReturnedSymbol(candidate.file.path, match, symbols))
        if (visibleMatches.length === 0) continue
        const orderedMatches = [...visibleMatches].sort(
          input.exactFile === true
            ? compareSourceMatchesByPosition
            : compareSourceMatchesByRelevance,
        )
        const matches = input.exactFile === true ? orderedMatches : orderedMatches.slice(0, 10)
        result.push({
          file: candidate.file,
          score: scoreFileMatches(visibleMatches, plan.rawTokens.length, candidate.backendScore),
          matches,
          totalMatches: visibleMatches.length,
          omittedMatches: visibleMatches.length - matches.length,
        })
      }
      const nextCursor = page.nextCursor
      if (nextCursor !== undefined && consumedCursors.has(nextCursor)) {
        cursor = undefined
      } else {
        if (nextCursor !== undefined) consumedCursors.add(nextCursor)
        cursor = nextCursor
      }
    } while (cursor !== undefined)

    return result
      .sort(
        (left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path),
      )
      .slice(0, input.limit)
  }
}

/**
 * Classifies one symbol group into the stable semantic precedence tiers.
 * @param query - Original user query.
 * @param target - Resolved logical target, when proven.
 * @param bindings - Public routes reaching the target.
 * @param hits - Backend declaration or textual hits.
 * @returns Stable semantic tier and evidence reasons.
 */
function classifySymbolMatch(
  query: string,
  target: LogicalSymbol | null,
  bindings: readonly PublicBinding[],
  hits: readonly ReferenceAwareSymbolHit[],
): Pick<ReferenceAwareSymbolResult, 'matchTier' | 'matchReasons'> {
  const raw = query.trim()
  const normalized = raw.toLowerCase()
  if (target !== null && target.id === raw) {
    return { matchTier: 'exact-logical-identity', matchReasons: ['logical-identity-exact'] }
  }
  if (bindings.some((binding) => isExactBindingMatch(raw, binding))) {
    return { matchTier: 'exact-public-binding', matchReasons: ['public-binding-exact'] }
  }
  if (target !== null && hits.some(({ symbol }) => symbol.name === raw)) {
    return { matchTier: 'exact-declaration', matchReasons: ['declaration-case-exact'] }
  }
  if (target !== null && hits.some(({ symbol }) => symbol.name.toLowerCase() === normalized)) {
    return { matchTier: 'normalized-declaration', matchReasons: ['declaration-normalized-exact'] }
  }
  if (
    target !== null &&
    [target.surface, target.name, target.ownerId ?? ''].some((value) =>
      value.toLowerCase().includes(normalized),
    )
  ) {
    return { matchTier: 'logical-component', matchReasons: ['logical-component'] }
  }
  if (target === null && hits.some(({ symbol }) => symbol.name === raw)) {
    return { matchTier: 'exact-local-symbol', matchReasons: ['local-symbol-exact'] }
  }
  return { matchTier: 'textual', matchReasons: ['backend-text-relevance'] }
}

/**
 * Tests whether a public binding identity exactly matches a request.
 * @param query - Original user query.
 * @param binding - Public binding candidate.
 * @returns Whether the exported spelling or complete external id matches exactly.
 */
function isExactBindingMatch(query: string, binding: PublicBinding): boolean {
  const raw = query.trim()
  return binding.exportedName === raw || binding.id === raw
}

/**
 * Finds exact literal occurrences and retains the strongest provenance per range.
 * @param content - Persisted source content.
 * @param plan - Normalized and expanded query plan.
 * @param includeSnippet - Whether to attach bounded previews.
 * @returns Ordered exact source occurrences.
 */
function findSourceMatches(
  content: string,
  plan: ReturnType<typeof expandSearchQuery>,
  includeSnippet: boolean,
): SourceContentMatch[] {
  const candidates: Array<{ token: string; kind: SourceSearchMatchKind }> = [
    { token: plan.normalizedQuery, kind: 'full-query' },
    ...plan.rawTokens.map((token) => ({ token, kind: 'raw-token' as const })),
    ...plan.expandedTokens.map((token) => ({ token, kind: 'expanded-token' as const })),
  ]
  const lower = content.toLowerCase()
  const byRange = new Map<string, SourceContentMatch>()
  for (const { token, kind } of candidates) {
    if (token.length === 0) continue
    let offset = 0
    while (offset <= lower.length - token.length) {
      const index = lower.indexOf(token, offset)
      if (index < 0) break
      const range = offsetsToRange(content, index, index + token.length)
      const match: SourceContentMatch = {
        range,
        matchedText: content.slice(index, index + token.length),
        matchKind: kind,
        sourceToken: token,
        ...(includeSnippet ? { snippet: buildSnippet(content, range) } : {}),
      }
      const key = rangeKey(range)
      const existing = byRange.get(key)
      if (
        existing === undefined ||
        MATCH_KIND_WEIGHT[kind] > MATCH_KIND_WEIGHT[existing.matchKind]
      ) {
        byRange.set(key, match)
      }
      offset = index + Math.max(1, token.length)
    }
  }
  return [...byRange.values()].sort(compareSourceMatchesByPosition)
}

/**
 * Returns whether an occurrence overlaps a returned declaration selection range.
 * @param filePath - Canonical candidate file path.
 * @param match - Exact source occurrence.
 * @param groups - Returned semantic symbol groups.
 * @returns Whether the occurrence is already represented by a symbol result.
 */
function isRepresentedByReturnedSymbol(
  filePath: string,
  match: SourceContentMatch,
  groups: readonly ReferenceAwareSymbolResult[],
): boolean {
  return groups.some((group) =>
    group.hits.some(
      ({ symbol }) =>
        symbol.filePath === filePath && rangesOverlap(match.range, symbol.selectionRange),
    ),
  )
}

/**
 * Scores verified file occurrences independently from backend discovery scores.
 * @param matches - Verified source occurrences.
 * @param rawTermCount - Number of original whitespace terms.
 * @param backendScore - Backend candidate-discovery score.
 * @returns Composite semantic and backend score.
 */
function scoreFileMatches(
  matches: readonly SourceContentMatch[],
  rawTermCount: number,
  backendScore: number,
): number {
  const kinds = new Set(matches.map((match) => match.matchKind))
  const rawTokens = new Set(
    matches.filter((match) => match.matchKind === 'raw-token').map((match) => match.sourceToken),
  )
  const tier = kinds.has('full-query')
    ? 4
    : rawTermCount > 0 && rawTokens.size >= rawTermCount
      ? 3
      : kinds.has('raw-token')
        ? 2
        : 1
  return tier * 1_000_000 + matches.length * 1_000 + backendScore
}

/**
 * Converts UTF-16 content offsets into the public half-open source coordinates.
 * @param content - Complete persisted content.
 * @param start - Inclusive UTF-16 start offset.
 * @param end - Exclusive UTF-16 end offset.
 * @returns Public half-open source range.
 */
function offsetsToRange(content: string, start: number, end: number): SourceRange {
  const startParts = content.slice(0, start).split('\n')
  const endParts = content.slice(0, end).split('\n')
  return {
    startLine: startParts.length,
    startColumn: startParts.at(-1)?.replace(/\r$/, '').length ?? 0,
    endLine: endParts.length,
    endColumn: endParts.at(-1)?.replace(/\r$/, '').length ?? 0,
  }
}

/**
 * Builds a bounded source preview around one exact occurrence.
 * @param content - Complete persisted content.
 * @param matchRange - Exact occurrence range.
 * @returns Preview content and its independent source range.
 */
function buildSnippet(
  content: string,
  matchRange: SourceRange,
): { range: SourceRange; content: string } {
  const lines = content.split(/\r?\n/)
  const startLine = Math.max(1, matchRange.startLine - 2)
  const endLine = Math.min(lines.length, matchRange.endLine + 2)
  const snippetLines = lines.slice(startLine - 1, endLine)
  return {
    range: {
      startLine,
      startColumn: 0,
      endLine,
      endColumn: snippetLines.at(-1)?.length ?? 0,
    },
    content: snippetLines.join('\n'),
  }
}

/**
 * Tests overlap between two half-open source ranges.
 * @param left - First range.
 * @param right - Second range.
 * @returns Whether the ranges share at least one source position.
 */
function rangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return (
    comparePosition(left.startLine, left.startColumn, right.endLine, right.endColumn) < 0 &&
    comparePosition(right.startLine, right.startColumn, left.endLine, left.endColumn) < 0
  )
}

/**
 * Compares two source positions in document order.
 * @param leftLine - First position line.
 * @param leftColumn - First position column.
 * @param rightLine - Second position line.
 * @param rightColumn - Second position column.
 * @returns Negative, zero, or positive ordering value.
 */
function comparePosition(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number,
): number {
  return leftLine - rightLine || leftColumn - rightColumn
}

/**
 * Produces a stable key for exact-range provenance collapsing.
 * @param range - Exact half-open range.
 * @returns Stable coordinate key.
 */
function rangeKey(range: SourceRange): string {
  return `${range.startLine}:${range.startColumn}:${range.endLine}:${range.endColumn}`
}

/**
 * Orders exact source matches by their complete half-open range.
 * @param left - First source match.
 * @param right - Second source match.
 * @returns Comparator value.
 */
function compareSourceMatchesByPosition(
  left: SourceContentMatch,
  right: SourceContentMatch,
): number {
  return (
    comparePosition(
      left.range.startLine,
      left.range.startColumn,
      right.range.startLine,
      right.range.startColumn,
    ) ||
    comparePosition(
      left.range.endLine,
      left.range.endColumn,
      right.range.endLine,
      right.range.endColumn,
    ) ||
    MATCH_KIND_WEIGHT[right.matchKind] - MATCH_KIND_WEIGHT[left.matchKind] ||
    left.sourceToken.localeCompare(right.sourceToken)
  )
}

/**
 * Orders discovery matches by provenance strength before source position.
 * @param left - First source match.
 * @param right - Second source match.
 * @returns Comparator value.
 */
function compareSourceMatchesByRelevance(
  left: SourceContentMatch,
  right: SourceContentMatch,
): number {
  return (
    MATCH_KIND_WEIGHT[right.matchKind] - MATCH_KIND_WEIGHT[left.matchKind] ||
    compareSourceMatchesByPosition(left, right)
  )
}

/**
 * Resolves a canonical path's workspace with a compatibility fallback.
 * @param filePath - Canonical or legacy file path.
 * @param fallback - Explicit workspace filter, when present.
 * @returns Workspace name.
 */
function workspaceFromPath(filePath: string, fallback: string | undefined): string {
  const separator = filePath.indexOf(':')
  return separator > 0 ? filePath.slice(0, separator) : (fallback ?? 'default')
}

/**
 * Builds stable identity terms used to retrieve public routes.
 * @param query - Original query.
 * @param declaredName - Declaration spelling.
 * @returns Deduplicated ordered identity terms.
 */
function identityTerms(query: string, declaredName: string): string[] {
  return [...new Set([query.trim(), declaredName].filter((value) => value.length > 0))].sort()
}

/**
 * Deduplicates structured logical lookups without flattening their fields.
 * @param lookups - Structured lookup candidates.
 * @returns Stable distinct lookups.
 */
function deduplicateLogicalLookups(lookups: readonly LogicalSymbolLookup[]): LogicalSymbolLookup[] {
  return deduplicateBy(lookups, (lookup) =>
    JSON.stringify([
      lookup.workspace,
      lookup.surface,
      lookup.name,
      lookup.space,
      lookup.ownerId,
      lookup.memberForm,
    ]),
  )
}

/**
 * Deduplicates values by a caller-provided stable key.
 * @param values - Input values.
 * @param key - Stable key selector.
 * @returns Distinct values in last-value map order.
 */
function deduplicateBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()]
}

/**
 * Groups values under caller-provided string keys while preserving input order.
 * @param values - Input values.
 * @param key - Group key selector.
 * @returns Mutable grouped value arrays.
 */
function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const groupKey = key(value)
    const group = groups.get(groupKey) ?? []
    group.push(value)
    groups.set(groupKey, group)
  }
  return groups
}

/**
 * Sorts declarations by canonical source location.
 * @param values - Logical declarations.
 * @returns Deterministically ordered declarations.
 */
function sortDeclarations(values: readonly LogicalDeclaration[]): LogicalDeclaration[] {
  return [...values].sort(
    (left, right) =>
      left.declaration.location.filePath.localeCompare(right.declaration.location.filePath) ||
      left.declaration.location.line - right.declaration.location.line ||
      left.declaration.location.column - right.declaration.location.column ||
      left.declaration.symbolId.localeCompare(right.declaration.symbolId),
  )
}

/**
 * Sorts public bindings by surface, spelling, space, and identity.
 * @param values - Public binding values.
 * @returns Deterministically ordered bindings.
 */
function sortBindings(values: readonly PublicBinding[]): PublicBinding[] {
  return [...values].sort(
    (left, right) =>
      left.surface.localeCompare(right.surface) ||
      left.exportedName.localeCompare(right.exportedName) ||
      left.space.localeCompare(right.space) ||
      left.id.localeCompare(right.id),
  )
}

/**
 * Orders backend symbol hits deterministically within a semantic group.
 * @param left - First hit.
 * @param right - Second hit.
 * @returns Comparator value.
 */
function compareHits(left: ReferenceAwareSymbolHit, right: ReferenceAwareSymbolHit): number {
  return (
    right.score - left.score ||
    left.symbol.filePath.localeCompare(right.symbol.filePath) ||
    left.symbol.line - right.symbol.line ||
    left.symbol.id.localeCompare(right.symbol.id)
  )
}

/**
 * Orders logical symbol groups by semantic tier before backend score.
 * @param left - First result group.
 * @param right - Second result group.
 * @returns Comparator value.
 */
function compareResults(
  left: ReferenceAwareSymbolResult,
  right: ReferenceAwareSymbolResult,
): number {
  return (
    SYMBOL_TIER_WEIGHT[right.matchTier] - SYMBOL_TIER_WEIGHT[left.matchTier] ||
    right.score - left.score ||
    (left.logicalTarget?.id ?? left.hits[0]?.symbol.id ?? '').localeCompare(
      right.logicalTarget?.id ?? right.hits[0]?.symbol.id ?? '',
    )
  )
}
