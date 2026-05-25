import type { SpecSummaryDto } from './spec-summary.js'

/** `GET /v1/workspaces/{ws}/specs` wire shape. */
export interface WorkspaceSpecTreeDto {
  readonly workspace: string
  readonly specs: readonly SpecSummaryDto[]
}
