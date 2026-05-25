import { type GraphStatistics, type SymbolNode, type SpecNode } from '@specd/code-graph'
import { type GraphStatusDto } from '../dto/graph-status.js'
import { type GraphSearchResultDto } from '../dto/graph-search.js'
import { type GraphImpactDto } from '../dto/graph-impact.js'
import { type ChangeGraphViewDto } from '../dto/change-graph-view.js'

/**
 * Maps graph statistics to status DTO.
 * @param stats
 * @param stale
 */
export function toGraphStatusDto(
  stats: GraphStatistics,
  stale: boolean | null,
): GraphStatusDto {
  return {
    lastIndexedAt: stats.lastIndexedAt ?? null,
    lastIndexedRef: stats.lastIndexedRef ?? null,
    fileCount: stats.fileCount,
    symbolCount: stats.symbolCount,
    specCount: stats.specCount,
    graphFingerprint: stats.graphFingerprint ?? null,
    stale,
  }
}

/**
 * Maps symbol and spec search hits to DTO.
 * @param symbols
 * @param specs
 */
export function toGraphSearchResultDto(
  symbols: Array<{ symbol: SymbolNode; score: number }>,
  specs: Array<{ spec: SpecNode; score: number }>,
): GraphSearchResultDto {
  return {
    symbols: symbols.map(({ symbol, score }) => ({
      workspace: symbol.id.split(':')[0] ?? '',
      symbol: {
        id: symbol.id,
        name: symbol.name,
        kind: symbol.kind,
        filePath: symbol.filePath,
        line: symbol.line,
        column: symbol.column,
      },
      score,
    })),
    specs: specs.map(({ spec, score }) => ({
      workspace: spec.workspace,
      specId: spec.specId,
      path: spec.path,
      title: spec.title,
      description: spec.description,
      score,
    })),
  }
}

/**
 * Maps impact analysis to DTO.
 * @param target
 * @param direction
 * @param symbols
 * @param files
 */
export function toGraphImpactDto(
  target: string,
  direction: string,
  symbols: Array<{ id: string; name: string; kind: string; filePath: string; risk?: string }>,
  files?: Array<{ path: string; risk?: string }>,
): GraphImpactDto {
  return {
    target,
    direction,
    symbols,
    ...(files !== undefined ? { files } : {}),
  }
}

/**
 * Maps change-scoped graph view.
 * @param changeName
 * @param specIds
 * @param specs
 */
export function toChangeGraphViewDto(
  changeName: string,
  specIds: readonly string[],
  specs: ChangeGraphViewDto['specs'],
): ChangeGraphViewDto {
  return { changeName, specIds: [...specIds], specs }
}
