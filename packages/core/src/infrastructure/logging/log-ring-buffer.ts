import type { LogEntry } from '../../application/ports/logger.port.js'

/** In-memory ring buffer for structured log entries (newest retained). */
export class LogRingBuffer {
  private readonly entries: LogEntry[] = []

  /**
   * @param maxSize - Maximum entries to retain
   */
  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('LogRingBuffer maxSize must be at least 1')
    }
  }

  /** Appends an entry, evicting oldest when over capacity. */
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
   */
  readLast(limit: number): readonly LogEntry[] {
    const n = Math.min(Math.max(1, limit), this.entries.length)
    if (n === 0) {
      return []
    }
    return this.entries.slice(-n).reverse()
  }
}
