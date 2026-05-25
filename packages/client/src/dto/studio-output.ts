export type StudioOutputLevel = 'debug' | 'info' | 'warn' | 'error'

export interface StudioOutputEntryDto {
  readonly id: string
  readonly timestamp: string
  readonly level: StudioOutputLevel
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

export interface StudioOutputListDto {
  readonly entries: readonly StudioOutputEntryDto[]
}
