/**
 *
 */
export interface ValidateResultDto {
  readonly passed: boolean
  readonly failures: readonly { readonly message: string; readonly path?: string }[]
  readonly notes: readonly string[]
  readonly files: readonly string[]
}
