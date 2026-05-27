import type { LogReadDto } from './dto/log-read.js'

export interface AppendProjectLogInput {
  readonly level?: 'debug' | 'info' | 'warn' | 'error'
  readonly message: string
  readonly context?: Record<string, unknown>
}

/** Studio bottom panel remote contract for generic project logs. */
export interface PortStudioPanel {
  readProjectLogs(
    options?: { readonly limit?: number; readonly prettier?: boolean },
    signal?: AbortSignal,
  ): Promise<LogReadDto>
  appendProjectLog(input: AppendProjectLogInput, signal?: AbortSignal): Promise<void>
}
