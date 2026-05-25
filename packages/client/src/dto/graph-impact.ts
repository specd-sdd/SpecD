/** `GET /v1/graph/impact` wire shape. */
export interface GraphImpactDto {
  readonly direction: string
  readonly nodes: readonly Record<string, unknown>[]
  readonly edges?: readonly Record<string, unknown>[]
}
