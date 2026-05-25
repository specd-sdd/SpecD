export interface LogEntryDto {
  readonly timestamp: string
  readonly level: string
  readonly message: string
  readonly context: Record<string, unknown>
}

export interface LogReadDto {
  readonly entries?: readonly LogEntryDto[]
  readonly lines?: readonly string[]
}
