import type { LogReadDto } from './dto/log-read.js'
import type { StudioOutputEntryDto, StudioOutputLevel } from './dto/studio-output.js'

export interface AppendProjectLogInput {
  readonly level?: 'debug' | 'info' | 'warn' | 'error'
  readonly message: string
  readonly context?: Record<string, unknown>
}

export interface AppendStudioOutputInput {
  readonly level?: StudioOutputLevel
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

/** Studio bottom panel: output stream and specd log readback. */
export interface PortStudioPanel {
  listStudioOutput(limit?: number, signal?: AbortSignal): Promise<readonly StudioOutputEntryDto[]>
  appendStudioOutput(input: AppendStudioOutputInput, signal?: AbortSignal): Promise<StudioOutputEntryDto>
  readProjectLogs(
    options?: { readonly limit?: number; readonly prettier?: boolean },
    signal?: AbortSignal,
  ): Promise<LogReadDto>
  appendProjectLog(input: AppendProjectLogInput, signal?: AbortSignal): Promise<void>
}
