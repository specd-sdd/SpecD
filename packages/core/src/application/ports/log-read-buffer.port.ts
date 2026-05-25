import type { LogEntry } from './logger.port.js'

/** Port for reading recent in-memory log entries (no filesystem I/O). */
export interface LogReadBuffer {
  /**
   * Returns up to `limit` most recent entries (newest first).
   *
   * @param limit - Maximum entries to return
   * @returns Recent log entries
   */
  readLast(limit: number): readonly LogEntry[]
}
