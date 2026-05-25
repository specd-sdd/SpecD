import { type SpecdConfig } from '@specd/core'
import { type ProjectDto } from '../dto/project.js'
import { type ProjectStatusDto } from '../dto/project-status.js'
import { type GraphStatistics } from '@specd/code-graph'

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
 * Aggregates list counts and graph stats into project status DTO.
 * @param input
 * @param input.activeCount
 * @param input.draftCount
 * @param input.discardedCount
 * @param input.archivedCount
 * @param input.specsByWorkspace
 * @param input.graphStats
 * @param input.graphStale
 * @param input.fingerprintMismatch
 * @param input.config
 */
export function toProjectStatusDto(input: {
  activeCount: number
  draftCount: number
  discardedCount: number
  archivedCount: number
  specsByWorkspace: Record<string, number>
  graphStats: GraphStatistics | null
  graphStale: boolean | null
  fingerprintMismatch: boolean | null
  config: SpecdConfig
}): ProjectStatusDto {
  const stats = input.graphStats
  return {
    activeChanges: input.activeCount,
    drafts: input.draftCount,
    discarded: input.discardedCount,
    archived: input.archivedCount,
    specsByWorkspace: input.specsByWorkspace,
    graph: {
      lastIndexedAt: stats?.lastIndexedAt ?? null,
      stale: input.graphStale,
      fingerprintMismatch: input.fingerprintMismatch,
      fileCount: stats?.fileCount ?? null,
      symbolCount: stats?.symbolCount ?? null,
    },
    approvals: {
      specEnabled: input.config.approvals.spec,
      signoffEnabled: input.config.approvals.signoff,
    },
  }
}
