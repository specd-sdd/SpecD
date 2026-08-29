import { type GraphStore } from '../ports/graph-store.js'
import {
  type SpecImpactResult,
  type AffectedSymbol,
  type ImpactResultFilter,
} from '../value-objects/impact-result.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'
import { type ImpactResolutionProvider } from './analyze-impact.js'
import { RelationType } from '../value-objects/relation-type.js'

/**
 * Computes requirement-aware impact for a spec using spec, file, and symbol coverage relations.
 *
 * @param store - Graph store to query
 * @param specId - Target spec identifier
 * @param direction - Traversal direction
 * @param maxDepth - Maximum spec traversal depth
 * @param resolve - Optional provider of pre-resolved logical selectors
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Requirement-aware spec impact result
 */
export async function analyzeSpecImpact(
  store: GraphStore,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
  filter?: ImpactResultFilter,
): Promise<SpecImpactResult> {
  if (filter !== undefined) {
    return analyzeFilteredSpecImpact(store, specId, direction, maxDepth, resolve, filter)
  }

  const affectedSpecs = new Set<string>()
  const affectedFiles = new Set<string>()
  const affectedSymbols = new Map<string, AffectedSymbol>()
  const visitedSpecs = new Set<string>([specId])
  let currentSpecs = [specId]
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextSpecs = new Set<string>()
    for (const current of currentSpecs) {
      const relations: Array<Awaited<ReturnType<GraphStore['getSpecDependencies']>>> = []
      if (direction === 'upstream' || direction === 'both') {
        relations.push(await store.getSpecDependents(current))
      }
      if (direction === 'downstream' || direction === 'both') {
        relations.push(await store.getSpecDependencies(current))
      }
      for (const batch of relations) {
        for (const relation of batch) {
          const candidate = relation.source === current ? relation.target : relation.source
          if (visitedSpecs.has(candidate)) continue
          visitedSpecs.add(candidate)
          nextSpecs.add(candidate)
          affectedSpecs.add(candidate)
        }
      }
    }

    const count = nextSpecs.size
    if (depth === 1) directDependents = count
    else if (depth === 2) indirectDependents = count
    else transitiveDependents += count
    if (count === 0) break
    currentSpecs = [...nextSpecs]
  }

  const coverageSpecIds = new Set<string>([specId, ...affectedSpecs])
  for (const coveredSpecId of coverageSpecIds) {
    const [fileRelations, symbolRelations] = await Promise.all([
      store.getCoveredFiles(coveredSpecId),
      store.getCoveredSymbols(coveredSpecId),
    ])
    for (const relation of fileRelations) {
      affectedFiles.add(relation.target)
    }
    for (const relation of symbolRelations) {
      const symbol = await store.getSymbol(relation.target)
      if (symbol === undefined) continue
      const resolution = resolve === undefined ? undefined : await resolve(symbol.id)
      if (resolution !== undefined && resolution.status !== 'resolved') continue
      const canonicalId = resolution?.target?.id ?? symbol.id
      affectedFiles.add(symbol.filePath)
      if (!affectedSymbols.has(canonicalId)) {
        affectedSymbols.set(canonicalId, {
          id: canonicalId,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth: 1,
        })
      }
    }
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
  return {
    target: specId,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles: [...affectedFiles].sort(),
    affectedSymbols: [...affectedSymbols.values()].sort((a, b) =>
      a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath),
    ),
    affectedProcesses: [],
    affectedSpecs: [...affectedSpecs].sort(),
  }
}

/**
 * Computes requirement-aware spec impact through storage-owned filtered frontiers.
 *
 * The store admits each dependency or coverage endpoint before it can contribute
 * to traversal, counts, risk, or result materialization. The unfiltered branch
 * above deliberately retains its historical query sequence and output ordering.
 *
 * @param store - Graph store that owns filtered frontier admission.
 * @param specId - Target spec identifier.
 * @param direction - Traversal direction.
 * @param maxDepth - Maximum spec traversal depth.
 * @param resolve - Optional provider of pre-resolved logical selectors.
 * @param filter - Provider-owned membership and materialization constraints.
 * @returns Filtered requirement-aware spec impact result.
 */
async function analyzeFilteredSpecImpact(
  store: GraphStore,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  resolve: ImpactResolutionProvider | undefined,
  filter: ImpactResultFilter,
): Promise<SpecImpactResult> {
  const affectedSpecs = new Set<string>()
  const affectedFiles = new Set<string>()
  const affectedSymbols = new Map<string, AffectedSymbol>()
  const visitedSpecs = new Set<string>([specId])
  let currentSpecs = [specId]
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0

  for (let depth = 1; depth <= maxDepth && currentSpecs.length > 0; depth++) {
    const result = await store.queryImpactFrontier({
      resource: 'spec',
      frontier: currentSpecs,
      direction,
      depth,
      maxDepth,
      relationTypes: [RelationType.DependsOn],
      filter,
    })
    const nextSpecs = collectAdjacentSpecIds(result.relations, currentSpecs, direction)
      .filter((candidate) => !visitedSpecs.has(candidate))
      .sort()
    if (nextSpecs.length === 0) break

    for (const candidate of nextSpecs) {
      visitedSpecs.add(candidate)
      affectedSpecs.add(candidate)
    }
    if (depth === 1) directDependents = nextSpecs.length
    else if (depth === 2) indirectDependents = nextSpecs.length
    else transitiveDependents += nextSpecs.length
    currentSpecs = nextSpecs
  }

  const coverageSpecIds = [specId, ...[...affectedSpecs].sort()]
  const needsFiles = materializesImpactType(filter, 'files')
  const needsSymbols = materializesImpactType(filter, 'symbols')
  const needsSymbolCoverage = needsSymbols || needsFiles

  const [fileCoverage, symbolCoverage] = await Promise.all([
    needsFiles
      ? store.queryImpactFrontier({
          resource: 'file',
          frontier: coverageSpecIds,
          direction: 'downstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversFile],
          filter,
        })
      : Promise.resolve({ relations: [], symbols: [], files: [], specs: [] }),
    needsSymbolCoverage
      ? store.queryImpactFrontier({
          resource: 'symbol',
          frontier: coverageSpecIds,
          direction: 'downstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversSymbol],
          filter,
        })
      : Promise.resolve({ relations: [], symbols: [], files: [], specs: [] }),
  ])

  if (needsFiles) {
    for (const file of fileCoverage.files) affectedFiles.add(file.path)
  }

  if (needsSymbolCoverage) {
    let symbolsToProcess = symbolCoverage.symbols
    if (symbolsToProcess.length === 0 && symbolCoverage.relations.length > 0 && needsFiles) {
      const symbolIds = [...new Set(symbolCoverage.relations.map((r) => r.target))]
      symbolsToProcess = await store.getSymbolsByIds(symbolIds)
    }

    for (const symbol of symbolsToProcess) {
      const resolution = resolve === undefined ? undefined : await resolve(symbol.id)
      if (resolution !== undefined && resolution.status !== 'resolved') continue
      const canonicalId = resolution?.target?.id ?? symbol.id
      if (needsFiles) affectedFiles.add(symbol.filePath)
      if (needsSymbols && !affectedSymbols.has(canonicalId)) {
        affectedSymbols.set(canonicalId, {
          id: canonicalId,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth: 1,
        })
      }
    }
  }

  const totalDependents = directDependents + indirectDependents + transitiveDependents
  return {
    target: specId,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles: materializesImpactType(filter, 'files') ? [...affectedFiles].sort() : [],
    affectedSymbols: materializesImpactType(filter, 'symbols')
      ? [...affectedSymbols.values()].sort((a, b) =>
          a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath),
        )
      : [],
    affectedProcesses: [],
    affectedSpecs: materializesImpactType(filter, 'specs') ? [...affectedSpecs].sort() : [],
  }
}

/**
 * Extracts admitted neighboring spec identifiers from one filtered frontier.
 *
 * @param relations - Admitted dependency relations returned by the store.
 * @param frontier - Current spec identifiers being expanded.
 * @param direction - Traversal direction that determines the adjacent endpoint.
 * @returns Unique adjacent spec identifiers.
 */
function collectAdjacentSpecIds(
  relations: readonly { readonly source: string; readonly target: string }[],
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
 * Determines whether a result category is selected, treating an empty list as unconstrained.
 *
 * @param filter - Provider-owned impact result filter.
 * @param type - Result category to test for materialization.
 * @returns Whether the result category is selected.
 */
function materializesImpactType(
  filter: ImpactResultFilter,
  type: 'files' | 'symbols' | 'specs',
): boolean {
  return filter.types === undefined || filter.types.length === 0 || filter.types.includes(type)
}
