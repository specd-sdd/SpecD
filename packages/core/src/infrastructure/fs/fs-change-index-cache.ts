import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isEnoent } from './is-enoent.js'
import {
  changeManifestSchema,
  type ChangeManifest,
  type RawChangeEvent,
  type RawDraftedEvent,
} from './manifest.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import {
  type ChangeListEntryBase,
  type DraftedChangeListEntry,
  type DiscardedChangeListEntry,
} from '../../domain/change-list-entry.js'
import { type ActorIdentity } from '../../domain/entities/change.js'
import {
  type ListCursor,
  type ListOptions,
  type ListResult,
} from '../../application/ports/repository.js'
import { FsIndexCache, type IndexWireLine } from './fs-index-cache-base.js'

/** Directory naming convention shared by `changes/`, `drafts/`, and `discarded/`. */
const DIR_NAME_PATTERN = /^\d{8}-\d{6}-(.+)$/

/** Which change-lifecycle bucket a {@link FsChangeIndexCache} instance indexes. */
export type ChangeBucketKind = 'active' | 'drafted' | 'discarded'

/** Configuration for one {@link FsChangeIndexCache} bucket instance. */
export interface FsChangeIndexCacheOptions {
  /** Absolute path to the fs-cache bucket directory (index + meta files live here). */
  readonly bucketDir: string
  /** Absolute path to the on-disk source directory (`changes/`, `drafts/`, or `discarded/`). */
  readonly sourceDir: string
  /** Which lifecycle bucket this instance projects manifests for. */
  readonly kind: ChangeBucketKind
}

/**
 * Filesystem-backed list-index cache for one change lifecycle bucket
 * (`changes/`, `drafts/`, or `discarded/`).
 *
 * Wraps {@link FsIndexCache}, supplying manifest-based rebuild and freshness
 * scanning so `FsChangeRepository` never reads `.specd-index.jsonl` directly.
 * The full projected entry (all optional fields populated when available) is
 * always stored — include-flag projection happens at the repository layer
 * from the cached payload, never triggering extra I/O.
 */
export class FsChangeIndexCache<TEntry extends ChangeListEntryBase> {
  private readonly _cache: FsIndexCache<TEntry>

  /**
   * Creates a new `FsChangeIndexCache` instance for one bucket.
   *
   * @param options - Bucket directory, source directory, and lifecycle kind
   */
  constructor(options: FsChangeIndexCacheOptions) {
    const { bucketDir, sourceDir, kind } = options
    this._cache = new FsIndexCache<TEntry>({
      bucketDir,
      entryId: (entry) => entry.name,
      compare: (a, b) => compareForKind(kind, a, b),
      cursor: (entry) => cursorForKind(kind, entry),
      serializeEntry: (entry) => serializeChangeEntry(entry),
      deserializeEntry: (raw) => deserializeChangeEntry(raw) as TEntry,
      rebuild: () => rebuildFromDisk(sourceDir, kind) as AsyncIterable<IndexWireLine<TEntry>>,
      currentStamps: () => currentStampsFromDisk(sourceDir),
    })
  }

  /**
   * Lists entries in canonical bucket order, applying freshness checks first.
   *
   * @param options - Pagination options
   * @returns Paginated list result with the full stored payload per entry
   */
  async list(options?: ListOptions): Promise<ListResult<TEntry>> {
    return this._cache.list(options)
  }

  /**
   * Returns the total entry count for this bucket, applying freshness checks first.
   *
   * @returns The total indexed entry count
   */
  async count(): Promise<number> {
    return this._cache.count()
  }

  /**
   * Forces a full rebuild of this bucket from disk.
   *
   * @returns A promise that resolves when the rebuild completes
   */
  async reindex(): Promise<void> {
    return this._cache.reindex()
  }

  /**
   * Marks this bucket invalidated so the next `list()`/`count()` rebuilds it.
   *
   * @returns A promise that resolves when invalidation has been persisted
   */
  async invalidate(): Promise<void> {
    return this._cache.invalidate()
  }

  /**
   * Inserts or replaces one change's row.
   *
   * @param entry - The full projected entry to persist
   * @param sourceMtime - ISO mtime of the change's `manifest.json` at write time
   */
  async upsert(entry: TEntry, sourceMtime: string): Promise<void> {
    await this._cache.upsert(entry, { sourceMtime })
  }

  /**
   * Removes one change's row by name.
   *
   * @param name - The change name to remove
   */
  async remove(name: string): Promise<void> {
    await this._cache.remove(name)
  }
}

// ---- Sort / cursor ----

/**
 * Compares two entries per the canonical sort order for `kind`.
 *
 * @param kind - The lifecycle bucket kind
 * @param a - First entry
 * @param b - Second entry
 * @returns Standard comparator result
 */
function compareForKind(
  kind: ChangeBucketKind,
  a: ChangeListEntryBase,
  b: ChangeListEntryBase,
): number {
  if (kind === 'active') {
    return a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name)
  }
  if (kind === 'drafted') {
    const aAt = (a as DraftedChangeListEntry).draftedAt.getTime()
    const bAt = (b as DraftedChangeListEntry).draftedAt.getTime()
    return bAt - aAt || a.name.localeCompare(b.name)
  }
  const aAt = (a as DiscardedChangeListEntry).discardedAt.getTime()
  const bAt = (b as DiscardedChangeListEntry).discardedAt.getTime()
  return bAt - aAt || a.name.localeCompare(b.name)
}

/**
 * Builds the keyset cursor for one entry per the canonical sort order for `kind`.
 *
 * @param kind - The lifecycle bucket kind
 * @param entry - The entry to build a cursor for
 * @returns The keyset cursor
 */
function cursorForKind(kind: ChangeBucketKind, entry: ChangeListEntryBase): ListCursor {
  if (kind === 'active') return { key: entry.createdAt.toISOString(), id: entry.name }
  if (kind === 'drafted') {
    return { key: (entry as DraftedChangeListEntry).draftedAt.toISOString(), id: entry.name }
  }
  return { key: (entry as DiscardedChangeListEntry).discardedAt.toISOString(), id: entry.name }
}

// ---- Serialization ----

/**
 * Serializes a change list entry into a JSON-safe value, converting `Date`
 * fields to ISO strings.
 *
 * @param entry - The entry to serialize
 * @returns A JSON-safe representation
 */
function serializeChangeEntry(entry: ChangeListEntryBase): unknown {
  const base: Record<string, unknown> = {
    name: entry.name,
    createdAt: entry.createdAt.toISOString(),
    state: entry.state,
    specIds: entry.specIds,
    schemaName: entry.schemaName,
    schemaVersion: entry.schemaVersion,
  }
  if (entry.description !== undefined) base.description = entry.description

  const drafted = entry as Partial<DraftedChangeListEntry>
  if (drafted.draftedAt !== undefined) {
    base.draftedAt = drafted.draftedAt.toISOString()
    base.draftedBy = drafted.draftedBy
    if (drafted.reason !== undefined) base.reason = drafted.reason
  }

  const discarded = entry as Partial<DiscardedChangeListEntry>
  if (discarded.discardedAt !== undefined) {
    base.discardedAt = discarded.discardedAt.toISOString()
    base.discardedBy = discarded.discardedBy
    if (discarded.reason !== undefined) base.reason = discarded.reason
    if (discarded.supersededBy !== undefined) base.supersededBy = discarded.supersededBy
  }

  return base
}

/**
 * Reconstructs a change list entry from its JSON-safe persisted form.
 *
 * @param raw - The persisted value
 * @returns The reconstructed entry (concrete shape depends on which fields are present)
 */
function deserializeChangeEntry(raw: unknown): ChangeListEntryBase {
  const r = raw as Record<string, unknown>
  const base: ChangeListEntryBase = {
    name: r.name as string,
    createdAt: new Date(r.createdAt as string),
    state: r.state as string,
    specIds: (r.specIds as string[] | undefined) ?? [],
    schemaName: r.schemaName as string,
    schemaVersion: r.schemaVersion as number,
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
  }

  if (r.draftedAt !== undefined) {
    const drafted: DraftedChangeListEntry = {
      ...base,
      draftedAt: new Date(r.draftedAt as string),
      draftedBy: r.draftedBy as ActorIdentity,
      ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
    }
    return drafted
  }

  if (r.discardedAt !== undefined) {
    const discarded: DiscardedChangeListEntry = {
      ...base,
      discardedAt: new Date(r.discardedAt as string),
      discardedBy: r.discardedBy as ActorIdentity,
      ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
      ...(typeof r.supersededBy === 'string' ? { supersededBy: r.supersededBy } : {}),
    }
    return discarded
  }

  return base
}

// ---- Disk scanning ----

/**
 * Recursively scans `sourceDir` for change directories and yields a wire
 * line per manifest that can be projected for `kind`.
 *
 * @param sourceDir - Absolute path to `changes/`, `drafts/`, or `discarded/`
 * @param kind - The lifecycle bucket kind
 * @yields One wire line per projectable manifest
 */
async function* rebuildFromDisk(
  sourceDir: string,
  kind: ChangeBucketKind,
): AsyncGenerator<IndexWireLine<ChangeListEntryBase>> {
  let entries: string[]
  try {
    entries = await fs.readdir(sourceDir)
  } catch (err) {
    if (isEnoent(err)) return
    throw err
  }

  for (const dirName of entries) {
    const match = DIR_NAME_PATTERN.exec(dirName)
    if (match === null) continue

    const dir = path.join(sourceDir, dirName)
    const manifestPath = path.join(dir, 'manifest.json')
    let manifest: ChangeManifest
    let mtimeIso: string
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(manifestPath, 'utf8'),
        fs.stat(manifestPath),
      ])
      manifest = parseManifest(content, dir)
      mtimeIso = stat.mtime.toISOString()
    } catch (err) {
      if (isEnoent(err)) continue
      throw err
    }

    const entry = projectManifest(manifest, kind)
    if (entry === null) continue
    yield { entry, sourceMtime: mtimeIso }
  }
}

/**
 * Cheaply scans `sourceDir` for current `manifest.json` mtimes, keyed by
 * change name, without parsing manifest content.
 *
 * @param sourceDir - Absolute path to `changes/`, `drafts/`, or `discarded/`
 * @returns A map of change name to ISO mtime
 */
async function currentStampsFromDisk(sourceDir: string): Promise<ReadonlyMap<string, string>> {
  const stamps = new Map<string, string>()
  let entries: string[]
  try {
    entries = await fs.readdir(sourceDir)
  } catch (err) {
    if (isEnoent(err)) return stamps
    throw err
  }

  await Promise.all(
    entries.map(async (dirName) => {
      const match = DIR_NAME_PATTERN.exec(dirName)
      if (match === null) return
      const name = match[1]!
      try {
        const stat = await fs.stat(path.join(sourceDir, dirName, 'manifest.json'))
        stamps.set(name, stat.mtime.toISOString())
      } catch (err) {
        if (!isEnoent(err)) throw err
      }
    }),
  )

  return stamps
}

/**
 * Parses and validates `manifest.json` content.
 *
 * @param content - Raw file content
 * @param dir - Absolute directory path (used for error messages)
 * @returns The parsed manifest
 * @throws {CorruptedManifestError} If the content is invalid JSON or fails schema validation
 */
function parseManifest(content: string, dir: string): ChangeManifest {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw new CorruptedManifestError(`invalid JSON in manifest.json in ${dir}`)
  }
  const result = changeManifestSchema.safeParse(raw)
  if (!result.success) {
    throw new CorruptedManifestError(
      `invalid manifest.json in ${dir}: ${result.error.issues.map((i) => i.message).join(', ')}`,
    )
  }
  return result.data as ChangeManifest
}

/**
 * Derives the current `state` from the manifest's append-only history.
 *
 * @param history - Raw manifest history events
 * @returns The last `transitioned` event's `to` state, or `'drafting'` if none
 */
function deriveState(history: readonly RawChangeEvent[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const evt = history[i]
    if (evt?.type === 'transitioned') return evt.to
  }
  return 'drafting'
}

/**
 * Finds the most recent `drafted` event in the manifest's history.
 *
 * @param history - Raw manifest history events
 * @returns The last `drafted` event, or `undefined` if none
 */
function findLastDraftedEvent(history: readonly RawChangeEvent[]): RawDraftedEvent | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const evt = history[i]
    if (evt?.type === 'drafted') return evt
  }
  return undefined
}

/**
 * Projects a parsed manifest into a full change list entry for `kind`.
 *
 * @param manifest - The parsed manifest
 * @param kind - The lifecycle bucket kind
 * @returns The projected entry, or `null` when the manifest has no
 *   corresponding lifecycle event (e.g. a drafted-bucket manifest missing a
 *   `drafted` event, or a discarded-bucket manifest not ending in `discarded`)
 */
function projectManifest(
  manifest: ChangeManifest,
  kind: ChangeBucketKind,
): ChangeListEntryBase | null {
  const base: ChangeListEntryBase = {
    name: manifest.name,
    createdAt: new Date(manifest.createdAt),
    state: deriveState(manifest.history),
    specIds: [...manifest.specIds],
    schemaName: manifest.schema.name,
    schemaVersion: manifest.schema.version,
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
  }

  if (kind === 'active') return base

  if (kind === 'drafted') {
    const drafted = findLastDraftedEvent(manifest.history)
    if (drafted === undefined) return null
    const entry: DraftedChangeListEntry = {
      ...base,
      draftedAt: new Date(drafted.at),
      draftedBy: drafted.by,
      ...(drafted.reason !== undefined ? { reason: drafted.reason } : {}),
    }
    return entry
  }

  const last = manifest.history[manifest.history.length - 1]
  if (last === undefined || last.type !== 'discarded') return null
  const entry: DiscardedChangeListEntry = {
    ...base,
    discardedAt: new Date(last.at),
    discardedBy: last.by,
    reason: last.reason,
    ...(last.supersededBy !== undefined && last.supersededBy.length > 0
      ? { supersededBy: last.supersededBy[0] }
      : {}),
  }
  return entry
}
