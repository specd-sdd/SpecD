import type { GraphFileRefDto } from './graph-file-ref.js'
import type { GraphSymbolRefDto } from './graph-symbol-ref.js'

/** `GET /v1/graph/specs/{workspace}/{path}` wire shape. */
export interface GraphSpecCoverageDto {
  readonly specId: string
  readonly files: readonly GraphFileRefDto[]
  readonly symbols: readonly GraphSymbolRefDto[]
}
