import { type GraphStore } from '../ports/graph-store.js'
import {
  type AffectedSymbol,
  type FileImpactResult,
  type ImpactResult,
} from '../value-objects/impact-result.js'
import { computeRiskLevel, maxRisk } from '../value-objects/risk-level.js'
import { analyzeImpact } from './analyze-impact.js'

/**
 * Analyzes the combined impact of all symbols within a file.
 * Uses both CALLS (symbol-level) and IMPORTS (file-level) to compute impact.
 * @param store - The graph store to query.
 * @param filePath - The path of the file to analyze.
 * @param direction - The traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @returns The aggregated file impact result across all symbols in the file.
 */
export async function analyzeFileImpact(
  store: GraphStore,
  filePath: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
): Promise<FileImpactResult> {
  const cachedStore = createMemoizedReadStore(store)

  // Symbol-level impact via CALLS
  const symbols = await cachedStore.findSymbols({ filePath })
  const symbolResults = await Promise.all(
    symbols.map((s) => analyzeImpact(cachedStore, s.id, direction, maxDepth)),
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

  return {
    target: filePath,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: overallRisk,
    affectedFiles: [...affectedFileSet],
    affectedSymbols: deduplicateSymbols(symbolResults.flatMap((r) => r.affectedSymbols)),
    affectedProcesses: [],
    symbols: symbolResults,
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
): Promise<ImpactResult> {
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
  }
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
function createMemoizedReadStore(store: GraphStore): GraphStore {
  const cache = new Map<string, Promise<unknown>>()
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
  memoizedStore.getSymbol = memoize('getSymbol', (id) => store.getSymbol(id as string))
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
