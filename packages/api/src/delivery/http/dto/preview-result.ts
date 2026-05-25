/**
 *
 */
export interface PreviewResultDto {
  readonly specId: string
  readonly files: readonly {
    readonly filename: string
    readonly base?: string
    readonly merged?: string
  }[]
}
