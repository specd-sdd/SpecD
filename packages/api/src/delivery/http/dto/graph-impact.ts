/**
 *
 */
export interface GraphImpactDto {
  readonly target: string
  readonly direction: string
  readonly symbols: readonly {
    readonly id: string
    readonly name: string
    readonly kind: string
    readonly filePath: string
    readonly risk?: string
  }[]
  readonly files?: readonly { readonly path: string; readonly risk?: string }[]
}
