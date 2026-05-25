import type { ProjectLogEntry, ProjectLogLevel, ProjectLogSource } from '../../../infrastructure/project-log-buffer.js'

/** `POST /v1/logs` body. */
export interface AppendProjectLogDto {
  readonly level: ProjectLogLevel | 'log'
  readonly message: string
  readonly source?: ProjectLogSource
  readonly context?: Record<string, unknown>
}

/** `GET /v1/logs` response. */
export interface ProjectLogListDto {
  readonly entries: readonly ProjectLogEntryDto[]
  readonly total: number
}

/** Wire shape for one log row. */
export interface ProjectLogEntryDto {
  readonly id: number
  readonly at: string
  readonly level: ProjectLogLevel
  readonly source: ProjectLogSource
  readonly message: string
  readonly context?: Record<string, unknown>
}

/** Maps buffer entry to API DTO. */
export function toProjectLogEntryDto(entry: ProjectLogEntry): ProjectLogEntryDto {
  return {
    id: entry.id,
    at: entry.at,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    ...(entry.context !== undefined ? { context: entry.context } : {}),
  }
}
