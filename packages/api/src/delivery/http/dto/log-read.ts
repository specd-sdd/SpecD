/** One log entry returned by `GET /v1/logs`. */
export interface LogEntryDto {
  readonly timestamp: string
  readonly level: string
  readonly message: string
  readonly context: Record<string, unknown>
}

/** Response for `GET /v1/logs`. */
export interface LogReadDto {
  readonly entries?: readonly LogEntryDto[]
  readonly lines?: readonly string[]
}
