/** One studio output line. */
export interface StudioOutputEntryDto {
  readonly id: string
  readonly timestamp: string
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

/** Response for `GET /v1/studio/output`. */
export interface StudioOutputListDto {
  readonly entries: readonly StudioOutputEntryDto[]
}
