import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'
import { paginateList } from './list-pagination.js'
import {
  type ListCursor,
  type ListOptions,
  type ListResult,
} from '../../application/ports/repository.js'

/** Fixed max-age safety net for fs-cache list indexes (5 minutes). */
export const INDEX_TTL_MS = 300_000

const INDEX_FILE = '.specd-index.jsonl'
const META_FILE = '.specd-index-meta.json'

/** Per-file mtime stamp used for spec-bucket freshness. */
export interface SourceFileStamp {
  readonly filename: string
  readonly mtime: string
}

/**
 * Freshness stamp attached to one indexed row: either a single source
 * mtime (change/archive buckets) or a set of per-file mtimes (spec buckets).
 */
export type SourceStamp = string | readonly SourceFileStamp[]

/**
 * One line of the `.specd-index.jsonl` wire format.
 *
 * `entry` is the public list-entry payload for the bucket. `sourceMtime` /
 * `sourceFiles` are helper-only freshness fields — never returned from `list()`.
 */
export interface IndexWireLine<TEntry> {
  readonly entry: TEntry
  readonly sourceMtime?: string
  readonly sourceFiles?: readonly SourceFileStamp[]
}

/** Normative `.specd-index-meta.json` shape. */
export interface IndexMeta {
  readonly totalCount: number
  readonly generatedAt: string
  readonly isInvalidated: boolean
}

/**
 * Configuration for one {@link FsIndexCache} bucket instance.
 *
 * Sort/id/serialization concerns are supplied by the caller so this class
 * stays agnostic of the concrete list-entry shape (change, draft, discarded,
 * archive, or spec rows).
 */
export interface FsIndexCacheConfig<TEntry> {
  /** Absolute path to the bucket directory (contains the jsonl + meta files). */
  readonly bucketDir: string
  /** Extracts the stable identity used for upsert/remove/dedup (e.g. change name or spec path). */
  readonly entryId: (entry: TEntry) => string
  /** Canonical sort comparator for this bucket. */
  readonly compare: (a: TEntry, b: TEntry) => number
  /** Builds the keyset cursor for one entry. */
  readonly cursor: (entry: TEntry) => ListCursor
  /** Converts an entry into a JSON-safe value for persistence (e.g. `Date` -> ISO string). */
  readonly serializeEntry: (entry: TEntry) => unknown
  /** Reconstructs an entry from its JSON-safe persisted form. */
  readonly deserializeEntry: (raw: unknown) => TEntry
  /** Performs a full disk scan, yielding fresh wire lines for a complete rebuild. */
  readonly rebuild: () => AsyncIterable<IndexWireLine<TEntry>>
  /** Performs a lightweight disk scan returning current freshness stamps keyed by `entryId`. */
  readonly currentStamps: () => Promise<ReadonlyMap<string, SourceStamp>>
  /** Optional hook invoked after any full rebuild completes (e.g. legacy orphan cleanup). */
  readonly onRebuilt?: () => Promise<void>
}

/**
 * Generic filesystem-backed list-index cache for one bucket directory.
 *
 * Owns the JSONL index, meta file, per-bucket mutation lock (`mutate`),
 * atomic temp+rename publish, and the invalidated/mtime/TTL freshness
 * sequence described in `core:storage`. Bucket-specific wrappers
 * (`FsChangeIndexCache`, `FsSpecIndexCache`) configure sort/id/serialization
 * and expose a narrower, type-safe surface to repositories.
 *
 * Concurrent mutators serialize through {@link mutate}; `list()` / `count()`
 * never take the write lock — they observe a complete prior or complete next
 * snapshot thanks to atomic temp+rename publish.
 */
export class FsIndexCache<TEntry> {
  private readonly _config: FsIndexCacheConfig<TEntry>
  private _mutexTail: Promise<void> = Promise.resolve()

  /**
   * Creates a new `FsIndexCache` instance for one bucket directory.
   *
   * @param config - Bucket directory, sort/id/serialization, and disk-scan callbacks
   */
  constructor(config: FsIndexCacheConfig<TEntry>) {
    this._config = config
  }

  /**
   * Runs `fn` as the bucket's exclusive write path.
   *
   * Concurrent callers wait for their turn rather than failing. The lock is
   * released whether `fn` resolves or rejects.
   *
   * @param fn - The mutation to run while holding exclusive access
   * @returns The result of `fn`
   */
  async mutate<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this._mutexTail
    let release: () => void = () => {}
    this._mutexTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Lists entries in canonical sort order, applying freshness checks first.
   *
   * @param options - Pagination options
   * @param filter - Optional predicate applied before pagination (e.g. spec path prefix)
   * @returns Paginated list result
   */
  async list(
    options?: ListOptions,
    filter?: (entry: TEntry) => boolean,
  ): Promise<ListResult<TEntry>> {
    const sorted = await this.sortedEntries(filter)
    return paginateList(sorted, options, this._config.cursor)
  }

  /**
   * Returns all indexed entries in canonical sort order after freshness checks.
   *
   * @param filter - Optional predicate applied before sorting
   * @returns Sorted entries (not paginated)
   */
  async sortedEntries(filter?: (entry: TEntry) => boolean): Promise<TEntry[]> {
    await this._ensureFresh()
    const lines = await this._readLines()
    let entries = lines.map((line) => line.entry)
    if (filter !== undefined) {
      entries = entries.filter(filter)
    }
    return [...entries].sort(this._config.compare)
  }

  /**
   * Returns indexed entries in JSONL store order (no sort), after freshness checks.
   *
   * Used when file-append order matters (e.g. archive name deduplication).
   *
   * @returns Entries in the order they appear in `.specd-index.jsonl`
   */
  async entriesInStoreOrder(): Promise<TEntry[]> {
    await this._ensureFresh()
    const lines = await this._readLines()
    return lines.map((line) => line.entry)
  }

  /**
   * Returns the total entry count from meta, applying freshness checks first.
   *
   * @returns The total indexed entry count
   */
  async count(): Promise<number> {
    await this._ensureFresh()
    const meta = await this._readMeta()
    return meta.totalCount
  }

  /**
   * Forces a full rebuild of this bucket via the configured `rebuild` callback.
   */
  async reindex(): Promise<void> {
    await this.mutate(async () => {
      await this._rebuildLocked()
    })
  }

  /**
   * Marks the bucket invalidated so the next `list()`/`count()` triggers a rebuild.
   */
  async invalidate(): Promise<void> {
    await this.mutate(async () => {
      const meta = await this._readMeta()
      await this._publishMetaOnly({ ...meta, isInvalidated: true })
    })
  }

  /**
   * Returns the currently stored entry for `id` without triggering a
   * freshness check or rebuild. Used by write paths to decide whether an
   * upsert is actually needed.
   *
   * @param id - The entry identity to look up
   * @returns The stored entry, or `null` if not present
   */
  async peek(id: string): Promise<TEntry | null> {
    const lines = await this._readLines()
    const found = lines.find((line) => this._config.entryId(line.entry) === id)
    return found?.entry ?? null
  }

  /**
   * Inserts or replaces one entry's row, updating `totalCount` as needed.
   *
   * @param entry - The entry to persist
   * @param wire - Freshness stamp fields for this row
   * @param wire.sourceMtime - Manifest mtime (change/archive buckets)
   * @param wire.sourceFiles - Per-file mtimes (spec buckets)
   */
  async upsert(
    entry: TEntry,
    wire: { readonly sourceMtime?: string; readonly sourceFiles?: readonly SourceFileStamp[] },
  ): Promise<void> {
    await this.mutate(async () => {
      const lines = await this._readLines()
      const id = this._config.entryId(entry)
      const idx = lines.findIndex((line) => this._config.entryId(line.entry) === id)
      const newLine: IndexWireLine<TEntry> = {
        entry,
        ...(wire.sourceMtime !== undefined ? { sourceMtime: wire.sourceMtime } : {}),
        ...(wire.sourceFiles !== undefined ? { sourceFiles: wire.sourceFiles } : {}),
      }
      const meta = await this._readMeta()
      let nextLines: IndexWireLine<TEntry>[]
      let totalCount: number
      if (idx >= 0) {
        nextLines = [...lines]
        nextLines[idx] = newLine
        totalCount = meta.totalCount
      } else {
        nextLines = [...lines, newLine]
        totalCount = meta.totalCount + 1
      }
      await this._publishBoth(nextLines, {
        totalCount,
        generatedAt: new Date().toISOString(),
        isInvalidated: false,
      })
    })
  }

  /**
   * Inserts or replaces one entry's row only when its serialized value
   * differs from what is currently stored (or absent).
   *
   * @param entry - The entry to persist
   * @param wire - Freshness stamp fields for this row
   * @param wire.sourceMtime - Manifest mtime (change/archive buckets)
   * @param wire.sourceFiles - Per-file mtimes (spec buckets)
   * @returns `true` if an upsert was performed, `false` if the row was unchanged
   */
  async upsertIfChanged(
    entry: TEntry,
    wire: { readonly sourceMtime?: string; readonly sourceFiles?: readonly SourceFileStamp[] },
  ): Promise<boolean> {
    const id = this._config.entryId(entry)
    const existing = await this.peek(id)
    if (existing !== null && this._sameSerialized(existing, entry)) {
      return false
    }
    await this.upsert(entry, wire)
    return true
  }

  /**
   * Removes one entry's row by id, updating `totalCount` as needed.
   *
   * No-ops when the id is not present.
   *
   * @param id - The entry identity to remove
   */
  async remove(id: string): Promise<void> {
    await this.mutate(async () => {
      const lines = await this._readLines()
      const filtered = lines.filter((line) => this._config.entryId(line.entry) !== id)
      if (filtered.length === lines.length) return
      const meta = await this._readMeta()
      await this._publishBoth(filtered, {
        totalCount: Math.max(0, meta.totalCount - 1),
        generatedAt: new Date().toISOString(),
        isInvalidated: false,
      })
    })
  }

  // ---- Private helpers ----

  /**
   * Compares two entries by their serialized JSON representation.
   *
   * @param a - First entry
   * @param b - Second entry
   * @returns Whether both entries serialize identically
   */
  private _sameSerialized(a: TEntry, b: TEntry): boolean {
    return (
      JSON.stringify(this._config.serializeEntry(a)) ===
      JSON.stringify(this._config.serializeEntry(b))
    )
  }

  /**
   * Applies the freshness sequence: invalidated flag -> mtime mismatch -> TTL -> serve.
   */
  private async _ensureFresh(): Promise<void> {
    const meta = await this._readMeta()
    if (meta.isInvalidated) {
      await this.reindex()
      return
    }

    if (await this._isStale(meta)) {
      await this.reindex()
      return
    }

    if (Date.now() - Date.parse(meta.generatedAt) > INDEX_TTL_MS) {
      await this.reindex()
    }
  }

  /**
   * Returns whether cached rows are stale relative to on-disk source stamps.
   *
   * @param meta - Current index metadata
   * @returns `true` when a rebuild is required before serving reads
   */
  private async _isStale(meta: IndexMeta): Promise<boolean> {
    const lines = await this._readLines()
    if (lines.length !== meta.totalCount) return true

    const current = await this._config.currentStamps()
    if (lines.length !== current.size) return true

    for (const line of lines) {
      const id = this._config.entryId(line.entry)
      const currentStamp = current.get(id)
      if (currentStamp === undefined) return true
      const storedStamp: SourceStamp | undefined =
        line.sourceFiles !== undefined ? line.sourceFiles : line.sourceMtime
      if (!stampsEqual(storedStamp, currentStamp)) return true
    }
    return false
  }

  /**
   * Rebuilds the JSONL index and meta file from disk under the bucket lock.
   */
  private async _rebuildLocked(): Promise<void> {
    const lines: IndexWireLine<TEntry>[] = []
    for await (const line of this._config.rebuild()) {
      lines.push(line)
    }
    await this._publishBoth(lines, {
      totalCount: lines.length,
      generatedAt: new Date().toISOString(),
      isInvalidated: false,
    })
    if (this._config.onRebuilt !== undefined) {
      await this._config.onRebuilt()
    }
  }

  /**
   * Reads and deserializes all rows from `.specd-index.jsonl`.
   *
   * @returns Parsed wire lines, or an empty array when the index file is absent
   */
  private async _readLines(): Promise<IndexWireLine<TEntry>[]> {
    let content: string
    try {
      content = await fs.readFile(this._indexPath(), 'utf8')
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const lines: IndexWireLine<TEntry>[] = []
    for (const raw of content.split('\n')) {
      if (raw.trim().length === 0) continue
      try {
        const parsed = JSON.parse(raw) as {
          entry: unknown
          sourceMtime?: string
          sourceFiles?: readonly SourceFileStamp[]
        }
        lines.push({
          entry: this._config.deserializeEntry(parsed.entry),
          ...(parsed.sourceMtime !== undefined ? { sourceMtime: parsed.sourceMtime } : {}),
          ...(parsed.sourceFiles !== undefined ? { sourceFiles: parsed.sourceFiles } : {}),
        })
      } catch {
        continue
      }
    }
    return lines
  }

  /**
   * Reads `.specd-index-meta.json`, falling back to an invalidated default.
   *
   * @returns Parsed index metadata
   */
  private async _readMeta(): Promise<IndexMeta> {
    try {
      const content = await fs.readFile(this._metaPath(), 'utf8')
      const parsed = JSON.parse(content) as Partial<IndexMeta>
      return {
        totalCount: typeof parsed.totalCount === 'number' ? parsed.totalCount : 0,
        generatedAt:
          typeof parsed.generatedAt === 'string' ? parsed.generatedAt : new Date(0).toISOString(),
        isInvalidated: parsed.isInvalidated !== false,
      }
    } catch {
      return { totalCount: 0, generatedAt: new Date(0).toISOString(), isInvalidated: true }
    }
  }

  /**
   * Atomically publishes both the JSONL index and meta file.
   *
   * @param lines - Wire lines to persist
   * @param meta - Metadata to persist alongside the index
   */
  private async _publishBoth(lines: IndexWireLine<TEntry>[], meta: IndexMeta): Promise<void> {
    await fs.mkdir(this._config.bucketDir, { recursive: true })
    const content =
      lines.length > 0
        ? lines
            .map((line) =>
              JSON.stringify({
                entry: this._config.serializeEntry(line.entry),
                ...(line.sourceMtime !== undefined ? { sourceMtime: line.sourceMtime } : {}),
                ...(line.sourceFiles !== undefined ? { sourceFiles: line.sourceFiles } : {}),
              }),
            )
            .join('\n') + '\n'
        : ''
    await writeFileAtomic(this._indexPath(), content)
    await writeFileAtomic(this._metaPath(), JSON.stringify(meta, null, 2) + '\n')
  }

  /**
   * Atomically publishes only the meta file, leaving the JSONL index unchanged.
   *
   * @param meta - Metadata to persist
   */
  private async _publishMetaOnly(meta: IndexMeta): Promise<void> {
    await fs.mkdir(this._config.bucketDir, { recursive: true })
    await writeFileAtomic(this._metaPath(), JSON.stringify(meta, null, 2) + '\n')
  }

  /**
   * Returns the absolute path to `.specd-index.jsonl`.
   *
   * @returns Absolute index file path
   */
  private _indexPath(): string {
    return path.join(this._config.bucketDir, INDEX_FILE)
  }

  /**
   * Returns the absolute path to `.specd-index-meta.json`.
   *
   * @returns Absolute meta file path
   */
  private _metaPath(): string {
    return path.join(this._config.bucketDir, META_FILE)
  }
}

/**
 * Compares two freshness stamps for equality.
 *
 * String stamps compare by value. Array stamps (per-file mtimes) compare
 * order-independently by filename.
 *
 * @param a - First stamp (possibly `undefined` if the row predates stamping)
 * @param b - Second stamp
 * @returns Whether the stamps are equivalent
 */
function stampsEqual(a: SourceStamp | undefined, b: SourceStamp | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (typeof a === 'string' || typeof b === 'string') return a === b
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((x, y) => x.filename.localeCompare(y.filename))
  const sortedB = [...b].sort((x, y) => x.filename.localeCompare(y.filename))
  return sortedA.every(
    (entry, i) => entry.filename === sortedB[i]?.filename && entry.mtime === sortedB[i]?.mtime,
  )
}
