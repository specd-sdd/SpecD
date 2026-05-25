/**
 *
 */
export interface GraphSearchResultDto {
  readonly symbols: readonly {
    readonly workspace: string
    readonly symbol: {
      readonly id: string
      readonly name: string
      readonly kind: string
      readonly filePath: string
      readonly line: number
      readonly column: number
    }
    readonly score: number
  }[]
  readonly specs: readonly {
    readonly workspace: string
    readonly specId: string
    readonly path: string
    readonly title: string
    readonly description: string
    readonly score: number
  }[]
}
