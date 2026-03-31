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

  const {
    kinds: effectiveKinds,
    minScore,
    minRisk,
    limit,
    includeImporterOnly,
  } = resolveEffectiveHotspotDefaults(options)
  const minRiskOrder = RISK_ORDER[minRisk]

  // Build entries for all symbols that have callers or importers
  const entries: HotspotEntry[] = []

  // Process symbols with callers
  for (const { symbol, sameWs, crossWs } of symbolMap.values()) {
    const fileImporters = importerCounts.get(symbol.filePath) ?? 0
    const totalCallers = sameWs + crossWs
    const hasDirectEvidence = hasDirectCallerEvidence(sameWs, crossWs)
    const score = !hasDirectEvidence
      ? 0
      : sameWs * 2 + crossWs * 4 + Math.min(fileImporters, totalCallers)
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

  // Only widen to importer-only symbols when explicitly requested.
  if (includeImporterOnly) {
    // Scope the query to the requested workspace/kind when possible
    // to avoid a full symbol table scan
    const allSymbols = await store.findSymbols({
      ...(options?.workspace ? { filePath: `${options.workspace}:*` } : undefined),
    })
    for (const symbol of allSymbols) {
      if (symbolMap.has(symbol.id)) continue // already processed
      if (
        effectiveKinds !== undefined &&
        effectiveKinds.length > 0 &&
        !effectiveKinds.includes(symbol.kind)
      ) {
        continue
      }
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
