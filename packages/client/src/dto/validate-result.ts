/** `POST .../validate` wire shape. */
export interface ValidateResultDto {
  readonly passed: boolean
  readonly failures: readonly {
    readonly message: string
    readonly artifactId?: string
    readonly path?: string
  }[]
  readonly warnings: readonly string[]
  readonly files: readonly string[]
}
