import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type ArchiveListEntry } from '../../domain/archived-change-index-entry.js'
import { type ActorIdentity } from '../../domain/entities/change.js'
import { type ListOptions, type ListResult } from '../../application/ports/repository.js'
import { changeDirName } from './dir-name.js'
import { isEnoent } from './is-enoent.js'
import { normalizeRelativePath } from './path-confinement.js'
import { paginateList } from './list-pagination.js'
import { FsIndexCache, type IndexWireLine } from './fs-index-cache-base.js'
import { type ChangeManifest, changeManifestSchema } from './manifest.js'

/** Internal index row: public list fields plus helper-only archive-relative path. */
export type ArchiveIndexEntry = ArchiveListEntry & { readonly path: string }

/** Configuration for one {@link FsArchiveIndexCache} instance. */
export interface FsArchiveIndexCacheOptions {
  /** Absolute path to the fs-cache bucket directory (index + meta files live here). */
  readonly bucketDir: string
  /** Absolute path to the on-disk archive root scanned for rebuilds. */
  readonly archivePath: string
  /** Optional hook invoked after a full rebuild (e.g. legacy root index cleanup). */
  readonly onRebuilt?: () => Promise<void>
}

/**
 * Filesystem-backed list-index cache for archived changes.
 *
 * Wraps {@link FsIndexCache}, storing {@link ArchiveIndexEntry} rows with a
 * helper-only `path` field for `get()` resolution. The full projected entry
 * (including optional `archivedBy`) is always stored — include-flag projection
 * happens at the repository layer.
 */
export class FsArchiveIndexCache {
  private readonly _cache: FsIndexCache<ArchiveIndexEntry>
  private readonly _archivePath: string

  /**
   * Creates a new `FsArchiveIndexCache` instance.
   *
   * @param options - Bucket directory, archive root, and optional rebuild hook
   */
  constructor(options: FsArchiveIndexCacheOptions) {
    this._archivePath = options.archivePath
    this._cache = new FsIndexCache<ArchiveIndexEntry>({
      bucketDir: options.bucketDir,
      entryId: (entry) => entry.name,
      compare: (a, b) =>
        b.archivedAt.getTime() - a.archivedAt.getTime() || a.name.localeCompare(b.name),
      cursor: (entry) => ({ key: entry.archivedAt.toISOString(), id: entry.name }),
      serializeEntry: (entry) => serializeArchiveEntry(entry),
      deserializeEntry: (raw) => deserializeArchiveEntry(raw),
      rebuild: () => rebuildFromDisk(this._archivePath),
      currentStamps: () => currentStampsFromDisk(this._archivePath),
      ...(options.onRebuilt !== undefined ? { onRebuilt: options.onRebuilt } : {}),
    })
  }

  /**
   * Lists entries in canonical order (`archivedAt` descending), deduplicating
   * by name so the last stored row wins.
   *
   * @param options - Pagination options
   * @returns Paginated list result with the full stored payload per entry
   */
  async list(options?: ListOptions): Promise<ListResult<ArchiveIndexEntry>> {
    const deduped = await this._dedupedEntries()
    return paginateList(deduped, options, (entry) => ({
      key: entry.archivedAt.toISOString(),
      id: entry.name,
    }))
  }

  /**
   * Returns the deduplicated entry count, applying freshness checks first.
   *
   * @returns Total archived change count
   */
  async count(): Promise<number> {
    const deduped = await this._dedupedEntries()
    return deduped.length
  }

  /**
   * Forces a full rebuild of the archive index from disk.
   *
   * @returns A promise that resolves when the rebuild completes
   */
  async reindex(): Promise<void> {
    return this._cache.reindex()
  }

  /**
   * Marks the archive index invalidated so the next `list()`/`count()` rebuilds it.
   *
   * @returns A promise that resolves when invalidation has been persisted
   */
  async invalidate(): Promise<void> {
    return this._cache.invalidate()
  }

  /**
   * Inserts or replaces one archived change's row.
   *
   * @param entry - The full projected entry (including helper `path`)
   * @param sourceMtime - ISO mtime of the archived `manifest.json` at write time
   */
  async upsert(entry: ArchiveIndexEntry, sourceMtime: string): Promise<void> {
    await this._cache.upsert(entry, { sourceMtime })
  }

  /**
   * Returns the last stored index row for `name`, or `null` if absent.
   *
   * Scans the JSONL in store order so duplicate rows resolve to the last append.
   *
   * @param name - The change slug name to look up
   * @returns The matching index row, or `null`
   */
  async findByName(name: string): Promise<ArchiveIndexEntry | null> {
    const inOrder = await this._cache.entriesInStoreOrder()
    let found: ArchiveIndexEntry | null = null
    for (const entry of inOrder) {
      if (entry.name === name) found = entry
    }
    return found
  }

  /**
   * Deduplicates by change name (last store-order row wins), then sorts canonically.
   *
   * @returns Deduped entries in `archivedAt` descending order
   */
  private async _dedupedEntries(): Promise<ArchiveIndexEntry[]> {
    const inOrder = await this._cache.entriesInStoreOrder()
    const map = new Map<string, ArchiveIndexEntry>()
    for (const entry of inOrder) {
      map.set(entry.name, entry)
    }
    return [...map.values()].sort(
      (a, b) => b.archivedAt.getTime() - a.archivedAt.getTime() || a.name.localeCompare(b.name),
    )
  }
}

// ---- Serialization ----

/**
 * Serializes an archive index entry into a JSON-safe value.
 *
 * @param entry - The entry to serialize
 * @returns A JSON-safe representation
 */
function serializeArchiveEntry(entry: ArchiveIndexEntry): unknown {
  return {
    name: entry.name,
    archivedName: entry.archivedName,
    archivedAt: entry.archivedAt.toISOString(),
    ...(entry.archivedBy !== undefined ? { archivedBy: entry.archivedBy } : {}),
    specIds: [...entry.specIds],
    schemaName: entry.schemaName,
    schemaVersion: entry.schemaVersion,
    path: entry.path,
  }
}

/**
 * Reconstructs an archive index entry from its JSON-safe persisted form.
 *
 * @param raw - The persisted value
 * @returns The reconstructed entry
 */
function deserializeArchiveEntry(raw: unknown): ArchiveIndexEntry {
  const r = raw as Record<string, unknown>
  return {
    name: r.name as string,
    archivedName: r.archivedName as string,
    archivedAt: new Date(r.archivedAt as string),
    ...(r.archivedBy !== undefined ? { archivedBy: r.archivedBy as ActorIdentity } : {}),
    specIds: (r.specIds as string[] | undefined) ?? [],
    schemaName: r.schemaName as string,
    schemaVersion: r.schemaVersion as number,
    path: r.path as string,
  }
}

// ---- Disk scanning ----

/**
 * Recursively scans the archive tree for manifests with `archivedAt`, yielding
 * one wire line per archived change directory.
 *
 * @param archivePath - Absolute path to the archive root
 * @yields One wire line per archived manifest
 */
async function* rebuildFromDisk(
  archivePath: string,
): AsyncGenerator<IndexWireLine<ArchiveIndexEntry>> {
  const collected: Array<{
    archivedAt: Date
    manifest: ChangeManifest
    relPath: string
    mtimeIso: string
  }> = []
  await collectArchivedManifests(archivePath, archivePath, collected)
  collected.sort((a, b) => a.archivedAt.getTime() - b.archivedAt.getTime())

  for (const item of collected) {
    yield {
      entry: projectManifest(item.manifest, item.relPath),
      sourceMtime: item.mtimeIso,
    }
  }
}

/**
 * Cheaply scans the archive tree for current `manifest.json` mtimes keyed by change name.
 *
 * @param archivePath - Absolute path to the archive root
 * @returns A map of change name to ISO mtime
 */
async function currentStampsFromDisk(archivePath: string): Promise<ReadonlyMap<string, string>> {
  const stamps = new Map<string, string>()
  const collected: Array<{ name: string; mtimeIso: string }> = []
  await collectManifestStamps(archivePath, archivePath, collected)
  for (const { name, mtimeIso } of collected) {
    stamps.set(name, mtimeIso)
  }
  return stamps
}

/**
 * Projects a parsed archive manifest into a full index row.
 *
 * @param manifest - The parsed manifest
 * @param relPath - Forward-slash-separated path relative to the archive root
 * @returns Index row including helper `path`
 */
function projectManifest(manifest: ChangeManifest, relPath: string): ArchiveIndexEntry {
  const createdAt = new Date(manifest.createdAt)
  return {
    name: manifest.name,
    archivedName: changeDirName(manifest.name, createdAt),
    archivedAt: new Date(manifest.archivedAt ?? manifest.createdAt),
    ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
    specIds: [...manifest.specIds],
    schemaName: manifest.schema.name,
    schemaVersion: manifest.schema.version,
    path: normalizeRelativePath(relPath),
  }
}

/**
 * Recursively collects archived manifests under `dir`.
 *
 * @param dir - Current directory being walked
 * @param root - Archive root (for relative paths)
 * @param results - Accumulator for discovered entries
 */
async function collectArchivedManifests(
  dir: string,
  root: string,
  results: Array<{ archivedAt: Date; manifest: ChangeManifest; relPath: string; mtimeIso: string }>,
): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if (isEnoent(err)) return
    throw err
  }

  const statResults = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry)
      try {
        const stat = await fs.stat(fullPath)
        return { entry, fullPath, isDir: stat.isDirectory() }
      } catch {
        return { entry, fullPath, isDir: false }
      }
    }),
  )

  for (const { fullPath, isDir } of statResults) {
    if (!isDir) continue

    const manifestPath = path.join(fullPath, 'manifest.json')
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(manifestPath, 'utf8'),
        fs.stat(manifestPath),
      ])
      const parsed = changeManifestSchema.safeParse(JSON.parse(content))
      if (!parsed.success) continue
      const manifest = parsed.data as ChangeManifest
      if (manifest.archivedAt !== undefined) {
        const relPath = path.relative(root, fullPath).split(path.sep).join('/')
        results.push({
          archivedAt: new Date(manifest.archivedAt),
          manifest,
          relPath,
          mtimeIso: stat.mtime.toISOString(),
        })
        continue
      }
    } catch (err) {
      if (!(err instanceof SyntaxError || isEnoent(err))) throw err
    }

    await collectArchivedManifests(fullPath, root, results)
  }
}

/**
 * Recursively collects manifest mtimes for archived changes keyed by manifest name.
 *
 * @param dir - Current directory being walked
 * @param root - Archive root
 * @param results - Accumulator for name/mtime pairs
 */
async function collectManifestStamps(
  dir: string,
  root: string,
  results: Array<{ name: string; mtimeIso: string }>,
): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if (isEnoent(err)) return
    throw err
  }

  const statResults = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry)
      try {
        const stat = await fs.stat(fullPath)
        return { fullPath, isDir: stat.isDirectory() }
      } catch {
        return { fullPath, isDir: false }
      }
    }),
  )

  for (const { fullPath, isDir } of statResults) {
    if (!isDir) continue

    const manifestPath = path.join(fullPath, 'manifest.json')
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(manifestPath, 'utf8'),
        fs.stat(manifestPath),
      ])
      const parsed = changeManifestSchema.safeParse(JSON.parse(content))
      if (!parsed.success) {
        await collectManifestStamps(fullPath, root, results)
        continue
      }
      const manifest = parsed.data as ChangeManifest
      if (manifest.archivedAt !== undefined) {
        results.push({ name: manifest.name, mtimeIso: stat.mtime.toISOString() })
        continue
      }
    } catch (err) {
      if (!(err instanceof SyntaxError || isEnoent(err))) throw err
    }

    await collectManifestStamps(fullPath, root, results)
  }
}
