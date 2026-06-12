import path from 'node:path'
import {
  type GraphStatistics,
  type SymbolNode,
  type SpecNode,
  type DocumentNode,
} from '@specd/code-graph'
import type { SpecdConfig } from '@specd/core'
import { type GraphStatusDto } from '../dto/graph-status.js'
import { type GraphFileRefDto } from '../dto/graph-file-ref.js'
import { type GraphSymbolRefDto } from '../dto/graph-symbol-ref.js'
import { type GraphSearchResultDto } from '../dto/graph-search.js'
import { type GraphImpactDto } from '../dto/graph-impact.js'
import { type ChangeGraphViewDto } from '../dto/change-graph-view.js'

/**
 * Maps graph statistics to status DTO.
 * @param stats
 * @param stale
 */
export function toGraphStatusDto(stats: GraphStatistics, stale: boolean | null): GraphStatusDto {
  return {
    lastIndexedAt: stats.lastIndexedAt ?? null,
    lastIndexedRef: stats.lastIndexedRef ?? null,
    fileCount: stats.fileCount,
    documentCount: stats.documentCount,
    symbolCount: stats.symbolCount,
    specCount: stats.specCount,
    graphFingerprint: stats.graphFingerprint ?? null,
    stale,
  }
}

/**
 * Maps symbol, spec, and document search hits to DTO.
 * @param config
 * @param symbols
 * @param specs
 * @param documents
 */
export function toGraphSearchResultDto(
  config: SpecdConfig,
  symbols: Array<{
    symbol: SymbolNode
    score: number
    snippet: string
    startLine: number
    endLine: number
  }>,
  specs: Array<{
    spec: SpecNode
    score: number
    snippet: string
    startLine: number
    endLine: number
  }>,
  documents: Array<{
    document: DocumentNode
    score: number
    snippet: string
    startLine: number
    endLine: number
  }> = [],
): GraphSearchResultDto {
  return {
    symbols: symbols.map(({ symbol, score, snippet, startLine, endLine }) => ({
      workspace: getWorkspaceFromGraphPath(symbol.filePath),
      symbol: toGraphSymbolRefDto(config, symbol),
      score,
      snippet,
      startLine,
      endLine,
    })),
    specs: specs.map(({ spec, score, snippet, startLine, endLine }) => ({
      workspace: spec.workspace,
      specId: spec.specId,
      path: spec.path,
      title: spec.title,
      description: spec.description,
      score,
      snippet,
      startLine,
      endLine,
    })),
    documents: documents.map(({ document, score, snippet, startLine, endLine }) => {
      const workspace = document.workspace ?? getWorkspaceFromGraphPath(document.path)
      const workspaceRelativePath = getRelativePathFromGraphPath(document.path)
      return {
        workspace,
        path: workspaceRelativePath,
        projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
        score,
        snippet,
        startLine,
        endLine,
      }
    }),
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
  config: SpecdConfig,
  target: string,
  direction: string,
  impact: {
    riskLevel: string
    directDependents: number
    indirectDependents: number
    transitiveDependents: number
    affectedFiles: readonly string[]
    affectedProcesses: readonly string[]
  },
  symbols: Array<{
    id: string
    name: string
    filePath: string
    line: number
    depth: number
    risk?: string
  }>,
  specs: readonly string[] = [],
): GraphImpactDto {
  return {
    target,
    direction,
    riskLevel: impact.riskLevel,
    directDepsCount: impact.directDependents,
    indirectDepsCount: impact.indirectDependents,
    transitiveDepsCount: impact.transitiveDependents,
    affectedFilesCount: impact.affectedFiles.length,
    affectedProcesses: [...impact.affectedProcesses],
    specs: [...specs],
    symbols: symbols.map((symbol) => ({
      ...toGraphSymbolRefDto(config, symbol),
      depth: symbol.depth,
      ...(symbol.risk !== undefined ? { risk: symbol.risk } : {}),
    })),
    files: impact.affectedFiles.map((file) => toGraphFileRefDto(config, file)),
  }
}

/**
 * Maps change-scoped graph view.
 * @param changeName
 * @param specIds
 * @param specs
 */
export function toChangeGraphViewDto(
  _config: SpecdConfig,
  changeName: string,
  specIds: readonly string[],
  specs: ChangeGraphViewDto['specs'],
): ChangeGraphViewDto {
  return { changeName, specIds: [...specIds], specs }
}

export function toGraphFileRefDto(config: SpecdConfig, graphFileId: string): GraphFileRefDto {
  const workspace = getWorkspaceFromGraphPath(graphFileId)
  const workspaceRelativePath = getRelativePathFromGraphPath(graphFileId)
  return {
    id: graphFileId,
    workspace,
    workspaceRelativePath,
    projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
  }
}

export function toGraphSymbolRefDto(
  config: SpecdConfig,
  symbol: {
    id: string
    name: string
    filePath: string
    line: number
    kind?: string
    column?: number
  },
): GraphSymbolRefDto {
  const workspace = getWorkspaceFromGraphPath(symbol.filePath)
  const workspaceRelativePath = getRelativePathFromGraphPath(symbol.filePath)
  const parsed = parseGraphSymbolId(symbol.id)
  return {
    id: symbol.id,
    workspace,
    workspaceRelativePath,
    projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
    name: symbol.name,
    kind: symbol.kind ?? parsed.kind,
    line: symbol.line,
    column: symbol.column ?? parsed.column,
  }
}

function getWorkspaceFromGraphPath(graphPath: string): string {
  return graphPath.split(':', 1)[0] ?? ''
}

function getRelativePathFromGraphPath(graphPath: string): string {
  const separator = graphPath.indexOf(':')
  return separator >= 0 ? graphPath.slice(separator + 1) : graphPath
}

function toProjectRelativePath(
  config: SpecdConfig,
  workspace: string,
  workspaceRelativePath: string,
): string {
  const ws = config.workspaces.find((entry) => entry.name === workspace)
  if (ws === undefined) {
    return workspaceRelativePath
  }
  return path
    .relative(config.projectRoot, path.join(ws.codeRoot, workspaceRelativePath))
    .replaceAll('\\', '/')
}

function parseGraphSymbolId(symbolId: string): { kind: string; column: number } {
  const parts = symbolId.split(':')
  if (parts.length < 3) {
    return { kind: 'symbol', column: 0 }
  }
  const maybeColumn = Number(parts.at(-1) ?? '0')
  return {
    kind: parts.at(-3) ?? 'symbol',
    column: Number.isFinite(maybeColumn) ? maybeColumn : 0,
  }
}
