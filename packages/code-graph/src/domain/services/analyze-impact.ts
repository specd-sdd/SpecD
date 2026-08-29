import { type GraphStore, type ImpactDirection } from '../ports/graph-store.js'
import {
  type ImpactResult,
  type AffectedSymbol,
  type ImpactResultFilter,
} from '../value-objects/impact-result.js'
import {
  type DeclarationOccurrence,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
  type SymbolResolutionResult,
} from '../value-objects/symbol-reference.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'
import { getUpstream } from './get-upstream.js'
import { getDownstream } from './get-downstream.js'
import { RelationType } from '../value-objects/relation-type.js'
import { collectImpactSpecIds } from './collect-impact-specs.js'

const SYMBOL_IMPACT_RELATION_TYPES = [
  RelationType.Calls,
  RelationType.Constructs,
  RelationType.UsesType,
  RelationType.Extends,
  RelationType.Implements,
  RelationType.Overrides,
] as const

/** Supplies an optional pre-resolved selector without coupling domain services to a use case. */
export type ImpactResolutionProvider = (
  symbolId: string,
) => Promise<SymbolResolutionResult | undefined>

/**
 * Analyzes the impact of modifying a symbol by traversing its dependents.
 * Combines CALLS-based traversal (symbol-level) with IMPORTS-based traversal
 * (file-level, using the symbol's file as the starting point).
 * @param store - The graph store to query.
 * @param target - The id of the symbol to analyze impact for.
 * @param direction - The traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @param resolution - Optional application-layer resolution evidence.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns The impact result with dependent counts, risk level, and affected files.
 */
export async function analyzeImpact(
  store: GraphStore,
  target: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolution?: SymbolResolutionResult,
  filter?: ImpactResultFilter,
): Promise<ImpactResult> {
  if (resolution !== undefined && resolution.status !== 'resolved') {
    return emptyImpact(target)
  }

  const canonicalTarget = resolution?.target ?? null
  const declarations =
    resolution?.candidates.find((candidate) => candidate.target.id === canonicalTarget?.id)
      ?.declarations ?? []
  const traversalTargets =
    declarations.length === 0 ? [target] : declarations.map((declaration) => declaration.symbolId)

  return analyzeTraversalTargets(
    store,
    traversalTargets,
    canonicalTarget?.id ?? target,
    direction,
    maxDepth,
    filter,
  )
}

/** Input for exact-public-binding impact after application-layer resolution. */
export interface ResolvedPublicBindingImpactInput {
  readonly binding: PublicBinding
  readonly target: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly path: readonly ResolutionStep[]
}

/** Separates consumers of one public route from all consumers of its logical target. */
export interface PublicBindingImpactResult {
  readonly bindingImpact: ImpactResult
  readonly canonicalImpact: ImpactResult
  readonly binding: PublicBinding
  readonly target: LogicalSymbol
  readonly path: readonly ResolutionStep[]
}

/**
 * Computes exact-route and canonical impact views from a proven public binding.
 * Resolution remains an application-layer concern; this helper only traverses the
 * supplied immutable evidence.
 * @param store - Graph store to query.
 * @param input - Proven binding, target, declarations, and evidence path.
 * @param direction - Traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Separate exact-binding and canonical impact projections.
 */
export async function analyzePublicBindingImpact(
  store: GraphStore,
  input: ResolvedPublicBindingImpactInput,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  filter?: ImpactResultFilter,
): Promise<PublicBindingImpactResult> {
  const [bindingImpact, canonicalImpact] = await Promise.all([
    analyzeTraversalTargets(
      store,
      [input.binding.id],
      input.binding.id,
      direction,
      maxDepth,
      filter,
    ),
    analyzeTraversalTargets(
      store,
      input.declarations.map((declaration) => declaration.symbolId),
      input.target.id,
      direction,
      maxDepth,
      filter,
    ),
  ])

  return {
    bindingImpact,
    canonicalImpact,
    binding: input.binding,
    target: input.target,
    path: [...input.path],
  }
}

/**
 * Traverses one or more declaration/binding identities as one logical target.
 * @param store - Graph store to query.
 * @param traversalTargets - Location or binding identities forming the target.
 * @param resultTarget - Canonical identity exposed in the result.
 * @param direction - Traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Deduplicated logical impact.
 */
async function analyzeTraversalTargets(
  store: GraphStore,
  traversalTargets: readonly string[],
  resultTarget: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  filter?: ImpactResultFilter,
): Promise<ImpactResult> {
  if (filter !== undefined) {
    return analyzeFilteredTraversalTargets(
      store,
      traversalTargets,
      resultTarget,
      direction,
      maxDepth,
      filter,
    )
  }

  // CALLS-based traversal (symbol-level)
  const results = []
  for (const traversalTarget of [...new Set(traversalTargets)].sort()) {
    if (direction === 'upstream' || direction === 'both') {
      results.push(await getUpstream(store, traversalTarget, { maxDepth, includeFiles: false }))
    }
    if (direction === 'downstream' || direction === 'both') {
      results.push(await getDownstream(store, traversalTarget, { maxDepth, includeFiles: false }))
    }
  }

  const affectedFileSet = new Set<string>()
  const allSymbolsByDepth = new Map<number, Set<string>>()
  const affectedSymbolMap = new Map<string, AffectedSymbol>()

  for (const result of results) {
    for (const [depth, symbols] of result.levels) {
      if (!allSymbolsByDepth.has(depth)) {
        allSymbolsByDepth.set(depth, new Set())
      }
      const depthSet = allSymbolsByDepth.get(depth)!
      for (const symbol of symbols) {
        depthSet.add(symbol.id)
        affectedFileSet.add(symbol.filePath)
        if (!affectedSymbolMap.has(symbol.id)) {
          affectedSymbolMap.set(symbol.id, {
            id: symbol.id,
            name: symbol.name,
            filePath: symbol.filePath,
            line: symbol.line,
            depth,
          })
        }
      }
    }
  }

  // IMPORTS-based traversal (file-level) — tracked separately to avoid
  // conflating file-level and symbol-level dependent counts.
  const filesByDepth = new Map<number, Set<string>>()
  const rootSymbols = (
    await Promise.all(traversalTargets.map((traversalTarget) => store.getSymbol(traversalTarget)))
  ).filter((symbol) => symbol !== undefined)
  if (rootSymbols.length > 0) {
    const rootFiles = [...new Set(rootSymbols.map((symbol) => symbol.filePath))].sort()
    const visited = new Set<string>(rootFiles)
    let currentFiles = rootFiles

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
          const file = rel.source === fp ? rel.target : rel.source
          if (!visited.has(file)) {
            visited.add(file)
            nextFiles.push(file)
            affectedFileSet.add(file)

            if (!filesByDepth.has(depth)) {
              filesByDepth.set(depth, new Set())
            }
            filesByDepth.get(depth)!.add(file)
          }
        }
      }

      if (nextFiles.length === 0) break
      currentFiles = nextFiles
    }
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const files = [...(filesByDepth.get(depth) ?? new Set<string>())].sort()
    if (files.length === 0) continue

    const baselineAffectedIds = new Set(affectedSymbolMap.keys())
    const nextSymbols = await collectImportedFileSymbols(store, files, baselineAffectedIds, depth)

    for (const symbol of nextSymbols) {
      const existing = affectedSymbolMap.get(symbol.id)
      if (!existing || symbol.depth < existing.depth) {
        affectedSymbolMap.set(symbol.id, symbol)
      }
    }
  }

  // Take the larger of symbol-level or file-level counts per depth
  const symbolDirect = allSymbolsByDepth.get(1)?.size ?? 0
  const symbolIndirect = allSymbolsByDepth.get(2)?.size ?? 0
  let symbolTransitive = 0
  for (const [depth, ids] of allSymbolsByDepth) {
    if (depth >= 3) symbolTransitive += ids.size
  }

  const fileDirect = filesByDepth.get(1)?.size ?? 0
  const fileIndirect = filesByDepth.get(2)?.size ?? 0
  let fileTransitive = 0
  for (const [depth, ids] of filesByDepth) {
    if (depth >= 3) fileTransitive += ids.size
  }

  const directDependents = Math.max(symbolDirect, fileDirect)
  const indirectDependents = Math.max(symbolIndirect, fileIndirect)
  const transitiveDependents = Math.max(symbolTransitive, fileTransitive)
  const totalDependents = directDependents + indirectDependents + transitiveDependents
  // TODO: wire affectedProcesses count once execution flow tracking is implemented
  const riskLevel = computeRiskLevel(directDependents, totalDependents, 0)
  const affectedFiles = [...affectedFileSet].sort()
  const affectedSymbols = [...affectedSymbolMap.values()].sort(compareAffectedSymbols)
  const affectedSpecs = await collectAffectedSpecs(
    store,
    rootSymbols,
    [...affectedSymbolMap.keys()],
    filesByDepth,
  )

  return {
    target: resultTarget,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel,
    affectedFiles,
    affectedSymbols,
    affectedSpecs,
    affectedProcesses: [],
  }
}

/**
 * Traverses impact frontiers through the storage-owned filtering boundary.
 *
 * This branch intentionally keeps the historical traversal intact when the
 * filter is omitted. Once a filter is supplied, every candidate endpoint is
 * admitted by {@link GraphStore.queryImpactFrontier} before it contributes to
 * traversal, counts, or risk. Result types affect materialization only; the
 * admitted relation evidence still drives breadth-first expansion.
 * @param store - The graph store that admits each traversal frontier.
 * @param traversalTargets - Symbol or binding identities forming the root frontier.
 * @param resultTarget - Canonical identity exposed as the impact result target.
 * @param direction - Direction in which to traverse admitted relations.
 * @param maxDepth - Maximum breadth-first traversal depth.
 * @param filter - Membership and result-materialization constraints for the query.
 * @returns The filtered impact projection for the logical target.
 */
async function analyzeFilteredTraversalTargets(
  store: GraphStore,
  traversalTargets: readonly string[],
  resultTarget: string,
  direction: ImpactDirection,
  maxDepth: number,
  filter: ImpactResultFilter,
): Promise<ImpactResult> {
  const materializesFiles = materializesImpactType(filter, 'files')
  const materializesSymbols = materializesImpactType(filter, 'symbols')
  const roots = [...new Set(traversalTargets)].sort()
  const allSymbolsByDepth = new Map<number, Set<string>>()
  const affectedSymbols = new Map<string, AffectedSymbol>()
  const affectedFiles = new Set<string>()

  let currentSymbols = roots
  const seenSymbols = new Set(roots)
  for (let depth = 1; depth <= maxDepth && currentSymbols.length > 0; depth++) {
    const result = await store.queryImpactFrontier({
      resource: 'symbol',
      frontier: currentSymbols,
      direction,
      depth,
      maxDepth,
      relationTypes: SYMBOL_IMPACT_RELATION_TYPES,
      filter,
    })
    const nextSymbols = collectAdjacentIds(result.relations, currentSymbols, direction)
      .filter((id) => !seenSymbols.has(id))
      .sort()
    if (nextSymbols.length === 0) break

    for (const id of nextSymbols) seenSymbols.add(id)
    allSymbolsByDepth.set(depth, new Set(nextSymbols))

    if (materializesFiles || materializesSymbols) {
      // A files-only projection deliberately does not hydrate `result.symbols`
      // at the store boundary. Resolve exactly the already-admitted endpoint
      // ids here so the symbol traversal can still contribute their file paths
      // without broad post-filtering or changing traversal membership.
      const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]))
      if (materializesFiles && symbolsById.size < nextSymbols.length) {
        for (const symbol of await store.getSymbolsByIds(nextSymbols)) {
          symbolsById.set(symbol.id, symbol)
        }
      }
      for (const id of nextSymbols) {
        const symbol = symbolsById.get(id)
        if (symbol === undefined) continue
        if (materializesFiles) affectedFiles.add(symbol.filePath)
        if (materializesSymbols) {
          affectedSymbols.set(id, {
            id: symbol.id,
            name: symbol.name,
            filePath: symbol.filePath,
            line: symbol.line,
            depth,
          })
        }
      }
    }
    currentSymbols = nextSymbols
  }

  const rootSymbols = (
    await Promise.all(roots.map((traversalTarget) => store.getSymbol(traversalTarget)))
  ).filter((symbol) => symbol !== undefined)
  const filesByDepth = new Map<number, Set<string>>()
  if (rootSymbols.length > 0) {
    let currentFiles = [...new Set(rootSymbols.map((symbol) => symbol.filePath))].sort()
    const seenFiles = new Set(currentFiles)
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
      const nextFiles = collectAdjacentIds(result.relations, currentFiles, direction)
        .filter((id) => !seenFiles.has(id))
        .sort()
      if (nextFiles.length === 0) break

      for (const file of nextFiles) seenFiles.add(file)
      filesByDepth.set(depth, new Set(nextFiles))
      if (materializesFiles) {
        for (const file of result.files) {
          if (nextFiles.includes(file.path)) affectedFiles.add(file.path)
        }
      }
      currentFiles = nextFiles
    }
  }

  const symbolDirect = allSymbolsByDepth.get(1)?.size ?? 0
  const symbolIndirect = allSymbolsByDepth.get(2)?.size ?? 0
  const fileDirect = filesByDepth.get(1)?.size ?? 0
  const fileIndirect = filesByDepth.get(2)?.size ?? 0
  const symbolTransitive = countTransitive(allSymbolsByDepth)
  const fileTransitive = countTransitive(filesByDepth)
  const directDependents = Math.max(symbolDirect, fileDirect)
  const indirectDependents = Math.max(symbolIndirect, fileIndirect)
  const transitiveDependents = Math.max(symbolTransitive, fileTransitive)
  const totalDependents = directDependents + indirectDependents + transitiveDependents
  const affectedSpecs = materializesImpactType(filter, 'specs')
    ? await collectAffectedSpecs(store, rootSymbols, [...seenSymbols], filesByDepth, filter)
    : []

  return {
    target: resultTarget,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: computeRiskLevel(directDependents, totalDependents, 0),
    affectedFiles: materializesFiles ? [...affectedFiles].sort() : [],
    affectedSymbols: materializesSymbols
      ? [...affectedSymbols.values()].sort(compareAffectedSymbols)
      : [],
    affectedSpecs,
    affectedProcesses: [],
  }
}

/**
 * Determines whether a result category is requested, treating an empty list as unconstrained.
 * @param filter - Membership and materialization constraints to inspect.
 * @param type - Result category whose materialization is being checked.
 * @returns Whether the category should be materialized in the impact result.
 */
function materializesImpactType(
  filter: ImpactResultFilter,
  type: 'files' | 'symbols' | 'specs',
): boolean {
  return filter.types === undefined || filter.types.length === 0 || filter.types.includes(type)
}

/**
 * Extracts the adjacent endpoint IDs admitted by a store-owned frontier query.
 * @param relations - Admitted graph relations returned for the current frontier.
 * @param frontier - Current traversal identities from which adjacency is resolved.
 * @param direction - Direction in which relation endpoints are considered adjacent.
 * @returns Unique adjacent endpoint identities.
 */
function collectAdjacentIds(
  relations: readonly { readonly source: string; readonly target: string }[],
  frontier: readonly string[],
  direction: ImpactDirection,
): string[] {
  const current = new Set(frontier)
  const ids = new Set<string>()
  for (const relation of relations) {
    if ((direction === 'upstream' || direction === 'both') && current.has(relation.target)) {
      ids.add(relation.source)
    }
    if ((direction === 'downstream' || direction === 'both') && current.has(relation.source)) {
      ids.add(relation.target)
    }
  }
  return [...ids]
}

/**
 * Counts admitted endpoints at depth three and beyond.
 * @param levels - Traversal endpoints grouped by their breadth-first depth.
 * @returns Total number of endpoints at depth three or greater.
 */
function countTransitive(levels: ReadonlyMap<number, ReadonlySet<string>>): number {
  let count = 0
  for (const [depth, ids] of levels) {
    if (depth >= 3) count += ids.size
  }
  return count
}

/**
 * Creates a conservative empty result for non-resolved selectors.
 * @param target - Original selector.
 * @returns Empty impact without merging ambiguous candidates.
 */
function emptyImpact(target: string): ImpactResult {
  return {
    target,
    directDependents: 0,
    indirectDependents: 0,
    transitiveDependents: 0,
    riskLevel: 'LOW',
    affectedFiles: [],
    affectedSymbols: [],
    affectedSpecs: [],
    affectedProcesses: [],
  }
}

/**
 * Collects spec coverage for a symbol-impact root and its admitted traversal evidence.
 *
 * @param store - Graph store that owns coverage admission.
 * @param rootSymbols - Resolved root declarations.
 * @param symbolIds - Admitted root and affected symbol identities.
 * @param filesByDepth - Admitted import-frontier files grouped by depth.
 * @param filter - Optional provider-owned workspace constraints.
 * @returns Deterministic covering spec identifiers.
 */
async function collectAffectedSpecs(
  store: GraphStore,
  rootSymbols: readonly { readonly id: string; readonly filePath: string }[],
  symbolIds: readonly string[],
  filesByDepth: ReadonlyMap<number, ReadonlySet<string>>,
  filter?: ImpactResultFilter,
): Promise<string[]> {
  const symbols = await store.getSymbolsByIds([...new Set(symbolIds)].sort())
  const filePaths = new Set(rootSymbols.map((symbol) => symbol.filePath))
  for (const symbol of symbols) filePaths.add(symbol.filePath)
  for (const files of filesByDepth.values()) {
    for (const file of files) filePaths.add(file)
  }
  return collectImpactSpecIds(store, [...filePaths], symbolIds, filter)
}

/**
 * Resolves affected symbols for imported files deterministically, using the
 * already-affected symbol set as a fixed seed for the current depth.
 *
 * When a file contains symbols directly connected to the seed set via `CALLS`,
 * the entire connected call subgraph inside that file is treated as affected.
 * If no such seed is found, the file falls back to its exported symbols.
 *
 * @param store - The graph store to query.
 * @param files - Imported files reached at the current depth.
 * @param affectedIds - Symbols already known to be affected before this depth.
 * @param depth - The import-traversal depth being processed.
 * @returns Deterministically resolved affected symbols for the current depth.
 */
async function collectImportedFileSymbols(
  store: GraphStore,
  files: readonly string[],
  affectedIds: ReadonlySet<string>,
  depth: number,
): Promise<AffectedSymbol[]> {
  const results: AffectedSymbol[] = []

  for (const file of files) {
    const fileSymbols = await store.findSymbols({ filePath: file })
    if (fileSymbols.length === 0) continue

    const fileSymbolIds = new Set(fileSymbols.map((symbol) => symbol.id))
    const adjacency = new Map<string, Set<string>>()
    const directSeeds = new Set<string>()

    for (const symbol of fileSymbols) {
      const [callers, callees] = await Promise.all([
        store.getCallers(symbol.id),
        store.getCallees(symbol.id),
      ])

      const neighbors = new Set<string>()

      for (const relation of callers) {
        if (affectedIds.has(relation.source)) {
          directSeeds.add(symbol.id)
        }
        if (fileSymbolIds.has(relation.source)) {
          neighbors.add(relation.source)
        }
      }

      for (const relation of callees) {
        if (affectedIds.has(relation.target)) {
          directSeeds.add(symbol.id)
        }
        if (fileSymbolIds.has(relation.target)) {
          neighbors.add(relation.target)
        }
      }

      adjacency.set(symbol.id, neighbors)
    }

    if (directSeeds.size === 0) {
      const exported = await store.getExportedSymbols(file)
      for (const symbol of exported) {
        results.push({
          id: symbol.id,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth,
        })
      }
      continue
    }

    const byId = new Map(fileSymbols.map((symbol) => [symbol.id, symbol]))
    const queue = [...directSeeds].sort()
    const visited = new Set<string>()

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (currentId === undefined || visited.has(currentId)) continue
      visited.add(currentId)

      const symbol = byId.get(currentId)
      if (symbol !== undefined) {
        results.push({
          id: symbol.id,
          name: symbol.name,
          filePath: symbol.filePath,
          line: symbol.line,
          depth,
        })
      }

      const neighbors = adjacency.get(currentId)
      if (neighbors === undefined) continue
      for (const neighborId of [...neighbors].sort()) {
        if (!visited.has(neighborId)) {
          queue.push(neighborId)
        }
      }
    }
  }

  return results
}

/**
 * Provides a stable ordering for affected symbols across graph-store backends.
 * @param left - First affected symbol to compare.
 * @param right - Second affected symbol to compare.
 * @returns Negative when `left` sorts before `right`, positive when after, or 0 when equal.
 */
function compareAffectedSymbols(left: AffectedSymbol, right: AffectedSymbol): number {
  return (
    left.depth - right.depth ||
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}
