import {
  type BuildProjectStatusSnapshotResult,
  type GetGraphHealthResult,
  type SpecdConfig,
} from '@specd/sdk'
import { deriveGraphHealthWarnings } from '@specd/client'
import { type ProjectDto } from '../dto/project.js'
import { type ProjectStatusDto } from '../dto/project-status.js'

function toProjectGraphSummaryDto(
  graphHealth: GetGraphHealthResult | null,
): ProjectStatusDto['graph'] {
  if (graphHealth === null) {
    return {
      lastIndexedAt: null,
      lastIndexedRef: null,
      stale: null,
      currentRef: null,
      fingerprintMismatch: null,
      fileCount: null,
      documentCount: null,
      symbolCount: null,
      specCount: null,
      warnings: [],
    }
  }
  const warnings = deriveGraphHealthWarnings({
    stale: graphHealth.stale,
    fingerprintMismatch: graphHealth.fingerprintMismatch,
    lastIndexedRef: graphHealth.lastIndexedRef,
    currentRef: graphHealth.currentRef,
  })
  return {
    lastIndexedAt: graphHealth.lastIndexedAt ?? null,
    lastIndexedRef: graphHealth.lastIndexedRef ?? null,
    stale: graphHealth.stale,
    currentRef: graphHealth.currentRef,
    fingerprintMismatch: graphHealth.fingerprintMismatch,
    fileCount: graphHealth.fileCount,
    documentCount: graphHealth.documentCount,
    symbolCount: graphHealth.symbolCount,
    specCount: graphHealth.specCount,
    warnings,
  }
}

/**
 * Maps project config to DTO.
 * @param config
 */
export function toProjectDto(config: SpecdConfig): ProjectDto {
  const authType = config.api?.auth.type ?? 'disabled'
  return {
    name: config.projectRoot.split('/').pop() ?? config.projectRoot,
    projectRoot: config.projectRoot,
    schemaRef: config.schemaRef,
    workspaces: config.workspaces.map((w) => ({
      name: w.name,
      ...(w.prefix !== undefined ? { prefix: w.prefix } : {}),
      ...(w.ownership !== undefined ? { ownership: w.ownership } : {}),
    })),
    approvals: config.approvals,
    auth: { type: authType },
  }
}

/**
 * Maps {@link buildProjectStatusSnapshot} output to the HTTP project status DTO.
 *
 * @param snapshot - SDK project status snapshot
 */
export function toProjectStatusDtoFromSnapshot(
  snapshot: BuildProjectStatusSnapshotResult,
): ProjectStatusDto {
  return {
    activeChanges: snapshot.summary.activeCount,
    drafts: snapshot.summary.draftCount,
    discarded: snapshot.summary.discardedCount,
    archived: snapshot.summary.archivedCount,
    specsByWorkspace: { ...snapshot.summary.specsByWorkspace },
    graph: toProjectGraphSummaryDto(snapshot.graphHealth),
    approvals: {
      specEnabled: snapshot.approvals.specEnabled,
      signoffEnabled: snapshot.approvals.signoffEnabled,
    },
  }
}
