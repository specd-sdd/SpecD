import type { ArtifactListEntryDto } from './artifact-list.js'
import type { ChangeHistoryEventDto } from './change-detail.js'

/** `GET /v1/archived-changes` list item. */
export interface ArchivedChangeIndexEntryDto {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: string
  readonly description?: string
  readonly archivedBy?: { readonly name: string; readonly email: string } | string
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number | string
  readonly workspaces: readonly string[]
  readonly artifacts: readonly string[]
}

/** `GET /v1/archived-changes` list payload. */
export interface ArchivedChangeListDto {
  readonly items: readonly ArchivedChangeIndexEntryDto[]
  readonly meta: {
    readonly total: number
    readonly count: number
    readonly limit: number
    readonly page?: number
    readonly startAt?: string
  }
}

/** `GET /v1/archived-changes/{name}` wire shape. */
export interface ArchivedChangeDetailDto {
  readonly name: string
  readonly description?: string
  readonly state: string
  readonly archivedName: string
  readonly archivedAt: string
  readonly archivedBy?: { readonly name: string; readonly email: string } | string
  readonly specIds: readonly string[]
  readonly specDependsOn?: Record<string, readonly string[]>
  readonly schemaName: string
  readonly schemaVersion: number | string
  readonly updatedAt?: string
  readonly history: readonly ChangeHistoryEventDto[]
  readonly workspaces: readonly string[]
  readonly artifacts: readonly ArtifactListEntryDto[]
  readonly archivedMeta?: {
    readonly archivedName: string
    readonly archivedAt: string
    readonly artifactTypes: readonly string[]
  }
}
