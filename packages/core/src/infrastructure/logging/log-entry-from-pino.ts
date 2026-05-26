import type { LogEntry } from '../../application/ports/logger.port.js'

/**
 * Parses a single JSON log line emitted by Pino into a {@link LogEntry}.
 *
 * @param line - Raw JSON line from pino
 * @returns Parsed log entry
 */
export function logEntryFromPinoLine(line: string): LogEntry {
  const parsed = JSON.parse(line) as Record<string, unknown>
  return logEntryFromPinoRecord(parsed)
}

/**
 * Maps a Pino JSON log object into the domain {@link LogEntry} shape.
 *
 * @param record - Pino JSON log object
 * @returns Normalized log entry
 */
export function logEntryFromPinoRecord(record: Record<string, unknown>): LogEntry {
  return {
    timestamp: parseTimestamp(record.time),
    level: parseLevel(record.level),
    message: typeof record.msg === 'string' ? record.msg : '',
    context: record,
    ...(record.err !== undefined ? { error: new Error(JSON.stringify(record.err)) } : {}),
  }
}

/**
 * Coerces Pino `time` fields into a `Date`.
 *
 * @param value - Numeric epoch millis or ISO string from Pino
 * @returns Parsed timestamp, or epoch when unknown
 */
function parseTimestamp(value: unknown): Date {
  if (typeof value === 'number') {
    return new Date(value)
  }
  if (typeof value === 'string') {
    return new Date(Date.parse(value))
  }
  return new Date(0)
}

/**
 * Coerces Pino numeric or string levels into domain log levels.
 *
 * @param value - Pino level field
 * @returns Domain log level, defaulting to `info`
 */
function parseLevel(value: unknown): LogEntry['level'] {
  if (typeof value === 'string') {
    return value as LogEntry['level']
  }
  if (typeof value === 'number') {
    if (value <= 10) {
      return 'trace'
    }
    if (value <= 20) {
      return 'debug'
    }
    if (value <= 30) {
      return 'info'
    }
    if (value <= 40) {
      return 'warn'
    }
    if (value <= 50) {
      return 'error'
    }
    return 'fatal'
  }
  return 'info'
}
