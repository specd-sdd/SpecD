/** Single graph search hit. */
export interface GraphSearchHitDto {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly file?: string
  readonly workspace?: string
  readonly score?: number
}

/** `GET /v1/graph/search` wire shape. */
export interface GraphSearchResultDto {
  readonly query: string
  readonly hits: readonly GraphSearchHitDto[]
}
