import type { GraphFileRefDto } from './graph-file-ref.js'
import type { GraphSymbolRefDto } from './graph-symbol-ref.js'

/** `GET /v1/graph/impact` wire shape. */
export interface GraphImpactDto {
  readonly target: string
  readonly direction: string
  readonly riskLevel: string
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly affectedProcesses: readonly string[]
  readonly specs: readonly string[]
  readonly symbols: readonly (GraphSymbolRefDto & { readonly depth: number; readonly risk?: string })[]
  readonly files: readonly (GraphFileRefDto & { readonly risk?: string })[]
}
