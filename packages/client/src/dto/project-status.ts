import type { GraphHealthWarningDto } from '../graph-health-warnings.js'

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
