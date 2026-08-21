import { type GraphStore } from '../ports/graph-store.js'
import {
  type AffectedSymbol,
  type CoveringSpecImpact,
  type FileImpactResult,
  type ImpactResult,
} from '../value-objects/impact-result.js'
import { computeRiskLevel, maxRisk } from '../value-objects/risk-level.js'
import { type DocumentNode } from '../value-objects/document-node.js'
import { type FileNode } from '../value-objects/file-node.js'
import { type Relation } from '../value-objects/relation.js'
import { type RelationType } from '../value-objects/relation-type.js'
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
 * @returns The aggregated file impact result across all symbols in the file.
 */
export async function analyzeFileImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
): Promise<FileImpactResult> {
  const details = await analyzeFileImpactDetails(store, filePath, direction, maxDepth, resolve)
  return {
    ...details.result,
    coveringSpecs: await collectCoveringSpecs(store, details.fileDepths, details.symbolDepths),
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
 * @returns Impact plus shallowest file/symbol depths.
 */
export async function analyzeFileImpactDetails(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
  context?: ImpactExecutionContext,
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
    ),
  )

  // File-level impact via IMPORTS (BFS)
  const fileImpact = await analyzeFileImportImpact(cachedStore, filePath, direction, maxDepth)

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
  for (const result of symbolResults) {
    for (const symbol of result.affectedSymbols) {
      setMinimumDepth(symbolDepths, symbol.id, symbol.depth)
      setMinimumDepth(fileDepths, symbol.filePath, symbol.depth)
    }
  }

  return {
    result: {
      target: filePath,
      directDependents,
      indirectDependents,
      transitiveDependents,
      riskLevel: overallRisk,
      affectedFiles: [...affectedFileSet],
      affectedSymbols: deduplicateSymbols(symbolResults.flatMap((r) => r.affectedSymbols)),
      affectedProcesses: [],
      symbols: symbolResults,
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
 * @returns An impact result based on file-level import relationships.
 */
async function analyzeFileImportImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
): Promise<ImpactResult & { readonly depthFiles: ReadonlyMap<number, readonly string[]> }> {
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
    affectedProcesses: [],
    depthFiles,
  }
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
      relationTypes: readonly RelationType[],
    ) => Promise<Relation[]>,
  ) => {
    return async (
      symbolIds: readonly string[],
      relationTypes: readonly RelationType[],
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
