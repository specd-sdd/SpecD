import { type GraphStore } from '../ports/graph-store.js'
import {
  type AffectedSymbol,
  type CoveringSpecImpact,
  type FileImpactResult,
  type ImpactResultFilter,
} from '../value-objects/impact-result.js'
import { maxRisk, type RiskLevel } from '../value-objects/risk-level.js'
import {
  analyzeFileImpactDetails,
  collectCoveringSpecs,
  collectFilteredCoveringSpecs,
  createMemoizedReadStore,
  IMPACT_CONCURRENCY,
} from './analyze-file-impact.js'
import { type ImpactResolutionProvider } from './analyze-impact.js'
import { mapWithConcurrency } from './map-with-concurrency.js'

/**
 * Analyzes the combined impact of multiple files.
 * Aggregates individual file impact results:
 * - Combines the lists of affected files and symbols (keeping shallowest depth for symbols).
 * - Sums direct, indirect, and transitive dependents counts.
 * - Computes the overall risk level as the maximum risk level among all analyzed files.
 *
 * @param store - The graph store to query.
 * @param filePaths - Array of file paths to analyze.
 * @param direction - Traversal direction: upstream, downstream, or both.
 * @param maxDepth - Maximum traversal depth (default: 3).
 * @param resolve - Optional provider of pre-resolved logical selectors.
 * @param filter - Optional provider-owned membership and materialization constraints.
 * @returns The aggregated multi-file impact result.
 */
export async function analyzeFilesImpact(
  store: GraphStore,
  filePaths: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth = 3,
  resolve?: ImpactResolutionProvider,
  filter?: ImpactResultFilter,
): Promise<FileImpactResult> {
  const sharedStore = createMemoizedReadStore(store)
  const context = { store: sharedStore, concurrency: IMPACT_CONCURRENCY } as const
  const uniqueFilePaths = [...new Set(filePaths)]
  const details = await mapWithConcurrency(uniqueFilePaths, context.concurrency, (filePath) =>
    analyzeFileImpactDetails(store, filePath, direction, maxDepth, resolve, context, filter),
  )
  const results = details.map((detail) => detail.result)

  const affectedFileSet = new Set<string>()
  const rawAffectedSymbols: AffectedSymbol[] = []
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0
  let overallRisk: RiskLevel = 'LOW'

  for (const r of results) {
    for (const f of r.affectedFiles) {
      affectedFileSet.add(f)
    }
    rawAffectedSymbols.push(...r.affectedSymbols)
    directDependents += r.directDependents
    indirectDependents += r.indirectDependents
    transitiveDependents += r.transitiveDependents
    overallRisk = maxRisk(overallRisk, r.riskLevel)
  }

  // Deduplicate symbols keeping the shallowest depth
  const symbolMap = new Map<string, AffectedSymbol>()
  for (const s of rawAffectedSymbols) {
    const existing = symbolMap.get(s.id)
    if (!existing || s.depth < existing.depth) {
      symbolMap.set(s.id, s)
    }
  }

  const fileDepths = new Map<string, number>()
  const symbolDepths = new Map<string, number>()
  for (const detail of details) {
    for (const [filePath, depth] of detail.fileDepths) {
      setMinimumDepth(fileDepths, filePath, depth)
    }
    for (const [symbolId, depth] of detail.symbolDepths) {
      setMinimumDepth(symbolDepths, symbolId, depth)
    }
  }

  const materializesFiles = materializesImpactType(filter, 'files')
  const materializesSymbols = materializesImpactType(filter, 'symbols')
  const materializesSpecs = materializesImpactType(filter, 'specs')
  const fileCoveringSpecs = materializesSpecs
    ? filter === undefined
      ? await collectCoveringSpecs(store, fileDepths, symbolDepths)
      : await collectFilteredCoveringSpecs(store, fileDepths, symbolDepths, filter)
    : []

  const coveringSpecMap = new Map<string, CoveringSpecImpact>()
  for (const spec of fileCoveringSpecs) {
    coveringSpecMap.set(spec.specId, spec)
  }
  if (materializesSpecs) {
    for (const detail of details) {
      for (const specId of detail.result.affectedSpecs) {
        if (!coveringSpecMap.has(specId)) {
          coveringSpecMap.set(specId, {
            specId,
            minDepth: 1,
            evidence: [],
          })
        }
      }
    }
  }
  const coveringSpecs = [...coveringSpecMap.values()].sort(
    (left, right) => left.minDepth - right.minDepth || left.specId.localeCompare(right.specId),
  )

  const perFileResults = results.map((result, index) => {
    const detail = details[index]!
    const perFileSpecIds = new Set(detail.result.affectedSpecs)
    const perFileCoveringSpecs = coveringSpecs.filter(
      (spec) =>
        perFileSpecIds.has(spec.specId) ||
        spec.evidence.some(
          (evidence) =>
            (evidence.kind === 'file' && detail.fileDepths.has(evidence.target)) ||
            (evidence.kind === 'symbol' && detail.symbolDepths.has(evidence.target)),
        ),
    )
    return {
      ...result,
      affectedSpecs: materializesSpecs
        ? perFileCoveringSpecs.map((spec) => spec.specId).sort()
        : [],
      coveringSpecs: perFileCoveringSpecs,
    }
  })

  return {
    target: filePaths.join(', '),
    directDependents,
    indirectDependents,
    transitiveDependents,
    riskLevel: overallRisk,
    affectedFiles: materializesFiles ? [...affectedFileSet].sort() : [],
    affectedSymbols: materializesSymbols
      ? [...symbolMap.values()].sort(
          (left, right) =>
            left.depth - right.depth ||
            left.filePath.localeCompare(right.filePath) ||
            left.line - right.line ||
            left.id.localeCompare(right.id),
        )
      : [],
    affectedSpecs: coveringSpecs.map((spec) => spec.specId).sort(),
    affectedProcesses: [],
    // `symbols` carries the per-file breakdown consumed by the multi-file CLI
    // renderer. It is not the materialized `affectedSymbols` collection, which
    // remains governed by the result-type filter above.
    symbols: perFileResults,
    coveringSpecs,
  }
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
 * Retains the shallowest observed depth while folding multiple file analyses.
 * @param target - Mutable resource-depth map.
 * @param key - Resource identity.
 * @param depth - Candidate depth.
 */
function setMinimumDepth(target: Map<string, number>, key: string, depth: number): void {
  const existing = target.get(key)
  if (existing === undefined || depth < existing) target.set(key, depth)
}
