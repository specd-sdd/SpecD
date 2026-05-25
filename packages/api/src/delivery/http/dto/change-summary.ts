/**
 *
 */
export interface ChangeSummaryDto {
  readonly name: string
  readonly title?: string
  readonly state: string
  readonly specIds: readonly string[]
  readonly updatedAt: string
  readonly blockerCount: number
}
