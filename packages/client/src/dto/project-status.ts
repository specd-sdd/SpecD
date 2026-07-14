import { deriveGraphHealthWarnings, type GraphHealthWarningDto } from '../graph-health-warnings.js'

/** Graph freshness summary on {@link ProjectStatusDto}. */
export interface ProjectGraphSummaryDto {
  readonly indexed?: boolean
  readonly lastIndexedAt?: string | null
  readonly lastIndexedRef?: string | null
  readonly stale?: boolean | null
  readonly currentRef?: string | null
  readonly fingerprintMismatch?: boolean | null
  readonly fileCount?: number | null
  readonly documentCount?: number | null
  readonly symbolCount?: number | null
  readonly specCount?: number | null
  readonly warnings?: readonly GraphHealthWarningDto[]
}

/** `GET /v1/project/status` wire shape. */
export interface ProjectStatusDto {
  readonly activeChanges: number
  readonly drafts: number
  readonly discarded: number
  readonly archived: number
  readonly specsByWorkspace?: Record<string, number>
  readonly graph?: ProjectGraphSummaryDto
  readonly approvals?: { readonly specEnabled: boolean; readonly signoffEnabled: boolean }
  readonly auth: { readonly type: string }
}

/** Structural graph-health input used by {@link mapProjectStatusDto}. */
export interface ProjectStatusGraphInput {
  readonly lastIndexedAt?: string | null
  readonly lastIndexedRef?: string | null
  readonly stale?: boolean | null
  readonly currentRef?: string | null
  readonly fingerprintMismatch?: boolean | null
  readonly fileCount?: number | null
  readonly documentCount?: number | null
  readonly symbolCount?: number | null
  readonly specCount?: number | null
}

/** Structural input for the canonical project-status mapper. */
export interface ProjectStatusMapperInput {
  readonly activeChanges: number
  readonly drafts: number
  readonly discarded: number
  readonly archived: number
  readonly specsByWorkspace?: Readonly<Record<string, number>>
  readonly graph?: ProjectStatusGraphInput | null
  readonly approvals?: {
    readonly specEnabled: boolean
    readonly signoffEnabled: boolean
  }
  readonly authType: string
}

/**
 * Maps structural status data to the canonical project-status DTO.
 *
 * @param input - Structural project status data
 * @returns Canonical `ProjectStatusDto`
 */
export function mapProjectStatusDto(input: ProjectStatusMapperInput): ProjectStatusDto {
  const graph =
    input.graph == null
      ? undefined
      : {
          indexed: true,
          ...(input.graph.lastIndexedAt !== undefined
            ? { lastIndexedAt: input.graph.lastIndexedAt }
            : {}),
          ...(input.graph.lastIndexedRef !== undefined
            ? { lastIndexedRef: input.graph.lastIndexedRef }
            : {}),
          ...(input.graph.stale !== undefined ? { stale: input.graph.stale } : {}),
          ...(input.graph.currentRef !== undefined ? { currentRef: input.graph.currentRef } : {}),
          ...(input.graph.fingerprintMismatch !== undefined
            ? { fingerprintMismatch: input.graph.fingerprintMismatch }
            : {}),
          ...(input.graph.fileCount !== undefined ? { fileCount: input.graph.fileCount } : {}),
          ...(input.graph.documentCount !== undefined
            ? { documentCount: input.graph.documentCount }
            : {}),
          ...(input.graph.symbolCount !== undefined
            ? { symbolCount: input.graph.symbolCount }
            : {}),
          ...(input.graph.specCount !== undefined ? { specCount: input.graph.specCount } : {}),
          warnings: deriveGraphHealthWarnings({
            stale: input.graph.stale ?? null,
            fingerprintMismatch: input.graph.fingerprintMismatch ?? null,
            lastIndexedRef: input.graph.lastIndexedRef ?? null,
            currentRef: input.graph.currentRef ?? null,
          }),
        }

  return {
    activeChanges: input.activeChanges,
    drafts: input.drafts,
    discarded: input.discarded,
    archived: input.archived,
    ...(input.specsByWorkspace !== undefined
      ? { specsByWorkspace: { ...input.specsByWorkspace } }
      : {}),
    ...(graph !== undefined ? { graph } : {}),
    ...(input.approvals !== undefined
      ? {
          approvals: {
            specEnabled: input.approvals.specEnabled,
            signoffEnabled: input.approvals.signoffEnabled,
          },
        }
      : {}),
    auth: { type: input.authType },
  }
}
