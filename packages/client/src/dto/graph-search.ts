import type { GraphSymbolRefDto } from './graph-symbol-ref.js'

/** `GET /v1/graph/search` wire shape. */
export interface GraphSearchResultDto {
  readonly symbols: readonly {
    readonly workspace: string
    readonly symbol: GraphSymbolRefDto
    readonly score: number
    readonly snippet: string
    readonly startLine: number
    readonly endLine: number
  }[]
  readonly specs: readonly {
    readonly workspace: string
    readonly specId: string
    readonly path: string
    readonly title: string
    readonly description: string
    readonly score: number
    readonly snippet: string
    readonly startLine: number
    readonly endLine: number
  }[]
}
