/** Graph freshness summary on {@link ProjectStatusDto}. */
export interface ProjectGraphSummaryDto {
  readonly indexed?: boolean
  readonly stale?: boolean
  readonly symbolCount?: number
  readonly specCount?: number
}

/** `GET /v1/project/status` wire shape. */
export interface ProjectStatusDto {
  readonly activeChanges: number
  readonly drafts: number
  readonly discarded: number
  readonly archived: number
  readonly graph?: ProjectGraphSummaryDto
  readonly auth: { readonly type: string }
}
