import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ArchivedChange } from '../../domain/entities/archived-change.js'
import { type Change } from '../../domain/entities/change.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import {
  ArchiveRepository,
  type ArchiveRepositoryConfig,
} from '../../application/ports/archive-repository.js'
import { ChangeNotFoundError } from '../../application/errors/change-not-found-error.js'
import { UnsupportedPatternError } from '../../domain/errors/unsupported-pattern-error.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { changeDirName } from './dir-name.js'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'
import { type ChangeManifest, changeManifestSchema } from './manifest.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Filename of the append-only archive index at the archive root. */
const INDEX_FILE = '.specd-index.jsonl'

/** Default archive pattern when none is configured. */
const DEFAULT_PATTERN = '{{change.archivedName}}'

/**
 * Configuration for `FsArchiveRepository`.
 *
 * Extends the base `ArchiveRepositoryConfig` with filesystem paths for the
 * active changes directory, drafts directory, and archive root, plus an
 * optional layout pattern for the archive directory structure.
 */
export interface FsArchiveRepositoryConfig extends ArchiveRepositoryConfig {
  /** Absolute path to the `changes/` directory for active changes. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory for shelved changes. */
  readonly draftsPath: string
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /**
   * Optional pattern controlling the archive directory structure.
   *
   * Supported variables: `{{year}}`, `{{month}}`, `{{day}}`,
   * `{{change.name}}`, `{{change.archivedName}}`. The variable
   * `{{change.scope}}` is explicitly unsupported and will cause the
   * constructor to throw. Defaults to `{{change.archivedName}}`.
   */
  readonly pattern?: string
}

/**
 * A single line in `index.jsonl`.
 *
 * Each line records the original change name and the relative path (from the
 * archive root, forward-slash-separated) of the archived change directory.
 */
interface IndexEntry {
  /** The original change slug name. */
  name: string
  /** Forward-slash-separated path relative to the archive root. */
  path: string
  /** ISO 8601 creation timestamp. */
  createdAt?: string
  /** ISO 8601 archive timestamp. */
  archivedAt?: string | undefined
  /** Git identity of the archiving actor. */
  archivedBy?: { name: string; email: string }
  /** First workspace ID. */
  workspace?: string
  /** Artifact type IDs. */
  artifacts?: string[]
  /** Spec path strings. */
  specIds?: string[]
  /** Schema name. */
  schemaName?: string
  /** Schema version. */
  schemaVersion?: number
}

/**
 * A resolved archive entry found by the glob fallback in `get()`.
 */
interface GlobResult {
  /** Absolute path to the archived change directory. */
  dir: string
  /** Forward-slash-separated path relative to the archive root. */
  relPath: string
}

/**
 * Filesystem implementation of `ArchiveRepository`.
 *
 * Archived changes are stored as directories under the archive root using the
 * configured `pattern` (default: `{{change.archivedName}}`). Each archived
 * directory retains the original `manifest.json` from the change, augmented
 * with an `archivedAt` timestamp field.
 *
 * An `index.jsonl` file at the archive root provides O(1) appends and fast
 * reverse-scan lookups. `reindex()` rebuilds it from the directory tree for
 * recovery.
 */
export class FsArchiveRepository extends ArchiveRepository {
  private readonly _changesPath: string
  private readonly _draftsPath: string
  private readonly _archivePath: string
  private readonly _pattern: string

  /**
   * Creates a new `FsArchiveRepository` instance.
   *
   * @param config - Storage paths, archive pattern, and repository configuration
   * @throws {UnsupportedPatternError} If `config.pattern` contains the unsupported `{{change.scope}}` variable
   */
  constructor(config: FsArchiveRepositoryConfig) {
    super(config)
    if ((config.pattern ?? '').includes('{{change.scope}}')) {
      throw new UnsupportedPatternError(
        '{{change.scope}}',
        'scope paths contain "/" which produces ambiguous directory names',
      )
    }
    this._changesPath = config.changesPath
    this._draftsPath = config.draftsPath
    this._archivePath = config.archivePath
    this._pattern = config.pattern ?? DEFAULT_PATTERN
  }

  /**
   * Moves the change directory to the archive, records an `archivedAt`
   * timestamp in the manifest, and appends an entry to `index.jsonl`.
   *
   * The change must be in `archivable` state unless `options.force` is `true`.
   *
   * @param change - The change to archive
   * @param options - Archive options
   * @param options.force - When `true`, skip the state guard and archive unconditionally
   * @param options.actor - The git identity of the user performing the archive
   * @param options.actor.name - The actor's display name
   * @param options.actor.email - The actor's email address
   * @returns The created `ArchivedChange` record
   * @throws {InvalidStateTransitionError} When the change is not archivable and `force` is not set
   * @throws {Error} When the change directory cannot be found in `changes/` or `drafts/`
   */
  override async archive(
    change: Change,
    options?: { force?: boolean; actor?: { name: string; email: string } },
  ): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }> {
    if (options?.force !== true) {
      change.assertArchivable()
    }

    const archivedAt = new Date()
    const archivedName = changeDirName(change.name, change.createdAt)
    const relPath = this._expandPattern(
      change.name,
      archivedName,
      archivedAt,
      change.workspaces[0] ?? 'default',
    )
    const archiveDir = path.join(this._archivePath, ...relPath.split('/'))

    const sourceDir = await this._resolveChangeDir(change.name)
    if (sourceDir === null) {
      throw new ChangeNotFoundError(change.name)
    }

    // Move the change directory into the archive
    await fs.mkdir(path.dirname(archiveDir), { recursive: true })
    await fs.rename(sourceDir, archiveDir)

    // Augment the manifest with archivedAt and optional archivedBy
    const manifest = await this._loadManifest(archiveDir)
    const archivedManifest: ChangeManifest = {
      ...manifest,
      archivedAt: archivedAt.toISOString(),
      ...(options?.actor !== undefined ? { archivedBy: options.actor } : {}),
    }
    await this._writeManifestAtomic(archiveDir, archivedManifest)

    // Build the domain record
    const archivedChange = this._buildArchivedChange(archivedManifest, archivedName, archivedAt)

    // Append enriched index entry (O(1))
    await this._appendIndex(this._buildIndexEntry(archivedManifest, relPath))

    return { archivedChange, archiveDirPath: archiveDir }
  }

  /**
   * Lists all archived changes in chronological order (oldest first).
   *
   * Reads `index.jsonl` from the start. Deduplicates by name so that the last
   * index entry wins in case of duplicates introduced by manual recovery.
   *
   * @returns All archived changes in chronological order
   */
  override async list(): Promise<ArchivedChange[]> {
    await this._ensureIndex()
    const lines = await this._readIndexLines()
    const map = new Map<string, ArchivedChange>()

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as IndexEntry

        if (entry.createdAt !== undefined) {
          // Enriched index entry — build ArchivedChange without reading manifest
          const createdAt = new Date(entry.createdAt)
          const archivedAt = new Date(entry.archivedAt ?? entry.createdAt)
          const archivedName = changeDirName(entry.name, createdAt)
          map.set(
            entry.name,
            new ArchivedChange({
              name: entry.name,
              archivedName,
              workspace: SpecPath.parse(entry.workspace ?? 'default'),
              archivedAt,
              ...(entry.archivedBy !== undefined ? { archivedBy: entry.archivedBy } : {}),
              artifacts: entry.artifacts ?? [],
              specIds: entry.specIds ?? [],
              schemaName: entry.schemaName ?? 'unknown',
              schemaVersion: entry.schemaVersion ?? 0,
            }),
          )
        } else {
          // Legacy index entry — fall back to reading manifest
          const archiveDir = path.join(this._archivePath, ...entry.path.split('/'))
          const manifest = await this._loadManifest(archiveDir)
          const archivedName = changeDirName(manifest.name, new Date(manifest.createdAt))
          const archivedAt = new Date(manifest.archivedAt ?? manifest.createdAt)
          map.set(entry.name, this._buildArchivedChange(manifest, archivedName, archivedAt))
        }
      } catch (err) {
        // Skip malformed JSON lines, missing manifest directories (ENOENT), or
        // invalid manifest structure (SyntaxError). Re-throw unexpected I/O errors.
        if (err instanceof SyntaxError || isEnoent(err)) continue
        throw err
      }
    }

    return Array.from(map.values())
  }

  /**
   * Returns the archived change with the given name, or `null` if not found.
   *
   * Scans `index.jsonl` from the end (most recent entries first). If no entry
   * is found, falls back to a recursive directory scan and appends the
   * recovered entry to the index for future lookups.
   *
   * @param name - The change slug name to look up
   * @returns The archived change, or `null` if not found anywhere in the archive
   */
  override async get(name: string): Promise<ArchivedChange | null> {
    const entry = await this._findInIndexReverse(name)
    if (entry !== null) {
      const archiveDir = path.join(this._archivePath, ...entry.path.split('/'))
      const manifest = await this._loadManifest(archiveDir)
      const archivedName = changeDirName(manifest.name, new Date(manifest.createdAt))
      const archivedAt = new Date(manifest.archivedAt ?? manifest.createdAt)
      return this._buildArchivedChange(manifest, archivedName, archivedAt)
    }

    // Fallback: scan directory tree
    const found = await this._scanForChange(this._archivePath, this._archivePath, name)
    if (found === null) return null

    const manifest = await this._loadManifest(found.dir)
    const archivedName = changeDirName(manifest.name, new Date(manifest.createdAt))
    const archivedAt = new Date(manifest.archivedAt ?? manifest.createdAt)
    const archivedChange = this._buildArchivedChange(manifest, archivedName, archivedAt)

    // Recover: append enriched entry to index so future lookups are O(1)
    await this._appendIndex(this._buildIndexEntry(manifest, found.relPath))

    return archivedChange
  }

  /**
   * Rebuilds `index.jsonl` by scanning the archive directory for all
   * manifests with an `archivedAt` field, sorting by `archivedAt`, and
   * writing a clean index in chronological order.
   */
  override async reindex(): Promise<void> {
    const entries: Array<{ archivedAt: Date; manifest: ChangeManifest; relPath: string }> = []
    await this._collectManifests(this._archivePath, entries)
    entries.sort((a, b) => a.archivedAt.getTime() - b.archivedAt.getTime())

    const lines = entries.map((e) => JSON.stringify(this._buildIndexEntry(e.manifest, e.relPath)))
    const indexPath = path.join(this._archivePath, INDEX_FILE)
    const content = lines.length > 0 ? lines.join('\n') + '\n' : ''
    await fs.mkdir(this._archivePath, { recursive: true })
    await writeFileAtomic(indexPath, content)
  }

  // ---- Private helpers ----

  /**
   * Searches `changes/` and `drafts/` for a directory ending in `-<name>`.
   *
   * @param name - The change slug name to find
   * @returns Absolute path to the change directory, or `null` if not found
   */
  private async _resolveChangeDir(name: string): Promise<string | null> {
    for (const basePath of [this._changesPath, this._draftsPath]) {
      let entries: string[]
      try {
        entries = await fs.readdir(basePath)
      } catch (err) {
        if (isEnoent(err)) continue
        throw err
      }
      const match = entries.find((e) => {
        const m = e.match(/^\d{8}-\d{6}-(.+)$/)
        return m !== null && m[1] === name
      })
      if (match !== undefined) return path.join(basePath, match)
    }
    return null
  }

  /**
   * Expands the archive pattern by substituting all supported variables.
   *
   * All date components are derived from `archivedAt` in UTC and zero-padded.
   *
   * @param name - The change slug name (for `{{change.name}}`)
   * @param archivedName - The timestamped directory name (for `{{change.archivedName}}`)
   * @param archivedAt - The archive timestamp (for `{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`)
   * @param workspace - The primary workspace of the change (for `{{change.workspace}}`)
   * @returns The expanded forward-slash-separated path relative to the archive root
   */
  private _expandPattern(
    name: string,
    archivedName: string,
    archivedAt: Date,
    workspace: string,
  ): string {
    const year = archivedAt.getUTCFullYear().toString()
    const month = (archivedAt.getUTCMonth() + 1).toString().padStart(2, '0')
    const day = archivedAt.getUTCDate().toString().padStart(2, '0')
    const date = `${year}-${month}-${day}`
    return this._pattern
      .replaceAll('{{year}}', year)
      .replaceAll('{{month}}', month)
      .replaceAll('{{day}}', day)
      .replaceAll('{{date}}', date)
      .replaceAll('{{change.name}}', name)
      .replaceAll('{{change.archivedName}}', archivedName)
      .replaceAll('{{change.workspace}}', workspace)
  }

  /**
   * Constructs an `ArchivedChange` domain entity from a manifest and archive metadata.
   *
   * @param manifest - The parsed archive manifest
   * @param archivedName - The timestamped directory name
   * @param archivedAt - The timestamp when the change was archived
   * @returns A new `ArchivedChange` instance
   */
  private _buildArchivedChange(
    manifest: ChangeManifest,
    archivedName: string,
    archivedAt: Date,
  ): ArchivedChange {
    const firstWorkspace = deriveFirstWorkspace(manifest)
    return new ArchivedChange({
      name: manifest.name,
      archivedName,
      workspace: SpecPath.parse(firstWorkspace),
      archivedAt,
      ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
      artifacts: manifest.artifacts.map((a) => a.type),
      specIds: manifest.specIds,
      schemaName: manifest.schema.name,
      schemaVersion: manifest.schema.version,
    })
  }

  /**
   * Builds an enriched `IndexEntry` from a manifest and its relative path.
   *
   * @param manifest - The parsed manifest
   * @param relPath - Forward-slash-separated path relative to the archive root
   * @returns An enriched index entry that can reconstruct `ArchivedChange` without I/O
   */
  private _buildIndexEntry(manifest: ChangeManifest, relPath: string): IndexEntry {
    return {
      name: manifest.name,
      path: relPath,
      createdAt: manifest.createdAt,
      archivedAt: manifest.archivedAt,
      ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
      workspace: deriveFirstWorkspace(manifest),
      artifacts: manifest.artifacts.map((a) => a.type),
      specIds: manifest.specIds,
      schemaName: manifest.schema.name,
      schemaVersion: manifest.schema.version,
    }
  }

  /**
   * Reads and JSON-parses `manifest.json` from the given directory.
   *
   * @param dir - Absolute path to the change or archive directory
   * @returns The parsed `ChangeManifest`
   */
  private async _loadManifest(dir: string): Promise<ChangeManifest> {
    const content = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
    const json: unknown = JSON.parse(content)
    const result = changeManifestSchema.safeParse(json)
    if (!result.success) {
      throw new CorruptedManifestError(dir)
    }
    return result.data as ChangeManifest
  }

  /**
   * Writes `manifest.json` atomically via a temp file + rename.
   *
   * @param dir - Absolute path to the archive directory
   * @param manifest - The manifest data to persist
   */
  private async _writeManifestAtomic(dir: string, manifest: ChangeManifest): Promise<void> {
    const manifestPath = path.join(dir, 'manifest.json')
    await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2))
  }

  /**
   * Rebuilds the index when it is missing or stale.
   *
   * The index is a derived cache — if it's missing (e.g. after a fresh clone
   * or because it's gitignored), or if it contains fewer manifest paths than
   * exist on disk (e.g. after pulling new archives), it is rebuilt.
   */
  private async _ensureIndex(): Promise<void> {
    const indexPath = path.join(this._archivePath, INDEX_FILE)

    let indexExists = true
    try {
      await fs.access(indexPath)
    } catch {
      indexExists = false
    }

    if (!indexExists) {
      await this.reindex()
      return
    }

    // Compare manifest paths on disk against indexed paths
    const diskPaths = await this._collectManifestPaths(this._archivePath)
    const lines = await this._readIndexLines()
    const indexedPaths = new Set<string>()
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as IndexEntry
        indexedPaths.add(entry.path)
      } catch {
        // corrupt line — reindex
        await this.reindex()
        return
      }
    }

    const needsRebuild = diskPaths.some((p) => !indexedPaths.has(p))
    if (needsRebuild) {
      await this.reindex()
    }
  }

  /**
   * Recursively collects relative paths of directories containing `manifest.json`.
   *
   * Only performs `readdir` and `stat` calls — does not read file contents.
   *
   * @param dir - The directory to scan
   * @param base - The base archive path (for computing relative paths)
   * @returns Relative paths from the archive root to each manifest directory
   */
  private async _collectManifestPaths(dir: string, base?: string): Promise<string[]> {
    const root = base ?? dir
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const results: string[] = []

    // If this directory contains a manifest, record it
    if (dir !== root && entries.includes('manifest.json')) {
      results.push(path.relative(root, dir).split(path.sep).join('/'))
    }

    // Recurse into subdirectories
    const statResults = await Promise.all(
      entries
        .filter((e) => e !== INDEX_FILE && e !== 'manifest.json')
        .map(async (entry) => {
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
      const nested = await this._collectManifestPaths(fullPath, root)
      results.push(...nested)
    }

    return results
  }

  /**
   * Appends one line to the index file, creating it if needed.
   *
   * @param entry - The index entry to append
   */
  private async _appendIndex(entry: IndexEntry): Promise<void> {
    const indexPath = path.join(this._archivePath, INDEX_FILE)
    await fs.mkdir(this._archivePath, { recursive: true })
    await fs.appendFile(indexPath, JSON.stringify(entry) + '\n', 'utf8')
  }

  /**
   * Reads `index.jsonl` and returns all non-empty lines.
   *
   * Returns an empty array if the file does not exist.
   *
   * @returns Array of raw JSON strings, one per index entry
   */
  private async _readIndexLines(): Promise<string[]> {
    const indexPath = path.join(this._archivePath, INDEX_FILE)
    let content: string
    try {
      content = await fs.readFile(indexPath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    return content.split('\n').filter((l) => l.trim().length > 0)
  }

  /**
   * Scans `index.jsonl` from the end without loading the full file into memory.
   *
   * Reads the file in reverse chunks, parsing lines from newest to oldest.
   * Returns the first {@link IndexEntry} whose `name` matches, or `null`.
   *
   * @param name - The change slug name to search for
   * @returns The matching index entry, or `null` if not found
   */
  private async _findInIndexReverse(name: string): Promise<IndexEntry | null> {
    const indexPath = path.join(this._archivePath, INDEX_FILE)
    let fh: fs.FileHandle
    try {
      fh = await fs.open(indexPath, 'r')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    try {
      const { size } = await fh.stat()
      if (size === 0) return null

      const chunkSize = 4096
      let offset = size
      let trailing = '' // leftover bytes from the previous chunk (incomplete line at chunk start)

      while (offset > 0) {
        const readSize = Math.min(chunkSize, offset)
        offset -= readSize
        const buf = Buffer.alloc(readSize)
        await fh.read(buf, 0, readSize, offset)
        const chunk = buf.toString('utf8') + trailing

        const lines = chunk.split('\n')
        // First element may be a partial line (split at chunk boundary) — carry it forward
        trailing = lines[0] ?? ''

        // Process complete lines from end to start (skip index 0 which is the partial)
        for (let i = lines.length - 1; i >= 1; i--) {
          const line = lines[i]!.trim()
          if (line.length === 0) continue
          try {
            const entry = JSON.parse(line) as IndexEntry
            if (entry.name === name) return entry
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Process the final trailing fragment (first line of the file)
      if (trailing.trim().length > 0) {
        try {
          const entry = JSON.parse(trailing) as IndexEntry
          if (entry.name === name) return entry
        } catch {
          // Skip malformed JSON
        }
      }

      return null
    } finally {
      await fh.close()
    }
  }

  /**
   * Recursively searches the archive directory tree for a subdirectory ending
   * in `-<name>` that contains a `manifest.json`.
   *
   * Used as a fallback when `get()` finds no match in `index.jsonl`.
   *
   * @param dir - Current directory being scanned
   * @param root - Archive root (used to compute the relative path)
   * @param name - The change slug name to find
   * @returns The matching directory and its relative path, or `null` if not found
   */
  private async _scanForChange(
    dir: string,
    root: string,
    name: string,
  ): Promise<GlobResult | null> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    // Stat all entries in parallel to identify directories
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

    for (const { entry, fullPath, isDir } of statResults) {
      if (!isDir) continue

      const m = entry.match(/^\d{8}-\d{6}-(.+)$/)
      if (m !== null && m[1] === name) {
        try {
          await fs.access(path.join(fullPath, 'manifest.json'))
          const relPath = path.relative(root, fullPath).split(path.sep).join('/')
          return { dir: fullPath, relPath }
        } catch {
          // No manifest.json — not an archived change
        }
      }

      const found = await this._scanForChange(fullPath, root, name)
      if (found !== null) return found
    }

    return null
  }

  /**
   * Recursively collects all archived manifests (those with an `archivedAt`
   * field) under the given directory.
   *
   * Used by `reindex()` to rebuild `index.jsonl` from the directory tree.
   *
   * @param dir - Current directory being walked
   * @param results - Accumulator array for discovered archive entries
   */
  private async _collectManifests(
    dir: string,
    results: Array<{ archivedAt: Date; manifest: ChangeManifest; relPath: string }>,
  ): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return
      throw err
    }

    // Stat all entries in parallel to identify directories
    const statResults = await Promise.all(
      entries
        .filter((e) => e !== INDEX_FILE)
        .map(async (entry) => {
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

      // Try to read manifest.json in this directory
      try {
        const content = await fs.readFile(path.join(fullPath, 'manifest.json'), 'utf8')
        const parsed = changeManifestSchema.safeParse(JSON.parse(content))
        if (!parsed.success) continue // skip corrupted manifests during reindex
        const manifest = parsed.data as ChangeManifest
        if (manifest.archivedAt !== undefined) {
          const relPath = path.relative(this._archivePath, fullPath).split(path.sep).join('/')
          results.push({ archivedAt: new Date(manifest.archivedAt), manifest, relPath })
          // This is an archived change directory — no need to recurse further
          continue
        }
      } catch (err) {
        if (!(err instanceof SyntaxError || isEnoent(err))) throw err
        // Not a manifest or unreadable — recurse into directory
      }

      await this._collectManifests(fullPath, results)
    }
  }
}

/**
 * Derives the first workspace from a manifest's specIds, falling back to
 * the legacy `workspaces` field, then to `'default'`.
 *
 * @param manifest - The parsed manifest to derive a workspace from
 * @returns The first workspace name
 */
function deriveFirstWorkspace(manifest: ChangeManifest): string {
  if (manifest.specIds.length > 0) {
    return parseSpecId(manifest.specIds[0]!).workspace
  }
  if (manifest.workspaces !== undefined && manifest.workspaces.length > 0) {
    return manifest.workspaces[0]!
  }
  return 'default'
}
