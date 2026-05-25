/** Severity aligned with `default:_global/logging`. */
export type ProjectLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** Who produced the entry. */
export type ProjectLogSource = 'specd' | 'studio'

/** One ring-buffer log row exposed on `GET /v1/logs`. */
export interface ProjectLogEntry {
  readonly id: number
  readonly at: string
  readonly level: ProjectLogLevel
  readonly source: ProjectLogSource
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

const LEVEL_RANK: Record<ProjectLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const DEFAULT_MAX = 500

function normalizeLevel(level: string): ProjectLogLevel | null {
  const normalized = level === 'log' ? 'info' : level
  if (
    normalized === 'trace' ||
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error' ||
    normalized === 'fatal'
  ) {
    return normalized
  }
  return null
}

/**
 * In-process FIFO ring buffer for Studio + future kernel log streaming.
 */
export class ProjectLogBuffer {
  private readonly _max: number
  private _entries: ProjectLogEntry[] = []
  private _nextId = 1

  constructor(maxEntries = DEFAULT_MAX) {
    this._max = maxEntries
  }

  append(input: {
    level: string
    message: string
    source?: string
    context?: Record<string, unknown>
  }): ProjectLogEntry {
    const level = normalizeLevel(input.level)
    if (level === null) {
      throw new Error(`invalid log level: ${input.level}`)
    }
    const source: ProjectLogSource = input.source === 'specd' ? 'specd' : 'studio'
    const entry: ProjectLogEntry = {
      id: this._nextId++,
      at: new Date().toISOString(),
      level,
      source,
      message: input.message,
      ...(input.context !== undefined && Object.keys(input.context).length > 0
        ? { context: input.context }
        : {}),
    }
    this._entries.push(entry)
    if (this._entries.length > this._max) {
      this._entries = this._entries.slice(-this._max)
    }
    return entry
  }

  list(options: {
    limit?: number
    levels?: readonly string[]
    sources?: readonly ProjectLogSource[]
    minLevel?: string
  } = {}): readonly ProjectLogEntry[] {
    const limit = Math.min(options.limit ?? DEFAULT_MAX, this._max)
    let rows = this._entries

    if (options.sources !== undefined && options.sources.length > 0) {
      const allowed = new Set(options.sources)
      rows = rows.filter((row) => allowed.has(row.source))
    }

    if (options.levels !== undefined && options.levels.length > 0) {
      const allowed = new Set<ProjectLogLevel>()
      for (const raw of options.levels) {
        const level = normalizeLevel(raw)
        if (level !== null) allowed.add(level)
      }
      rows = rows.filter((row) => allowed.has(row.level))
    }

    const minLevel = options.minLevel !== undefined ? normalizeLevel(options.minLevel) : null
    if (minLevel !== null) {
      const minRank = LEVEL_RANK[minLevel]
      rows = rows.filter((row) => LEVEL_RANK[row.level] >= minRank)
    }

    return rows.slice(-limit)
  }

  clear(): void {
    this._entries = []
  }
}
