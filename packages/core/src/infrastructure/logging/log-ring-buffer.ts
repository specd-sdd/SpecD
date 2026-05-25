import type { LogEntry } from '../../application/ports/logger.port.js'

/** In-memory ring buffer for structured log entries (newest retained). */
export class LogRingBuffer {
  private readonly entries: LogEntry[] = []

  /**
   * Creates a ring buffer with a fixed maximum size.
   *
   * @param maxSize - Maximum entries to retain
   * @throws {Error} When `maxSize` is less than 1
   */
  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('LogRingBuffer maxSize must be at least 1')
    }
  }

  /**
   * Appends an entry, evicting oldest when over capacity.
   *
   * @param entry - Log entry to store
   */
  push(entry: LogEntry): void {
    this.entries.push(entry)
    if (this.entries.length > this.maxSize) {
      this.entries.shift()
    }
  }

  /**
   * Returns up to `limit` most recent entries (newest first).
   *
   * @param limit - Maximum entries to return
   * @returns Recent entries, newest first
   */
  readLast(limit: number): readonly LogEntry[] {
    const n = Math.min(Math.max(1, limit), this.entries.length)
    if (n === 0) {
      return []
    }
    return this.entries.slice(-n).reverse()
  }
}
