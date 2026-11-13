import {
  type GraphStore,
  type ImpactDirection,
  type LogicalDeclaration,
} from '../ports/graph-store.js'
import {
  type ImpactResult,
  type AffectedSymbol,
  type ImpactResultFilter,
  type PhysicalDependencyEvidence,
  type SemanticAffectedTarget,
  type SemanticImpactCounts,
  type ResolvedSymbolImpactResult,
  type CoveringSpecImpact,
  resolveAdmittedCategories,
} from '../value-objects/impact-result.js'
import {
  type DeclarationOccurrence,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
  type SymbolResolutionResult,
  type ResolvedSymbolTarget,
} from '../value-objects/symbol-reference.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type SourceLocation } from '../value-objects/source-location.js'
import { computeRiskLevel } from '../value-objects/risk-level.js'
import { RelationType } from '../value-objects/relation-type.js'
import { collectImpactSpecIds, collectLogicalCoveringSpecs } from './collect-impact-specs.js'

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
  return (await analyzeImpactDetails(store, target, direction, maxDepth, resolution, filter)).result
}

/** Impact result together with every reached declaration, independent of result filtering. */
export interface ImpactDetails {
  readonly result: ImpactResult
  /** Shallowest depth of each reached declaration id, whichever result types are materialized. */
  readonly reachedSymbolDepths: ReadonlyMap<string, number>
}

/**
 * Computes symbol impact and the depth of every reached declaration.
 * The depth map is complete even when the filter materializes only specs, so coverage
 * evidence never depends on which result types the caller asked to see.
 * @param store - The graph store to query.
 * @param target - The id of the symbol to analyze impact for.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @param resolution - Optional application-layer resolution evidence.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns The impact result and the reached-declaration depth map.
 */
export async function analyzeImpactDetails(
  store: GraphStore,
  target: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolution?: SymbolResolutionResult,
  filter?: ImpactResultFilter,
): Promise<ImpactDetails> {
  if (resolution !== undefined && resolution.status !== 'resolved') {
    return { result: emptyImpact(target), reachedSymbolDepths: new Map() }
  }

  const canonicalTarget = resolution?.target ?? null
  const declarations =
    resolution?.candidates.find((candidate) => candidate.target.id === canonicalTarget?.id)
      ?.declarations ?? []
  const traversalTargets =
    declarations.length === 0 ? [target] : declarations.map((declaration) => declaration.symbolId)

  return analyzeTraversalTargetsDetailed(
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
  readonly canonicalImpact: ResolvedSymbolImpactResult
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
    // The indexer never writes relations targeting binding ids, so the exact-route view is
    // seeded from the route's own declarations (reached through its recorded steps), while the
    // result stays identified by the binding.
    analyzeTraversalTargets(
      store,
      [
        ...new Set([
          input.binding.id,
          ...input.declarations.map((declaration) => declaration.symbolId),
        ]),
      ],
      input.binding.id,
      direction,
      maxDepth,
      filter,
    ),
    // Canonical-target consumers are aggregated logically; the exact route above stays physical.
    analyzeResolvedSymbolImpact(
      store,
      {
        kind: 'logical-target',
        logicalSymbol: input.target,
        declarations: input.declarations,
        path: input.path,
      },
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
 * Analyzes impact for a resolved symbol target, aggregating reached declarations
 * by their logical target while retaining physical evidence.
 *
 * Logical targets seed traversal from all contributing physical declarations.
 * Exact declaration targets seed only the selected occurrence.
 * Public binding targets preserve the binding identity while traversing contributing declarations.
 *
 * @param store - The graph store to query.
 * @param target - The resolved symbol target to analyze impact for.
 * @param direction - Traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Complete resolved symbol impact result.
 */
export async function analyzeResolvedSymbolImpact(
  store: GraphStore,
  target: ResolvedSymbolTarget,
  direction: ImpactDirection,
  maxDepth = 3,
  filter?: ImpactResultFilter,
): Promise<ResolvedSymbolImpactResult> {
  const effectiveFilter: ImpactResultFilter =
    filter?.categories !== undefined
      ? filter
      : {
          ...filter,
          categories: resolveAdmittedCategories(filter),
        }

  const roots: string[] =
    target.kind === 'logical-target'
      ? [...new Set(target.declarations.map((d) => d.symbolId))].sort()
      : target.kind === 'declaration'
        ? [target.declaration.symbolId]
        : target.declarations.length > 0
          ? [...new Set(target.declarations.map((d) => d.symbolId))].sort()
          : [target.binding.id]

  const resultTarget: string =
    target.kind === 'logical-target'
      ? target.logicalSymbol.id
      : target.kind === 'declaration'
        ? target.declaration.symbolId
        : target.binding.id

  if (roots.length === 0) {
    return {
      target: resultTarget,
      directDependents: 0,
      indirectDependents: 0,
      transitiveDependents: 0,
      riskLevel: 'LOW',
      affectedFiles: [],
      affectedSymbols: [],
      affectedSpecs: [],
      affectedProcesses: [],
      omittedCounts: { tests: 0, ignored: 0 },
      omittedFiles: { tests: [], ignored: [] },
      resolvedTarget: target,
      semanticAffectedTargets: [],
      physicalEvidence: [],
      semanticCounts: {
        directLogicalTargets: 0,
        indirectLogicalTargets: 0,
        transitiveLogicalTargets: 0,
        physicalOnlyTargets: 0,
        physicalDeclarationOccurrences: 0,
      },
      coveringSpecs: [],
    }
  }

  const materializesFiles = materializesImpactType(effectiveFilter, 'files')
  const materializesSymbols = materializesImpactType(effectiveFilter, 'symbols')
  const materializesSpecs = materializesImpactType(effectiveFilter, 'specs')

  const allSymbolsByDepth = new Map<number, Set<string>>()
  const symbolDepthMap = new Map<string, number>()
  const rawEvidenceList: {
    readonly relationType: RelationType
    readonly sourceDeclarationId: string
    readonly targetDeclarationId: string
    readonly depth: number
  }[] = []
  const rawEvidenceKeys = new Set<string>()

  const affectedFiles = new Set<string>()
  const omittedTestFiles = new Set<string>()
  const omittedIgnoredFiles = new Set<string>()

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
      filter: effectiveFilter,
    })

    if (result.omittedFiles) {
      for (const f of result.omittedFiles.tests) omittedTestFiles.add(f)
      for (const f of result.omittedFiles.ignored) omittedIgnoredFiles.add(f)
    }

    const currentSet = new Set(currentSymbols)
    for (const rel of result.relations) {
      const isUpstreamAdjacent =
        (direction === 'upstream' || direction === 'both') && currentSet.has(rel.target)
      const isDownstreamAdjacent =
        (direction === 'downstream' || direction === 'both') && currentSet.has(rel.source)
      if (isUpstreamAdjacent || isDownstreamAdjacent) {
        const key = `${rel.type}:${rel.source}:${rel.target}:${String(depth)}`
        if (!rawEvidenceKeys.has(key)) {
          rawEvidenceKeys.add(key)
          rawEvidenceList.push({
            relationType: rel.type,
            sourceDeclarationId: rel.source,
            targetDeclarationId: rel.target,
            depth,
          })
        }
      }
    }

    const nextSymbols = collectAdjacentIds(result.relations, currentSymbols, direction)
      .filter((id) => !seenSymbols.has(id))
      .sort()

    if (nextSymbols.length === 0) break

    for (const id of nextSymbols) {
      seenSymbols.add(id)
      if (!symbolDepthMap.has(id)) {
        symbolDepthMap.set(id, depth)
      }
    }
    allSymbolsByDepth.set(depth, new Set(nextSymbols))
    currentSymbols = nextSymbols
  }

  const reachedSymbolIds = [...seenSymbols].filter((id) => !roots.includes(id)).sort()

  const allInvolvedIds = [
    ...new Set([
      ...roots,
      ...reachedSymbolIds,
      ...rawEvidenceList.flatMap((e) => [e.sourceDeclarationId, e.targetDeclarationId]),
    ]),
  ].sort()

  const hydratedSymbols =
    allInvolvedIds.length > 0 ? await store.getSymbolsByIds(allInvolvedIds) : []
  const symbolsById = new Map<string, SymbolNode>(hydratedSymbols.map((s) => [s.id, s]))

  const physicalEvidence: PhysicalDependencyEvidence[] = rawEvidenceList.map((item) => {
    const src = symbolsById.get(item.sourceDeclarationId)
    const tgt = symbolsById.get(item.targetDeclarationId)
    return {
      relationType: item.relationType,
      sourceDeclarationId: item.sourceDeclarationId,
      targetDeclarationId: item.targetDeclarationId,
      sourceLocation: toSourceLocation(src),
      targetLocation: toSourceLocation(tgt),
      depth: item.depth,
    }
  })

  if (materializesFiles) {
    for (const id of reachedSymbolIds) {
      const sym = symbolsById.get(id)
      if (sym !== undefined) {
        affectedFiles.add(sym.filePath)
      }
    }
  }

  const rootSymbols = roots
    .map((r) => symbolsById.get(r))
    .filter((s): s is SymbolNode => s !== undefined)

  const filesByDepth = new Map<number, Set<string>>()
  const fileDepthsMap = new Map<string, number>()

  if (rootSymbols.length > 0) {
    let currentFiles = [...new Set(rootSymbols.map((symbol) => symbol.filePath))].sort()
    for (const f of currentFiles) {
      fileDepthsMap.set(f, 0)
    }
    const seenFiles = new Set(currentFiles)
    for (let depth = 1; depth <= maxDepth && currentFiles.length > 0; depth++) {
      const result = await store.queryImpactFrontier({
        resource: 'file',
        frontier: currentFiles,
        direction,
        depth,
        maxDepth,
        relationTypes: [RelationType.Imports],
        filter: effectiveFilter,
      })

      if (result.omittedFiles) {
        for (const f of result.omittedFiles.tests) omittedTestFiles.add(f)
        for (const f of result.omittedFiles.ignored) omittedIgnoredFiles.add(f)
      }

      const nextFiles = collectAdjacentIds(result.relations, currentFiles, direction)
        .filter((id) => !seenFiles.has(id))
        .sort()

      if (nextFiles.length === 0) break

      for (const file of nextFiles) {
        seenFiles.add(file)
        if (!fileDepthsMap.has(file)) {
          fileDepthsMap.set(file, depth)
        }
      }
      filesByDepth.set(depth, new Set(nextFiles))
      if (materializesFiles) {
        for (const file of result.files) {
          if (nextFiles.includes(file.path)) affectedFiles.add(file.path)
        }
      }
      currentFiles = nextFiles
    }
  }

  const logicalDecls =
    reachedSymbolIds.length > 0
      ? await store.findLogicalDeclarationsByDeclarationIds(reachedSymbolIds)
      : []

  const logicalByDeclId = new Map<string, LogicalDeclaration>()
  for (const ld of logicalDecls) {
    logicalByDeclId.set(ld.declaration.symbolId, ld)
  }

  const declsByLogicalId = new Map<string, DeclarationOccurrence[]>()
  const depthByLogicalId = new Map<string, number>()
  const physicalOnlyIds: string[] = []

  for (const declId of reachedSymbolIds) {
    const mapping = logicalByDeclId.get(declId)
    const depth = symbolDepthMap.get(declId) ?? 1
    if (mapping !== undefined) {
      const list = declsByLogicalId.get(mapping.logicalSymbolId) ?? []
      list.push(mapping.declaration)
      declsByLogicalId.set(mapping.logicalSymbolId, list)

      const existingDepth = depthByLogicalId.get(mapping.logicalSymbolId)
      if (existingDepth === undefined || depth < existingDepth) {
        depthByLogicalId.set(mapping.logicalSymbolId, depth)
      }
    } else {
      physicalOnlyIds.push(declId)
    }
  }

  const uniqueLogicalIds = [...declsByLogicalId.keys()].sort()
  const logicalSymbols =
    uniqueLogicalIds.length > 0 ? await store.findLogicalSymbolsByIds(uniqueLogicalIds) : []
  const logicalSymbolMap = new Map<string, LogicalSymbol>(logicalSymbols.map((ls) => [ls.id, ls]))

  const semanticAffectedTargets: SemanticAffectedTarget[] = []

  for (const logicalId of uniqueLogicalIds) {
    const logicalSymbol = logicalSymbolMap.get(logicalId)
    const declarations = declsByLogicalId.get(logicalId) ?? []
    if (logicalSymbol === undefined) {
      // A mapped declaration whose logical symbol is not stored stays visible as declaration-only evidence.
      for (const declaration of declarations) physicalOnlyIds.push(declaration.symbolId)
      continue
    }
    const depth = depthByLogicalId.get(logicalId) ?? 1
    const declIdSet = new Set(declarations.map((d) => d.symbolId))
    const targetEvidence = physicalEvidence.filter(
      (e) => declIdSet.has(e.sourceDeclarationId) || declIdSet.has(e.targetDeclarationId),
    )

    semanticAffectedTargets.push({
      kind: 'logical-target',
      logicalSymbol,
      declarations,
      depth,
      evidence: targetEvidence,
    })
  }

  for (const declId of physicalOnlyIds) {
    const sym = symbolsById.get(declId)
    if (sym === undefined) continue
    const depth = symbolDepthMap.get(declId) ?? 1
    const targetEvidence = physicalEvidence.filter(
      (e) => e.sourceDeclarationId === declId || e.targetDeclarationId === declId,
    )

    semanticAffectedTargets.push({
      kind: 'physical-only',
      declaration: sym,
      depth,
      evidence: targetEvidence,
    })
  }

  semanticAffectedTargets.sort((left, right) => {
    if (left.depth !== right.depth) return left.depth - right.depth
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind)
    const leftId = left.kind === 'logical-target' ? left.logicalSymbol.id : left.declaration.id
    const rightId = right.kind === 'logical-target' ? right.logicalSymbol.id : right.declaration.id
    return leftId.localeCompare(rightId)
  })

  let directLogicalTargets = 0
  let indirectLogicalTargets = 0
  let transitiveLogicalTargets = 0
  let directPhysicalOnly = 0
  let indirectPhysicalOnly = 0
  let transitivePhysicalOnly = 0

  for (const t of semanticAffectedTargets) {
    if (t.kind === 'logical-target') {
      if (t.depth === 1) directLogicalTargets++
      else if (t.depth === 2) indirectLogicalTargets++
      else transitiveLogicalTargets++
    } else {
      if (t.depth === 1) directPhysicalOnly++
      else if (t.depth === 2) indirectPhysicalOnly++
      else transitivePhysicalOnly++
    }
  }

  const physicalOnlyTargets = directPhysicalOnly + indirectPhysicalOnly + transitivePhysicalOnly
  const physicalDeclarationOccurrences = reachedSymbolIds.length

  const semanticCounts: SemanticImpactCounts = {
    directLogicalTargets,
    indirectLogicalTargets,
    transitiveLogicalTargets,
    physicalOnlyTargets,
    physicalDeclarationOccurrences,
  }

  const semanticDirect = directLogicalTargets + directPhysicalOnly
  const semanticIndirect = indirectLogicalTargets + indirectPhysicalOnly
  const semanticTransitive = transitiveLogicalTargets + transitivePhysicalOnly

  const fileDirect = filesByDepth.get(1)?.size ?? 0
  const fileIndirect = filesByDepth.get(2)?.size ?? 0
  const fileTransitive = countTransitive(filesByDepth)

  const directDependents = Math.max(semanticDirect, fileDirect)
  const indirectDependents = Math.max(semanticIndirect, fileIndirect)
  const transitiveDependents = Math.max(semanticTransitive, fileTransitive)
  const totalDependents = directDependents + indirectDependents + transitiveDependents
  const riskLevel = computeRiskLevel(directDependents, totalDependents, 0)

  // The target's own declarations are part of the coverage frontier at depth 0, like root files.
  // Files of reached dependents are part of the coverage frontier at their symbol depth.
  for (const id of reachedSymbolIds) {
    const reached = symbolsById.get(id)
    const reachedDepth = symbolDepthMap.get(id)
    if (reached === undefined || reachedDepth === undefined) continue
    const knownDepth = fileDepthsMap.get(reached.filePath)
    if (knownDepth === undefined || reachedDepth < knownDepth) {
      fileDepthsMap.set(reached.filePath, reachedDepth)
    }
  }
  const coverageSymbolDepths = new Map<string, number>(roots.map((root) => [root, 0]))
  for (const [id, depth] of symbolDepthMap) {
    if (!coverageSymbolDepths.has(id)) coverageSymbolDepths.set(id, depth)
  }

  const coveringSpecs: CoveringSpecImpact[] = materializesSpecs
    ? await collectLogicalCoveringSpecs(store, fileDepthsMap, coverageSymbolDepths, effectiveFilter)
    : []

  const affectedSpecs = coveringSpecs.map((s) => s.specId).sort()

  const affectedSymbols: AffectedSymbol[] = materializesSymbols
    ? reachedSymbolIds
        .map((id) => {
          const sym = symbolsById.get(id)
          if (sym === undefined) return null
          return {
            id: sym.id,
            name: sym.name,
            filePath: sym.filePath,
            line: sym.line,
            depth: symbolDepthMap.get(id) ?? 1,
          }
        })
        .filter((s): s is AffectedSymbol => s !== null)
        .sort(compareAffectedSymbols)
    : []

  return {
    target: resultTarget,
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel,
    affectedFiles: materializesFiles ? [...affectedFiles].sort() : [],
    affectedSymbols,
    affectedSpecs,
    affectedProcesses: [],
    omittedCounts: {
      tests: omittedTestFiles.size,
      ignored: omittedIgnoredFiles.size,
    },
    omittedFiles: {
      tests: [...omittedTestFiles].sort(),
      ignored: [...omittedIgnoredFiles].sort(),
    },
    resolvedTarget: target,
    semanticAffectedTargets,
    physicalEvidence,
    semanticCounts,
    coveringSpecs,
  }
}

/**
 * Projects a symbol into an impact source location.
 * @param symbol - Optional indexed symbol.
 * @returns Its source location, when present.
 */
function toSourceLocation(symbol: SymbolNode | undefined): SourceLocation | undefined {
  if (symbol === undefined) return undefined
  return {
    filePath: symbol.filePath,
    projectRelativePath: symbol.projectRelativePath,
    line: symbol.line,
    column: symbol.column,
    endLine: symbol.endLine,
    endColumn: symbol.endColumn,
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
  return (
    await analyzeTraversalTargetsDetailed(
      store,
      traversalTargets,
      resultTarget,
      direction,
      maxDepth,
      filter,
    )
  ).result
}

/**
 * Normalizes the filter and traverses, keeping the reached-declaration depth map.
 * @param store - The graph store that admits each traversal frontier.
 * @param traversalTargets - Symbol or binding identities forming the root frontier.
 * @param resultTarget - Canonical identity exposed as the impact result target.
 * @param direction - Direction in which to traverse admitted relations.
 * @param maxDepth - Maximum breadth-first traversal depth.
 * @param filter - Membership and result-materialization constraints for the query.
 * @returns The impact projection with the reached-declaration depth map.
 */
async function analyzeTraversalTargetsDetailed(
  store: GraphStore,
  traversalTargets: readonly string[],
  resultTarget: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  filter?: ImpactResultFilter,
): Promise<ImpactDetails> {
  const effectiveFilter: ImpactResultFilter =
    filter?.categories !== undefined
      ? filter
      : {
          ...filter,
          categories: resolveAdmittedCategories(filter),
        }
  return analyzeFilteredTraversalTargets(
    store,
    traversalTargets,
    resultTarget,
    direction,
    maxDepth,
    effectiveFilter,
  )
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
): Promise<ImpactDetails> {
  const materializesFiles = materializesImpactType(filter, 'files')
  const materializesSymbols = materializesImpactType(filter, 'symbols')
  const reachedSymbolDepths = new Map<string, number>()
  const roots = [...new Set(traversalTargets)].sort()
  const allSymbolsByDepth = new Map<number, Set<string>>()
  const affectedSymbols = new Map<string, AffectedSymbol>()
  const affectedFiles = new Set<string>()
  const omittedTestFiles = new Set<string>()
  const omittedIgnoredFiles = new Set<string>()

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
    if (result.omittedFiles) {
      for (const f of result.omittedFiles.tests) omittedTestFiles.add(f)
      for (const f of result.omittedFiles.ignored) omittedIgnoredFiles.add(f)
    }
    const nextSymbols = collectAdjacentIds(result.relations, currentSymbols, direction)
      .filter((id) => !seenSymbols.has(id))
      .sort()
    if (nextSymbols.length === 0) break

    for (const id of nextSymbols) {
      seenSymbols.add(id)
      reachedSymbolDepths.set(id, depth)
    }
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
      if (result.omittedFiles) {
        for (const f of result.omittedFiles.tests) omittedTestFiles.add(f)
        for (const f of result.omittedFiles.ignored) omittedIgnoredFiles.add(f)
      }
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
    reachedSymbolDepths,
    result: {
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
      omittedCounts: {
        tests: omittedTestFiles.size,
        ignored: omittedIgnoredFiles.size,
      },
      omittedFiles: {
        tests: [...omittedTestFiles].sort(),
        ignored: [...omittedIgnoredFiles].sort(),
      },
    },
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
    omittedCounts: { tests: 0, ignored: 0 },
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
