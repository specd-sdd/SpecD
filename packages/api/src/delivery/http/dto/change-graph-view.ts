import type { GraphFileRefDto } from './graph-file-ref.js'
import type { GraphSymbolRefDto } from './graph-symbol-ref.js'

/**
 *
 */
export interface ChangeGraphViewDto {
  readonly changeName: string
  readonly specIds: readonly string[]
  readonly specs: readonly {
    readonly specId: string
    readonly coveredFiles: readonly GraphFileRefDto[]
    readonly coveredSymbols: readonly GraphSymbolRefDto[]
  }[]
}
