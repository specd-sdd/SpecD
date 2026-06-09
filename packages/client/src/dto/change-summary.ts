/** List item for active changes, drafts, and discarded. */
export interface ChangeSummaryDto {
  readonly name: string
  readonly description?: string
  readonly state: string
  readonly specIds: readonly string[]
  readonly updatedAt?: string
  readonly blockerCount?: number
}
