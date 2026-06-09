import type { GraphFileRefDto } from './graph-file-ref.js'
import type { GraphSymbolRefDto } from './graph-symbol-ref.js'

/** Per-spec coverage in `GET /v1/graph/changes/{name}` response. */
export interface ChangeGraphViewSpecEntryDto {
  readonly specId: string
  readonly coveredFiles: readonly GraphFileRefDto[]
  readonly coveredSymbols: readonly GraphSymbolRefDto[]
}

/** `GET /v1/graph/changes/{name}` wire shape. */
export interface ChangeGraphViewDto {
  readonly changeName: string
  readonly specIds: readonly string[]
  readonly specs: readonly ChangeGraphViewSpecEntryDto[]
}
