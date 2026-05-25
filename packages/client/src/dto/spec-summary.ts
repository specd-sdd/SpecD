/** Spec tree node metadata. */
export interface SpecSummaryDto {
  readonly specId: string
  readonly title?: string
  readonly path: string
  readonly children?: readonly SpecSummaryDto[]
}
