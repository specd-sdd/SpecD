import type { LogEntry } from './logger.port.js'

/** Formats structured log entries as human-readable lines. */
export interface LogFormatter {
  /**
   * Renders one log entry as a single display line (no trailing newline).
   *
   * @param entry - Structured log event
   * @returns Pretty or plain text line for UI or console
   */
  format(entry: LogEntry): string
}
