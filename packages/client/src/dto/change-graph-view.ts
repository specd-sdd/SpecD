/** Per-spec coverage in `GET /v1/graph/changes/{name}` response. */
export interface ChangeGraphViewSpecEntryDto {
  readonly specId: string
  readonly coveredFiles: readonly string[]
  readonly coveredSymbols: readonly string[]
}

/** `GET /v1/graph/changes/{name}` wire shape. */
export interface ChangeGraphViewDto {
  readonly changeName: string
  readonly specIds: readonly string[]
  readonly specs: readonly ChangeGraphViewSpecEntryDto[]
}
