import { type GraphStore } from '../ports/graph-store.js'
import {
  type CoveringSpecEvidence,
  type CoveringSpecImpact,
  type ImpactResultFilter,
} from '../value-objects/impact-result.js'
import { RelationType } from '../value-objects/relation-type.js'

/**
 * Collects deterministic spec identifiers covering admitted impact evidence.
 *
 * Reached physical declarations are mapped to logical targets before querying
 * reverse `COVERS_SYMBOL` coverage in one bounded batch.
 *
 * @param store - Graph store that owns coverage admission.
 * @param filePaths - Covered file paths admitted by impact traversal.
 * @param symbolIds - Covered physical declaration ids admitted by impact traversal.
 * @param filter - Optional provider-owned workspace constraints.
 * @returns Stable-deduplicated covering spec identifiers.
 */
export async function collectImpactSpecIds(
  store: GraphStore,
  filePaths: readonly string[],
  symbolIds: readonly string[],
  filter?: ImpactResultFilter,
): Promise<string[]> {
  const uniqueFiles = [...new Set(filePaths)].sort()
  const uniqueSymbols = [...new Set(symbolIds)].sort()

  const logicalDecls =
    uniqueSymbols.length > 0
      ? await store.findLogicalDeclarationsByDeclarationIds(uniqueSymbols)
      : []
  const uniqueLogicalIds =
    logicalDecls.length > 0 ? [...new Set(logicalDecls.map((d) => d.logicalSymbolId))].sort() : []

  const [fileResult, symbolResult] = await Promise.all([
    uniqueFiles.length > 0
      ? store.queryImpactFrontier({
          resource: 'spec',
          frontier: uniqueFiles,
          direction: 'upstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversFile],
          ...(filter === undefined ? {} : { filter }),
        })
      : Promise.resolve({ specs: [], relations: [] }),
    uniqueLogicalIds.length > 0
      ? store.queryImpactFrontier({
          resource: 'spec',
          frontier: uniqueLogicalIds,
          direction: 'upstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversSymbol],
          ...(filter === undefined ? {} : { filter }),
        })
      : Promise.resolve({ specs: [], relations: [] }),
  ])

  return [
    ...new Set([...fileResult.specs, ...symbolResult.specs].map((spec) => spec.specId)),
  ].sort()
}

/**
 * Resolves covering specs for file and symbol depths, mapping physical declarations
 * to logical targets in one bounded batch and retaining declaration evidence.
 *
 * @param store - Graph store that owns coverage admission.
 * @param fileDepths - Canonical file paths and shallowest depths.
 * @param symbolDepths - Physical declaration IDs and shallowest depths.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns Deduplicated ordered covering specs with declaration evidence.
 */
export async function collectLogicalCoveringSpecs(
  store: GraphStore,
  fileDepths: ReadonlyMap<string, number>,
  symbolDepths: ReadonlyMap<string, number>,
  filter?: ImpactResultFilter,
): Promise<CoveringSpecImpact[]> {
  const physicalDeclIds = [...symbolDepths.keys()]
  const mappedDecls =
    physicalDeclIds.length > 0
      ? await store.findLogicalDeclarationsByDeclarationIds(physicalDeclIds)
      : []

  const declsByLogicalId = new Map<string, string[]>()
  const logicalDepths = new Map<string, number>()

  for (const item of mappedDecls) {
    const list = declsByLogicalId.get(item.logicalSymbolId) ?? []
    list.push(item.declaration.symbolId)
    declsByLogicalId.set(item.logicalSymbolId, list)

    const depth = symbolDepths.get(item.declaration.symbolId) ?? 0
    const existing = logicalDepths.get(item.logicalSymbolId)
    if (existing === undefined || depth < existing) {
      logicalDepths.set(item.logicalSymbolId, depth)
    }
  }

  const symbolFrontier = [...logicalDepths.keys()]

  const [fileResult, symbolResult] = await Promise.all([
    fileDepths.size > 0
      ? store.queryImpactFrontier({
          resource: 'spec',
          frontier: [...fileDepths.keys()],
          direction: 'upstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversFile],
          ...(filter === undefined ? {} : { filter }),
        })
      : Promise.resolve({ specs: [], relations: [] }),
    symbolFrontier.length > 0
      ? store.queryImpactFrontier({
          resource: 'spec',
          frontier: symbolFrontier,
          direction: 'upstream',
          depth: 0,
          maxDepth: 0,
          relationTypes: [RelationType.CoversSymbol],
          ...(filter === undefined ? {} : { filter }),
        })
      : Promise.resolve({ specs: [], relations: [] }),
  ])

  const admittedSpecIds = new Set(
    [...fileResult.specs, ...symbolResult.specs].map((spec) => spec.specId),
  )
  const evidenceBySpec = new Map<string, Map<string, CoveringSpecEvidence>>()

  for (const relation of fileResult.relations) {
    const depth = fileDepths.get(relation.target)
    if (depth !== undefined && admittedSpecIds.has(relation.source)) {
      addCoverageEvidence(evidenceBySpec, relation.source, 'file', relation.target, depth)
    }
  }

  for (const relation of symbolResult.relations) {
    const depth = logicalDepths.get(relation.target)
    if (depth !== undefined && admittedSpecIds.has(relation.source)) {
      const decls = declsByLogicalId.get(relation.target)
      addCoverageEvidence(
        evidenceBySpec,
        relation.source,
        'symbol',
        relation.target,
        depth,
        decls !== undefined && decls.length > 0 ? [...new Set(decls)].sort() : undefined,
      )
    }
  }

  return formatCoveringSpecs(evidenceBySpec)
}

/**
 * Adds one distinct coverage-evidence item under its owning spec.
 * @param target - Evidence grouped by owning specification.
 * @param specId - Owning specification identifier.
 * @param kind - Covered resource kind.
 * @param resource - Covered resource identity.
 * @param depth - Traversal depth at which coverage was found.
 * @param declarations - Physical declarations supporting logical coverage.
 */
function addCoverageEvidence(
  target: Map<string, Map<string, CoveringSpecEvidence>>,
  specId: string,
  kind: 'file' | 'symbol',
  resource: string,
  depth: number,
  declarations?: readonly string[],
): void {
  const evidence = target.get(specId) ?? new Map<string, CoveringSpecEvidence>()
  const key = `${kind}:${resource}:${String(depth)}`
  evidence.set(key, {
    kind,
    target: resource,
    depth,
    ...(declarations !== undefined && declarations.length > 0 ? { declarations } : {}),
  })
  target.set(specId, evidence)
}

/**
 * Formats deterministic covering-spec evidence collected from any store boundary.
 * @param evidenceBySpec - Evidence grouped by specification identifier.
 * @returns Deterministically ordered covering-spec projections.
 */
function formatCoveringSpecs(
  evidenceBySpec: ReadonlyMap<string, ReadonlyMap<string, CoveringSpecEvidence>>,
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
