/** One scheduled validation step in a batch run. */
export interface ValidateBatchStepResultDto {
  readonly spec: string | null
  readonly artifact: string
  readonly passed: boolean
  readonly failures: readonly {
    readonly message: string
    readonly artifactId?: string
    readonly path?: string
  }[]
  readonly warnings: readonly string[]
  readonly files: readonly string[]
}

/** `POST /changes/:name/validate-all` response body. */
export interface ValidateBatchResultDto {
  readonly passed: boolean
  readonly total: number
  readonly results: readonly ValidateBatchStepResultDto[]
}
