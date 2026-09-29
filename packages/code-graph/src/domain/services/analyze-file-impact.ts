import { type GraphStore } from '../ports/graph-store.js'
import {
  type AffectedSymbol,
  type CoveringSpecImpact,
  type FileImpactResult,
  type ImpactResult,
  type ImpactResultFilter,
} from '../value-objects/impact-result.js'
import { computeRiskLevel, maxRisk } from '../value-objects/risk-level.js'
import { type DocumentNode } from '../value-objects/document-node.js'
import { type FileNode } from '../value-objects/file-node.js'
import { type Relation } from '../value-objects/relation.js'
import {
  RelationType,
  type RelationType as RelationTypeValue,
} from '../value-objects/relation-type.js'
import { type SpecNode } from '../value-objects/spec-node.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { analyzeImpact, type ImpactResolutionProvider } from './analyze-impact.js'
import { mapWithConcurrency } from './map-with-concurrency.js'

/** Maximum active impact analyses in one top-level file-impact operation. */
export const IMPACT_CONCURRENCY = 4

/** Shared read view and budget supplied by multi-file impact aggregation. */
export interface ImpactExecutionContext {
  readonly store: GraphStore
  readonly concurrency: number
}

/**
 * Analyzes the combined impact of all symbols within a file.
 * Uses both CALLS (symbol-level) and IMPORTS (file-level) to compute impact.
 * @param store - The graph store to query.
 * @param filePath - The path of the file to analyze.
 * @param direction - The traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @param resolve - Optional provider of pre-resolved logical selectors.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns The aggregated file impact result across all symbols in the file.
 */
export async function analyzeFileImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
  filter?: ImpactResultFilter,
): Promise<FileImpactResult> {
  const details = await analyzeFileImpactDetails(
    store,
    filePath,
    direction,
    maxDepth,
    resolve,
    undefined,
    filter,
  )
  const fileCoveringSpecs = materializesImpactType(filter, 'specs')
    ? await collectFilteredCoveringSpecs(store, details.fileDepths, details.symbolDepths, filter)
    : []
  const coveringSpecIds = new Set(fileCoveringSpecs.map((spec) => spec.specId))
  const coveringSpecs = [...fileCoveringSpecs]
  for (const specId of details.result.affectedSpecs) {
    if (!coveringSpecIds.has(specId)) {
      coveringSpecs.push({
        specId,
        minDepth: 1,
        evidence: [],
      })
      coveringSpecIds.add(specId)
    }
  }
  coveringSpecs.sort(
    (left, right) => left.minDepth - right.minDepth || left.specId.localeCompare(right.specId),
  )
  return {
    ...details.result,
    affectedSpecs: materializesImpactType(filter, 'specs') ? [...coveringSpecIds].sort() : [],
    coveringSpecs,
  }
}

/** Internal resource-depth projection reused by multi-file impact. */
export interface FileImpactDetails {
  readonly result: Omit<FileImpactResult, 'coveringSpecs'>
  readonly fileDepths: ReadonlyMap<string, number>
  readonly symbolDepths: ReadonlyMap<string, number>
}

/**
 * Computes file impact and exact resource depths without issuing coverage queries.
 * @param store - Graph store.
 * @param filePath - Canonical input file.
 * @param direction - Traversal direction.
 * @param maxDepth - Traversal limit.
 * @param resolve - Optional semantic target resolver.
 * @param context - Optional shared memoized store and concurrency budget.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Impact plus shallowest file/symbol depths.
 */
export async function analyzeFileImpactDetails(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
  context?: ImpactExecutionContext,
  filter?: ImpactResultFilter,
): Promise<FileImpactDetails> {
  const cachedStore = context?.store ?? createMemoizedReadStore(store)
  const symbolConcurrency = context === undefined ? IMPACT_CONCURRENCY : 1

  // Symbol-level impact via CALLS
  const symbols = await cachedStore.findSymbols({ filePath })
  const symbolResults = await mapWithConcurrency(symbols, symbolConcurrency, async (symbol) =>
    analyzeImpact(
      cachedStore,
      symbol.id,
      direction,
      maxDepth,
      resolve === undefined ? undefined : await resolve(symbol.id),
      filter,
    ),
  )

  // File-level impact via IMPORTS (BFS)
  const fileImpact = await analyzeFileImportImpact(
    cachedStore,
    filePath,
    direction,
    maxDepth,
    filter,
  )

  // Merge file-level and symbol-level affected files into a deduped set
  const affectedFileSet = new Set<string>()
  for (const f of fileImpact.affectedFiles) {
    affectedFileSet.add(f)
  }
  for (const result of symbolResults) {
    for (const f of result.affectedFiles) {
      affectedFileSet.add(f)
    }
  }

  // Use the larger of file-level or symbol-level counts per depth
  // File-level counts are already deduped (from BFS); symbol-level
  // sums may overcount shared dependents, so we take the file-level
  // count as the floor and only escalate if symbols reveal more
  const directDependents = Math.max(
    fileImpact.directDependents,
    ...symbolResults.map((r) => r.directDependents),
  )
  const indirectDependents = Math.max(
    fileImpact.indirectDependents,
    ...symbolResults.map((r) => r.indirectDependents),
  )
  const transitiveDependents = Math.max(
    fileImpact.transitiveDependents,
    ...symbolResults.map((r) => r.transitiveDependents),
  )

  let overallRisk = fileImpact.riskLevel
  for (const result of symbolResults) {
    overallRisk = maxRisk(overallRisk, result.riskLevel)
  }

  const fileDepths = new Map<string, number>([[filePath, 0]])
  for (const [depth, files] of fileImpact.depthFiles) {
    for (const affectedFile of files) setMinimumDepth(fileDepths, affectedFile, depth)
  }
  const symbolDepths = new Map<string, number>()
  for (const symbol of symbols) symbolDepths.set(symbol.id, 0)
  if (materializesImpactType(filter, 'symbols')) {
    for (const result of symbolResults) {
      for (const symbol of result.affectedSymbols) {
        setMinimumDepth(symbolDepths, symbol.id, symbol.depth)
        setMinimumDepth(fileDepths, symbol.filePath, symbol.depth)
      }
    }
  }

  const symbolAffectedSpecs = new Set(symbolResults.flatMap((r) => r.affectedSpecs))

  return {
    result: {
      target: filePath,
      directDependents,
      indirectDependents,
      transitiveDependents,
      riskLevel: overallRisk,
      affectedFiles: materializesImpactType(filter, 'files') ? [...affectedFileSet] : [],
      affectedSymbols: materializesImpactType(filter, 'symbols')
        ? deduplicateSymbols(symbolResults.flatMap((r) => r.affectedSymbols))
        : [],
      affectedProcesses: [],
      affectedSpecs: materializesImpactType(filter, 'specs') ? [...symbolAffectedSpecs].sort() : [],
      symbols: materializesImpactType(filter, 'symbols') ? symbolResults : [],
    },
    fileDepths,
    symbolDepths,
  }
}

/**
 * BFS over IMPORTS relations to find files that depend on the given file.
 * @param store - The graph store to query.
 * @param filePath - The file to analyze.
 * @param direction - upstream (importers), downstream (importees), or both.
 * @param maxDepth - Maximum BFS depth.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns An impact result based on file-level import relationships.
 */
async function analyzeFileImportImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  filter?: ImpactResultFilter,
): Promise<ImpactResult & { readonly depthFiles: ReadonlyMap<number, readonly string[]> }> {
  if (filter !== undefined) {
    return analyzeFilteredFileImportImpact(store, filePath, direction, maxDepth, filter)
  }

  const visited = new Set<string>([filePath])
  const depthFiles = new Map<number, string[]>()

  let currentFiles = [filePath]

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFiles: string[] = []

    for (const fp of currentFiles) {
      const relations = []
      if (direction === 'upstream' || direction === 'both') {
        relations.push(...(await store.getImporters(fp)))
      }
      if (direction === 'downstream' || direction === 'both') {
        relations.push(...(await store.getImportees(fp)))
      }

      for (const rel of relations) {
        // For upstream (importers): the dependent is rel.source (the file that imports us)
        // For downstream (importees): the dependency is rel.target (the file we import)
        // For both: pick the end that isn't the current file
        const candidate = rel.source === fp ? rel.target : rel.source
        if (!visited.has(candidate)) {
          visited.add(candidate)
          nextFiles.push(candidate)
        }
      }
    }

    if (nextFiles.length > 0) {
      depthFiles.set(depth, nextFiles)
    }

    if (nextFiles.length === 0) break
    currentFiles = nextFiles
  }

  const directDependents = depthFiles.get(1)?.length ?? 0
  const indirectDependents = depthFiles.get(2)?.length ?? 0
  let transitiveDependents = 0
  for (const [depth, files] of depthFiles) {
    if (depth >= 3) transitiveDependents += files.length
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
  const affectedFiles: string[] = []
  for (const files of depthFiles.values()) {
    affectedFiles.push(...files)
  }

  return {
    target: filePath,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles,
    affectedSymbols: [],
    affectedSpecs: [],
    affectedProcesses: [],
    depthFiles,
  }
}

/**
 * Traverses file imports through the storage-owned filtering boundary.
 *
 * The unfiltered operation deliberately remains in {@link analyzeFileImportImpact}
 * so existing callers retain its per-file query ordering. With a filter present,
 * every depth is one admitted backend frontier before it contributes to the
 * visited set, counts, or risk.
 *
 * @param store - Graph store that owns filtered frontier admission.
 * @param filePath - Canonical root file path.
 * @param direction - Traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param filter - Provider-owned membership and materialization constraints.
 * @returns File impact with only admitted frontier evidence.
 */
async function analyzeFilteredFileImportImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  filter: ImpactResultFilter,
): Promise<ImpactResult & { readonly depthFiles: ReadonlyMap<number, readonly string[]> }> {
  const visited = new Set<string>([filePath])
  const depthFiles = new Map<number, string[]>()
  let currentFiles = [filePath]

  for (let depth = 1; depth <= maxDepth && currentFiles.length > 0; depth++) {
    const result = await store.queryImpactFrontier({
      resource: 'file',
      frontier: currentFiles,
      direction,
      depth,
      maxDepth,
      relationTypes: [RelationType.Imports],
      filter,
    })
    const nextFiles = collectAdjacentFileIds(result.relations, currentFiles, direction)
      .filter((path) => !visited.has(path))
      .sort()
    if (nextFiles.length === 0) break

    for (const path of nextFiles) visited.add(path)
    depthFiles.set(depth, nextFiles)
    currentFiles = nextFiles
  }

  const directDependents = depthFiles.get(1)?.length ?? 0
  const indirectDependents = depthFiles.get(2)?.length ?? 0
  let transitiveDependents = 0
  for (const [depth, files] of depthFiles) {
    if (depth >= 3) transitiveDependents += files.length
  }
  const totalDependents = directDependents + indirectDependents + transitiveDependents
  const affectedFiles = materializesImpactType(filter, 'files')
    ? [...depthFiles.values()].flat()
    : []

  return {
    target: filePath,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles,
    affectedSymbols: [],
    affectedSpecs: [],
    affectedProcesses: [],
    depthFiles,
  }
}

/**
 * Extracts admitted file endpoints for a frontier and traversal direction.
 * @param relations - Admitted import relations returned by the store.
 * @param frontier - Current canonical file frontier.
 * @param direction - Traversal direction that selected the relations.
 * @returns Deduplicated adjacent file paths.
 */
function collectAdjacentFileIds(
  relations: readonly Relation[],
  frontier: readonly string[],
  direction: 'upstream' | 'downstream' | 'both',
): string[] {
  const current = new Set(frontier)
  const adjacent = new Set<string>()
  for (const relation of relations) {
    if ((direction === 'upstream' || direction === 'both') && current.has(relation.target)) {
      adjacent.add(relation.source)
    }
    if ((direction === 'downstream' || direction === 'both') && current.has(relation.source)) {
      adjacent.add(relation.target)
    }
  }
  return [...adjacent]
}

/**
 * Treats omitted or empty result-type filters as fully materialized.
 * @param filter - Optional provider-owned result filter.
 * @param type - Result category whose materialization is being checked.
 * @returns Whether the category must remain materialized.
 */
function materializesImpactType(
  filter: ImpactResultFilter | undefined,
  type: 'files' | 'symbols' | 'specs',
): boolean {
  return filter?.types === undefined || filter.types.length === 0 || filter.types.includes(type)
}

/**
 * Resolves covering specs in two batch queries and folds all evidence deterministically.
 * @param store - Graph store.
 * @param fileDepths - Canonical file paths and shallowest depths.
 * @param symbolDepths - Symbol ids and shallowest depths.
 * @returns Deduplicated ordered covering specs.
 */
export async function collectCoveringSpecs(
  store: GraphStore,
  fileDepths: ReadonlyMap<string, number>,
  symbolDepths: ReadonlyMap<string, number>,
): Promise<CoveringSpecImpact[]> {
  const [fileRelations, symbolRelations] = await Promise.all([
    store.getCoveringSpecsForFiles([...fileDepths.keys()]),
    store.getCoveringSpecsForSymbols([...symbolDepths.keys()]),
  ])
  const evidenceBySpec = new Map<
    string,
    Map<
      string,
      { readonly kind: 'file' | 'symbol'; readonly target: string; readonly depth: number }
    >
  >()
  for (const relation of fileRelations) {
    const depth = fileDepths.get(relation.target)
    if (depth !== undefined)
      addCoverageEvidence(evidenceBySpec, relation.source, 'file', relation.target, depth)
  }
  for (const relation of symbolRelations) {
    const depth = symbolDepths.get(relation.target)
    if (depth !== undefined) {
      addCoverageEvidence(evidenceBySpec, relation.source, 'symbol', relation.target, depth)
    }
  }
  return [...evidenceBySpec]
    .map(([specId, evidenceMap]) => {
      const evidence = [...evidenceMap.values()].sort(
        (left, right) =>
          left.depth - right.depth ||
          left.kind.localeCompare(right.kind) ||
          left.target.localeCompare(right.target),
      )
      return {
        specId,
        minDepth: Math.min(...evidence.map((item) => item.depth)),
        evidence,
      }
    })
    .sort(
      (left, right) => left.minDepth - right.minDepth || left.specId.localeCompare(right.specId),
    )
}

/**
 * Resolves covering specs through admitted storage frontiers when a filter is present.
 *
 * Coverage is another membership boundary: the store applies workspace predicates to
 * the owning spec before its relation becomes evidence. Symbol-kind predicates remain
 * meaningful on the symbol endpoint for the symbol coverage frontier.
 *
 * @param store - Graph store.
 * @param fileDepths - Canonical file paths and shallowest depths.
 * @param symbolDepths - Symbol ids and shallowest depths.
 * @param filter - Provider-owned membership and materialization constraints.
 * @returns Deduplicated ordered covering specs admitted by the store.
 */
export async function collectFilteredCoveringSpecs(
  store: GraphStore,
  fileDepths: ReadonlyMap<string, number>,
  symbolDepths: ReadonlyMap<string, number>,
  filter?: ImpactResultFilter,
): Promise<CoveringSpecImpact[]> {
  const [fileResult, symbolResult] = await Promise.all([
    store.queryImpactFrontier({
      resource: 'spec',
      frontier: [...fileDepths.keys()],
      direction: 'upstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversFile],
      ...(filter === undefined ? {} : { filter }),
    }),
    store.queryImpactFrontier({
      resource: 'spec',
      frontier: [...symbolDepths.keys()],
      direction: 'upstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversSymbol],
      ...(filter === undefined ? {} : { filter }),
    }),
  ])
  const admittedSpecIds = new Set(
    [...fileResult.specs, ...symbolResult.specs].map((spec) => spec.specId),
  )
  const evidenceBySpec = new Map<
    string,
    Map<
      string,
      { readonly kind: 'file' | 'symbol'; readonly target: string; readonly depth: number }
    >
  >()

  for (const relation of fileResult.relations) {
    const depth = fileDepths.get(relation.target)
    if (depth !== undefined && admittedSpecIds.has(relation.source)) {
      addCoverageEvidence(evidenceBySpec, relation.source, 'file', relation.target, depth)
    }
  }
  for (const relation of symbolResult.relations) {
    const depth = symbolDepths.get(relation.target)
    if (depth !== undefined && admittedSpecIds.has(relation.source)) {
      addCoverageEvidence(evidenceBySpec, relation.source, 'symbol', relation.target, depth)
    }
  }
  return formatCoveringSpecs(evidenceBySpec)
}

/**
 * Formats deterministic covering-spec evidence collected from any store boundary.
 * @param evidenceBySpec - Evidence grouped by admitted covering spec identifier.
 * @returns Deterministically ordered covering-spec impacts.
 */
function formatCoveringSpecs(
  evidenceBySpec: ReadonlyMap<
    string,
    ReadonlyMap<
      string,
      { readonly kind: 'file' | 'symbol'; readonly target: string; readonly depth: number }
    >
  >,
): CoveringSpecImpact[] {
  return [...evidenceBySpec]
    .map(([specId, evidenceMap]) => {
      const evidence = [...evidenceMap.values()].sort(
        (left, right) =>
          left.depth - right.depth ||
          left.kind.localeCompare(right.kind) ||
          left.target.localeCompare(right.target),
      )
      return {
        specId,
        minDepth: Math.min(...evidence.map((item) => item.depth)),
        evidence,
      }
    })
    .sort(
      (left, right) => left.minDepth - right.minDepth || left.specId.localeCompare(right.specId),
    )
}

/**
 * Adds one distinct coverage-evidence item under its owning spec.
 * @param target - Evidence maps grouped by spec id.
 * @param specId - Covering spec identifier.
 * @param kind - Covered resource kind.
 * @param resource - Covered resource identity.
 * @param depth - Shallowest impact depth.
 */
function addCoverageEvidence(
  target: Map<
    string,
    Map<
      string,
      { readonly kind: 'file' | 'symbol'; readonly target: string; readonly depth: number }
    >
  >,
  specId: string,
  kind: 'file' | 'symbol',
  resource: string,
  depth: number,
): void {
  const evidence =
    target.get(specId) ??
    new Map<
      string,
      { readonly kind: 'file' | 'symbol'; readonly target: string; readonly depth: number }
    >()
  const key = `${kind}:${resource}:${String(depth)}`
  evidence.set(key, { kind, target: resource, depth })
  target.set(specId, evidence)
}

/**
 * Retains the shallowest observed traversal depth for one resource.
 * @param target - Mutable resource-depth map.
 * @param key - Resource identity.
 * @param depth - Candidate depth.
 */
function setMinimumDepth(target: Map<string, number>, key: string, depth: number): void {
  const existing = target.get(key)
  if (existing === undefined || depth < existing) target.set(key, depth)
}

/**
 * Deduplicates affected symbols, keeping the entry with the shallowest depth.
 * @param symbols - Array of affected symbols (may contain duplicates by id).
 * @returns Deduplicated array, each symbol at its shallowest observed depth.
 */
function deduplicateSymbols(symbols: readonly AffectedSymbol[]): AffectedSymbol[] {
  const map = new Map<string, AffectedSymbol>()
  for (const s of symbols) {
    const existing = map.get(s.id)
    if (!existing || s.depth < existing.depth) {
      map.set(s.id, s)
    }
  }
  return [...map.values()]
}

/**
 * Memoizes read-only graph-store calls for the lifetime of a single file-impact analysis.
 * This preserves behaviour while avoiding repeated traversal and lookup queries across
 * multiple symbol-level impact calculations within the same file.
 *
 * @param store - The underlying graph store.
 * @returns A read-through memoized view over the same store.
 */
export function createMemoizedReadStore(store: GraphStore): GraphStore {
  const cache = new Map<string, Promise<unknown>>()
  const symbolCache = new Map<string, Promise<SymbolNode | undefined>>()
  const memoizedStore = Object.create(store) as GraphStore

  const memoize = <T>(methodName: string, call: (...args: readonly unknown[]) => Promise<T>) => {
    return async (...args: readonly unknown[]): Promise<T> => {
      const key = `${methodName}:${JSON.stringify(args)}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        return cached as Promise<T>
      }

      const pending = call(...args)
      cache.set(key, pending as Promise<unknown>)
      return pending
    }
  }

  memoizedStore.getFile = memoize('getFile', (path) => store.getFile(path as string))
  memoizedStore.getSymbol = async (id): Promise<SymbolNode | undefined> => {
    const cached = symbolCache.get(id)
    if (cached !== undefined) return cached
    const pending = store.getSymbol(id)
    symbolCache.set(id, pending)
    return pending
  }
  memoizedStore.getSymbolsByIds = async (symbolIds): Promise<SymbolNode[]> => {
    const uniqueIds = [...new Set(symbolIds)]
    const missingIds = uniqueIds.filter((id) => !symbolCache.has(id))
    if (missingIds.length > 0) {
      const found = await store.getSymbolsByIds(missingIds)
      const foundById = new Map(found.map((symbol) => [symbol.id, symbol]))
      for (const id of missingIds) symbolCache.set(id, Promise.resolve(foundById.get(id)))
    }
    const symbols = await Promise.all(uniqueIds.map((id) => symbolCache.get(id)!))
    return symbols.filter((symbol): symbol is SymbolNode => symbol !== undefined)
  }
  const memoizeRelationBatch = (
    methodName: string,
    call: (
      symbolIds: readonly string[],
      relationTypes: readonly RelationTypeValue[],
    ) => Promise<Relation[]>,
  ) => {
    return async (
      symbolIds: readonly string[],
      relationTypes: readonly RelationTypeValue[],
    ): Promise<Relation[]> => {
      const ids = [...new Set(symbolIds)].sort()
      const types = [...new Set(relationTypes)].sort()
      if (ids.length === 0 || types.length === 0) return []
      const key = `${methodName}:${JSON.stringify([ids, types])}`
      const cached = cache.get(key)
      if (cached !== undefined) return cached as Promise<Relation[]>
      const pending = call(ids, types)
      cache.set(key, pending)
      return pending
    }
  }
  memoizedStore.getIncomingSymbolRelations = memoizeRelationBatch(
    'getIncomingSymbolRelations',
    (ids, types) => store.getIncomingSymbolRelations(ids, types),
  )
  memoizedStore.getOutgoingSymbolRelations = memoizeRelationBatch(
    'getOutgoingSymbolRelations',
    (ids, types) => store.getOutgoingSymbolRelations(ids, types),
  )
  const fileCache = new Map<string, Promise<FileNode | undefined>>()
  memoizedStore.getFilesByPaths = async (paths): Promise<FileNode[]> => {
    const uniquePaths = [...new Set(paths)]
    const missingPaths = uniquePaths.filter((path) => !fileCache.has(path))
    if (missingPaths.length > 0) {
      const found = await store.getFilesByPaths(missingPaths)
      const foundByPath = new Map(found.map((file) => [file.path, file]))
      for (const path of missingPaths) fileCache.set(path, Promise.resolve(foundByPath.get(path)))
    }
    const files = await Promise.all(uniquePaths.map((path) => fileCache.get(path)!))
    return files.filter((file): file is FileNode => file !== undefined)
  }
  const documentCache = new Map<string, Promise<DocumentNode | undefined>>()
  memoizedStore.getDocumentsByPaths = async (paths): Promise<DocumentNode[]> => {
    const uniquePaths = [...new Set(paths)]
    const missingPaths = uniquePaths.filter((path) => !documentCache.has(path))
    if (missingPaths.length > 0) {
      const found = await store.getDocumentsByPaths(missingPaths)
      const foundByPath = new Map(found.map((document) => [document.path, document]))
      for (const path of missingPaths) {
        documentCache.set(path, Promise.resolve(foundByPath.get(path)))
      }
    }
    const documents = await Promise.all(uniquePaths.map((path) => documentCache.get(path)!))
    return documents.filter((document): document is DocumentNode => document !== undefined)
  }
  const specCache = new Map<string, Promise<SpecNode | undefined>>()
  memoizedStore.getSpecsByIds = async (specIds): Promise<SpecNode[]> => {
    const uniqueIds = [...new Set(specIds)]
    const missingIds = uniqueIds.filter((id) => !specCache.has(id))
    if (missingIds.length > 0) {
      const found = await store.getSpecsByIds(missingIds)
      const foundById = new Map(found.map((spec) => [spec.specId, spec]))
      for (const id of missingIds) specCache.set(id, Promise.resolve(foundById.get(id)))
    }
    const specs = await Promise.all(uniqueIds.map((id) => specCache.get(id)!))
    return specs.filter((spec): spec is SpecNode => spec !== undefined)
  }
  memoizedStore.getSpec = memoize('getSpec', (specId) => store.getSpec(specId as string))
  memoizedStore.getCallers = memoize('getCallers', (id) => store.getCallers(id as string))
  memoizedStore.getCallees = memoize('getCallees', (id) => store.getCallees(id as string))
  memoizedStore.getImporters = memoize('getImporters', (path) => store.getImporters(path as string))
  memoizedStore.getImportees = memoize('getImportees', (path) => store.getImportees(path as string))
  memoizedStore.getExtenders = memoize('getExtenders', (id) => store.getExtenders(id as string))
  memoizedStore.getExtendedTargets = memoize('getExtendedTargets', (id) =>
    store.getExtendedTargets(id as string),
  )
  memoizedStore.getImplementors = memoize('getImplementors', (id) =>
    store.getImplementors(id as string),
  )
  memoizedStore.getImplementedTargets = memoize('getImplementedTargets', (id) =>
    store.getImplementedTargets(id as string),
  )
  memoizedStore.getOverriders = memoize('getOverriders', (id) => store.getOverriders(id as string))
  memoizedStore.getOverriddenTargets = memoize('getOverriddenTargets', (id) =>
    store.getOverriddenTargets(id as string),
  )
  memoizedStore.getSpecDependencies = memoize('getSpecDependencies', (specId) =>
    store.getSpecDependencies(specId as string),
  )
  memoizedStore.getSpecDependents = memoize('getSpecDependents', (specId) =>
    store.getSpecDependents(specId as string),
  )
  memoizedStore.getExportedSymbols = memoize('getExportedSymbols', (path) =>
    store.getExportedSymbols(path as string),
  )
  memoizedStore.findSymbols = memoize('findSymbols', (query) => store.findSymbols(query as never))

  return memoizedStore
}
