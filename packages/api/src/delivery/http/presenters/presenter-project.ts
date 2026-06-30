import { type BuildProjectStatusSnapshotResult, type SpecdConfig } from '@specd/sdk'
import { type ProjectDto } from '../dto/project.js'
import { type ProjectStatusDto } from '../dto/project-status.js'

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
  const graphHealth = snapshot.graphHealth
  return {
    activeChanges: snapshot.summary.activeCount,
    drafts: snapshot.summary.draftCount,
    discarded: snapshot.summary.discardedCount,
    archived: snapshot.summary.archivedCount,
    specsByWorkspace: { ...snapshot.summary.specsByWorkspace },
    graph: {
      lastIndexedAt: graphHealth?.lastIndexedAt ?? null,
      stale: graphHealth?.stale ?? null,
      fingerprintMismatch: graphHealth?.fingerprintMismatch ?? null,
      fileCount: graphHealth?.fileCount ?? null,
      symbolCount: graphHealth?.symbolCount ?? null,
    },
    approvals: {
      specEnabled: snapshot.approvals.specEnabled,
      signoffEnabled: snapshot.approvals.signoffEnabled,
    },
  }
}
