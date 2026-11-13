/** Default maximum byte length retained by an OutputTail instance (16 KiB). */
export const OUTPUT_TAIL_MAX_BYTES = 16384

/**
 * Bounded ring-style byte buffer that captures the most recent standard output or error stream
 * and renders it as UTF-8 text with invalid sequences safely replaced.
 */
export class OutputTail {
  private buffer: Buffer | null = Buffer.alloc(0)
  private readonly maxBytes: number

  /**
   * Creates an OutputTail with a maximum retained byte length.
   *
   * @param maxBytes - Maximum number of tail bytes to preserve (defaults to 16 KiB).
   */
  constructor(maxBytes = OUTPUT_TAIL_MAX_BYTES) {
    this.maxBytes = maxBytes
  }

  /**
   * Appends incoming data, retaining only the last maxBytes bytes.
   *
   * @param chunk - Data chunk from a stream.
   */
  push(chunk: Buffer | Uint8Array | string): void {
    if (this.buffer === null) {
      return
    }
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.from(chunk)
    const combined = Buffer.concat([this.buffer, buf])
    if (combined.length > this.maxBytes) {
      this.buffer = Buffer.from(combined.subarray(combined.length - this.maxBytes))
    } else {
      this.buffer = combined
    }
  }

  /**
   * Decodes the retained tail bytes using UTF-8 with non-fatal replacement of invalid sequences.
   *
   * @returns The decoded tail string.
   */
  toString(): string {
    if (this.buffer === null || this.buffer.length === 0) {
      return ''
    }
    const decoder = new TextDecoder('utf-8', { fatal: false })
    return decoder.decode(this.buffer)
  }

  /**
   * Drops the internal buffer to release memory immediately.
   */
  dispose(): void {
    this.buffer = null
  }
}
