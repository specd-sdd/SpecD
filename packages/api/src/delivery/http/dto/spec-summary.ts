/**
 *
 */
export interface SpecSummaryDto {
  readonly specId: string
  readonly workspace: string
  readonly path: string
  readonly title?: string
  readonly description?: string
}
