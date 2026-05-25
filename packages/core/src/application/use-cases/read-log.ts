import type { LogLevel } from '../ports/logger.port.js'
import type { LogReadBuffer } from '../ports/log-read-buffer.port.js'

/** Input for {@link ReadLog}. */
export interface ReadLogInput {
  /** Maximum entries to return (default 500). */
  readonly limit?: number
  /** When true, returns human-readable lines instead of structured entries. */
  readonly prettier?: boolean
}

/** One log entry in API-friendly shape. */
export interface ReadLogEntryDto {
  readonly timestamp: string
  readonly level: LogLevel
  readonly message: string
  readonly context: Record<string, unknown>
}

/** Result of {@link ReadLog}. */
export interface ReadLogResult {
  readonly entries?: readonly ReadLogEntryDto[]
  readonly lines?: readonly string[]
}

/**
 * Formats one entry as a single log line.
 *
 * @param entry - Structured log entry
 * @returns Human-readable line
 */
function formatPrettyLine(entry: ReadLogEntryDto): string {
  const ctx = Object.keys(entry.context).length > 0 ? ` ${JSON.stringify(entry.context)}` : ''
  return `${entry.timestamp} ${entry.level} ${entry.message}${ctx}`
}

/**
 * Reads recent in-memory log entries from a {@link LogReadBuffer}.
 * Does not read log files from disk.
 */
export class ReadLog {
  /**
   * Creates the use case with an in-memory log buffer.
   *
   * @param buffer - Ring or buffer exposing recent entries
   */
  constructor(private readonly buffer: LogReadBuffer) {}

  /**
   * Returns recent log entries or pretty-printed lines.
   *
   * @param input - Limit and output shape
   * @returns Structured entries or formatted lines
   */
  execute(input: ReadLogInput = {}): ReadLogResult {
    const limit = input.limit ?? 500
    const raw = this.buffer.readLast(limit)
    const entries: ReadLogEntryDto[] = raw.map((e) => ({
      timestamp: e.timestamp.toISOString(),
      level: e.level,
      message: e.message,
      context: { ...e.context },
    }))
    if (input.prettier) {
      return { lines: entries.map(formatPrettyLine) }
    }
    return { entries }
  }
}
