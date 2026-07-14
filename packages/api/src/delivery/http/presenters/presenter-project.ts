import { type BuildProjectStatusSnapshotResult, type SpecdConfig } from '@specd/sdk'
import { mapProjectStatusDto } from '@specd/client'
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
 * @param authType - Effective API auth type
 */
export function toProjectStatusDtoFromSnapshot(
  snapshot: BuildProjectStatusSnapshotResult,
  authType: string,
): ProjectStatusDto {
  return mapProjectStatusDto({
    activeChanges: snapshot.summary.activeCount,
    drafts: snapshot.summary.draftCount,
    discarded: snapshot.summary.discardedCount,
    archived: snapshot.summary.archivedCount,
    specsByWorkspace: snapshot.summary.specsByWorkspace,
    graph:
      snapshot.graphHealth === null
        ? null
        : {
            lastIndexedAt: snapshot.graphHealth.lastIndexedAt ?? null,
            lastIndexedRef: snapshot.graphHealth.lastIndexedRef ?? null,
            stale: snapshot.graphHealth.stale,
            currentRef: snapshot.graphHealth.currentRef,
            fingerprintMismatch: snapshot.graphHealth.fingerprintMismatch,
            fileCount: snapshot.graphHealth.fileCount,
            documentCount: snapshot.graphHealth.documentCount,
            symbolCount: snapshot.graphHealth.symbolCount,
            specCount: snapshot.graphHealth.specCount,
          },
    approvals: snapshot.approvals,
    authType,
  })
}
