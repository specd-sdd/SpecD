import { type GraphStore } from '../ports/graph-store.js'
import {
  DEFAULT_HOTSPOT_KINDS,
  type HotspotEntry,
  type HotspotOptions,
  type HotspotResult,
} from '../value-objects/hotspot-result.js'
import { computeRiskLevel, RISK_ORDER } from '../value-objects/risk-level.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { matchesExclude } from './matches-exclude.js'

/**
 * Extracts the workspace prefix from a colon-separated file path (workspace:relative-path).
 * @param filePath - A workspace-prefixed file path (e.g. "core:src/foo.ts").
 * @returns The workspace name, or the entire path if no colon is present.
 */
function extractWorkspace(filePath: string): string {
  const idx = filePath.indexOf(':')
  return idx === -1 ? filePath : filePath.substring(0, idx)
}

/**
 * Returns whether a symbol has any direct caller evidence.
 * @param sameWs - Same-workspace caller count.
 * @param crossWs - Cross-workspace caller count.
 * @returns True when the symbol has at least one direct caller.
 */
function hasDirectCallerEvidence(sameWs: number, crossWs: number): boolean {
  return sameWs + crossWs > 0
}

/**
 * Resolves effective hotspot defaults field by field.
 * @param options - Optional hotspot filters.
 * @returns Effective ranking defaults and whether importer-only entries are allowed.
 */
function resolveEffectiveHotspotDefaults(options?: HotspotOptions): {
  kinds: readonly string[]
  minScore: number
  minRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  limit: number
  includeImporterOnly: boolean
} {
  const minScore = options?.minScore ?? 1
  return {
    kinds: options?.kinds ?? DEFAULT_HOTSPOT_KINDS,
    minScore,
    minRisk: options?.minRisk ?? 'MEDIUM',
    limit: options?.limit ?? 20,
    includeImporterOnly: options?.includeImporterOnly === true,
  }
}

/**
 * Structural hierarchy counts that contribute to hotspot scoring.
 */
interface HierarchySignal {
  readonly extenders: number
  readonly implementors: number
  readonly overriders: number
}

/**
 * Collects hierarchy-dependent counts for all candidate hotspot symbols.
 * @param store - The graph store to query.
 * @param symbols - Candidate symbols to score.
 * @returns Per-symbol hierarchy counts.
 */
async function collectHierarchySignals(
  store: GraphStore,
  symbols: readonly SymbolNode[],
): Promise<Map<string, HierarchySignal>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const [extenders, implementors, overriders] = await Promise.all([
        store.getExtenders(symbol.id),
        store.getImplementors(symbol.id),
        store.getOverriders(symbol.id),
      ])
      return [
        symbol.id,
        {
          extenders: extenders.length,
          implementors: implementors.length,
          overriders: overriders.length,
        } satisfies HierarchySignal,
      ] as const
    }),
  )

  return new Map(entries)
}

/**
 * Computes hotspot scores for all symbols in the graph using batch queries.
 * Scores reflect how much would break if a symbol changed, weighting
 * cross-workspace callers more heavily than same-workspace callers.
 *
 * @param store - The graph store to query (read-only).
 * @param options - Optional filtering and limiting options.
 * @returns The hotspot result with ranked entries and total symbol count.
 */
export async function computeHotspots(
  store: GraphStore,
  options?: HotspotOptions,
): Promise<HotspotResult> {
  const [callerRows, importerCounts, allSymbols] = await Promise.all([
    store.getSymbolCallers(),
    store.getFileImporterCounts(),
    store.findSymbols({}),
  ])
  const hierarchySignals = await collectHierarchySignals(store, allSymbols)

  // Group caller rows by symbol id
  const symbolMap = new Map<string, { symbol: SymbolNode; sameWs: number; crossWs: number }>()

  for (const { symbol, callerFilePath } of callerRows) {
    let entry = symbolMap.get(symbol.id)
    if (!entry) {
      entry = { symbol, sameWs: 0, crossWs: 0 }
      symbolMap.set(symbol.id, entry)
    }

    const symbolWs = extractWorkspace(symbol.filePath)
    const callerWs = extractWorkspace(callerFilePath)

    if (symbolWs === callerWs) {
      entry.sameWs++
    } else {
      entry.crossWs++
    }
  }

  // Get total symbol count for the result
  const stats = await store.getStatistics()
  const totalSymbols = stats.symbolCount

  const {
    kinds: effectiveKinds,
    minScore,
    minRisk,
    limit,
    includeImporterOnly,
  } = resolveEffectiveHotspotDefaults(options)
  const minRiskOrder = RISK_ORDER[minRisk]

  // Build entries for all symbols that have callers, hierarchy dependents, or importers.
  const entries: HotspotEntry[] = []
  const allSymbolsById = new Map(allSymbols.map((symbol) => [symbol.id, symbol]))

  for (const symbol of allSymbolsById.values()) {
    const callerEntry = symbolMap.get(symbol.id)
    const sameWs = callerEntry?.sameWs ?? 0
    const crossWs = callerEntry?.crossWs ?? 0
    const fileImporters = importerCounts.get(symbol.filePath) ?? 0
    const hierarchy = hierarchySignals.get(symbol.id) ?? {
      extenders: 0,
      implementors: 0,
      overriders: 0,
    }
    const totalCallers = sameWs + crossWs
    const hasDirectEvidence = hasDirectCallerEvidence(sameWs, crossWs)
    const hierarchyWeight =
      hierarchy.extenders * 3 + hierarchy.implementors * 4 + hierarchy.overriders * 2
    const hasHierarchyEvidence = hierarchyWeight > 0
    if (
      !hasDirectEvidence &&
      !hasHierarchyEvidence &&
      (!includeImporterOnly || fileImporters === 0)
    ) {
      continue
    }

    const importerContribution =
      !hasDirectEvidence && !hasHierarchyEvidence
        ? fileImporters
        : Math.min(fileImporters, Math.max(totalCallers, 1))
    const score = sameWs * 2 + crossWs * 4 + importerContribution + hierarchyWeight
    const riskLevel = computeRiskLevel(
      totalCallers + hierarchy.extenders + hierarchy.implementors,
      totalCallers + fileImporters + hierarchyWeight,
      0,
    )

    // directCallers tracks same-workspace callers; crossWorkspaceCallers tracks
    // callers from other workspaces (weighted higher in the score formula above).
    entries.push({
      symbol,
      score,
      directCallers: sameWs,
      crossWorkspaceCallers: crossWs,
      fileImporters,
      riskLevel,
    })
  }

  // Apply filters
  let filtered = entries.filter((e) => {
    if (e.score < minScore) return false
    if (RISK_ORDER[e.riskLevel] < minRiskOrder) return false
    if (options?.workspace && !e.symbol.filePath.startsWith(options.workspace + ':')) return false
    if (
      effectiveKinds !== undefined &&
      effectiveKinds.length > 0 &&
      !effectiveKinds.includes(e.symbol.kind)
    )
      return false
    if (options?.filePath && e.symbol.filePath !== options.filePath) return false
    if (matchesExclude(e.symbol.filePath, options?.excludePaths, options?.excludeWorkspaces))
      return false
    return true
  })

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score)

  // Apply limit
  if (Number.isFinite(limit)) {
    filtered = filtered.slice(0, limit)
  }

  return {
    entries: filtered,
    totalSymbols,
  }
}
