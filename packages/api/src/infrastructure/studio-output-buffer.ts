/** Severity for studio output lines (Problems tab filters warn/error). */
export type StudioOutputLevel = 'debug' | 'info' | 'warn' | 'error'

/** One studio output line. */
export interface StudioOutputEntry {
  readonly id: string
  readonly timestamp: string
  readonly level: StudioOutputLevel
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

let nextId = 0

function newId(): string {
  nextId += 1
  return `out-${nextId}`
}

/** In-memory buffer for Studio Output tab (separate from specd Logger). */
export class StudioOutputBuffer {
  private readonly entries: StudioOutputEntry[] = []

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('StudioOutputBuffer maxSize must be at least 1')
    }
  }

  append(input: {
    readonly level: StudioOutputLevel
    readonly message: string
    readonly action?: string
    readonly context?: Record<string, unknown>
  }): StudioOutputEntry {
    const entry: StudioOutputEntry = {
      id: newId(),
      timestamp: new Date().toISOString(),
      level: input.level,
      message: input.message,
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxSize) {
      this.entries.shift()
    }
    return entry
  }

  list(limit: number): readonly StudioOutputEntry[] {
    const n = Math.min(Math.max(1, limit), this.entries.length)
    if (n === 0) {
      return []
    }
    return this.entries.slice(-n).reverse()
  }
}
