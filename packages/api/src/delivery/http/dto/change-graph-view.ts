/**
 *
 */
export interface ChangeGraphViewDto {
  readonly changeName: string
  readonly specIds: readonly string[]
  readonly specs: readonly {
    readonly specId: string
    readonly coveredFiles: readonly string[]
    readonly coveredSymbols: readonly string[]
  }[]
}
