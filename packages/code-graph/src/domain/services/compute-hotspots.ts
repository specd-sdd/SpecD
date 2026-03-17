import { type GraphStore } from '../ports/graph-store.js'
import {
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
  const [callerRows, importerCounts] = await Promise.all([
    store.getSymbolCallers(),
    store.getFileImporterCounts(),
  ])

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

  // Build entries for all symbols that have callers or importers
  const entries: HotspotEntry[] = []

  // Process symbols with callers
  for (const { symbol, sameWs, crossWs } of symbolMap.values()) {
    const fileImporters = importerCounts.get(symbol.filePath) ?? 0
    const totalCallers = sameWs + crossWs
    const score = sameWs * 3 + crossWs * 5 + fileImporters
    const riskLevel = computeRiskLevel(totalCallers, totalCallers + fileImporters, 0)

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

  // When a scope filter is explicitly provided, drop the restrictive defaults
  // so scoped queries (e.g. { workspace: 'core' }) don't silently lose results.
  // Threshold overrides (minScore, minRisk, limit) don't trigger this — they
  // are explicit choices about the thresholds themselves.
  const hasScopeFilter =
    options?.workspace !== undefined ||
    options?.kind !== undefined ||
    options?.filePath !== undefined ||
    (options?.excludePaths?.length ?? 0) > 0 ||
    (options?.excludeWorkspaces?.length ?? 0) > 0

  // Also include symbols that have no callers but may have file importers,
  // or all symbols when minScore is 0
  const minScore = options?.minScore ?? (hasScopeFilter ? 0 : 1)
  const needAllSymbols = minScore === 0 || importerCounts.size > 0
  if (needAllSymbols) {
    // Scope the query to the requested workspace/kind when possible
    // to avoid a full symbol table scan
    const allSymbols = await store.findSymbols({
      ...(options?.workspace ? { filePath: `${options.workspace}:*` } : undefined),
      ...(options?.kind ? { kind: options.kind } : undefined),
    })
    for (const symbol of allSymbols) {
      if (symbolMap.has(symbol.id)) continue // already processed
      const fileImporters = importerCounts.get(symbol.filePath) ?? 0
      if (fileImporters === 0 && minScore > 0) continue

      const score = fileImporters
      const riskLevel = computeRiskLevel(0, fileImporters, 0)

      entries.push({
        symbol,
        score,
        directCallers: 0,
        crossWorkspaceCallers: 0,
        fileImporters,
        riskLevel,
      })
    }
  }

  // Apply filters
  const minRisk = options?.minRisk ?? (hasScopeFilter ? 'LOW' : 'MEDIUM')
  const limit = options?.limit ?? (hasScopeFilter ? Infinity : 20)
  const minRiskOrder = RISK_ORDER[minRisk]

  let filtered = entries.filter((e) => {
    if (e.score < minScore) return false
    if (RISK_ORDER[e.riskLevel] < minRiskOrder) return false
    if (options?.workspace && !e.symbol.filePath.startsWith(options.workspace + ':')) return false
    if (options?.kind && e.symbol.kind !== options.kind) return false
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
