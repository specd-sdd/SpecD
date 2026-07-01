import path from 'node:path'
import {
  type GetGraphHealthResult,
  type SymbolNode,
  type SpecNode,
  type DocumentNode,
  type IndexResult,
  type IndexError,
  type WorkspaceIndexBreakdown,
  type HotspotEntry,
} from '@specd/sdk'
import type { SpecdConfig } from '@specd/sdk'
import { deriveGraphHealthWarnings } from '@specd/client'
import { type GraphStatusDto } from '../dto/graph-status.js'
import { type GraphFileRefDto } from '../dto/graph-file-ref.js'
import { type GraphSymbolRefDto } from '../dto/graph-symbol-ref.js'
import { type GraphSearchResultDto } from '../dto/graph-search.js'
import { type GraphImpactDto } from '../dto/graph-impact.js'
import { type ChangeGraphViewDto } from '../dto/change-graph-view.js'

/**
 * Maps graph health to status DTO.
 * @param health - Enriched graph health from `GetGraphHealth`
 */
export function toGraphStatusDto(health: GetGraphHealthResult): GraphStatusDto {
  const warnings = deriveGraphHealthWarnings({
    stale: health.stale,
    fingerprintMismatch: health.fingerprintMismatch,
    lastIndexedRef: health.lastIndexedRef,
    currentRef: health.currentRef,
  })
  return {
    lastIndexedAt: health.lastIndexedAt ?? null,
    lastIndexedRef: health.lastIndexedRef ?? null,
    fileCount: health.fileCount,
    documentCount: health.documentCount,
    symbolCount: health.symbolCount,
    specCount: health.specCount,
    graphFingerprint: health.graphFingerprint ?? null,
    stale: health.stale,
    currentRef: health.currentRef,
    fingerprintMismatch: health.fingerprintMismatch,
    warnings,
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
 * Maps hotspots analysis result to a list of DTOs.
 * @param config
 * @param result
 */
export function toGraphHotspotsDto(
  config: SpecdConfig,
  result: { entries: readonly HotspotEntry[] },
): readonly Record<string, unknown>[] {
  return result.entries.map((entry) => ({
    ...entry,
    symbol: toGraphSymbolRefDto(config, entry.symbol),
  }))
}

/**
 * Maps indexing result to the shared DTO shape.
 * @param result
 */
export function toGraphIndexResultDto(result: IndexResult): Record<string, unknown> {
  return {
    filesDiscovered: result.filesDiscovered,
    filesIndexed: result.filesIndexed,
    documentsIndexed: result.documentsIndexed,
    filesRemoved: result.filesRemoved,
    filesSkipped: result.filesSkipped,
    specsDiscovered: result.specsDiscovered,
    specsIndexed: result.specsIndexed,
    errors: result.errors.map((e: IndexError) => ({
      filePath: e.filePath,
      message: e.message,
    })),
    duration: result.duration,
    workspaces: result.workspaces.map((ws: WorkspaceIndexBreakdown) => ({
      name: ws.name,
      filesDiscovered: ws.filesDiscovered,
      filesIndexed: ws.filesIndexed,
      documentsIndexed: ws.documentsIndexed,
      filesSkipped: ws.filesSkipped,
      filesRemoved: ws.filesRemoved,
      specsDiscovered: ws.specsDiscovered,
      specsIndexed: ws.specsIndexed,
    })),
    vcsRef: result.vcsRef,
    graphFingerprint: result.graphFingerprint,
    fullRebuildReason: result.fullRebuildReason,
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
    filePath: symbol.filePath,
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
