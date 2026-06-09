import type { ArtifactListEntryDto } from './artifact-list.js'

/** History event on {@link ChangeDetailDto}. */
export interface ChangeHistoryEventDto {
  readonly type: string
  readonly at: string
  readonly by?: { readonly name: string; readonly email: string } | string
  readonly [key: string]: unknown
}

/** `GET /v1/changes/{name}` wire shape (metadata only). */
export interface ChangeDetailDto {
  readonly name: string
  readonly description?: string
  readonly state: string
  readonly specIds: readonly string[]
  readonly specDependsOn?: Record<string, readonly string[]>
  readonly schemaName: string
  readonly schemaVersion: number | string
  /** Drift invalidation policy (`none` | `surgical` | `downstream` | `global`). */
  readonly invalidationPolicy?: string
  readonly updatedAt?: string
  readonly history: readonly ChangeHistoryEventDto[]
  readonly approvals?: {
    readonly specApproved?: boolean
    readonly signoffApproved?: boolean
  }
  /** Present when loaded via `getArchivedChange` (read-only snapshot). */
  readonly archivedMeta?: {
    readonly archivedName: string
    readonly archivedAt: string
    readonly artifactTypes: readonly string[]
  }
  /** Present on archived change detail snapshots. */
  readonly workspaces?: readonly string[]
  /** Present on archived change detail snapshots. */
  readonly artifacts?: readonly ArtifactListEntryDto[]
}
