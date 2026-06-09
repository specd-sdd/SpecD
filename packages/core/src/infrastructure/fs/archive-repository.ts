import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type Change } from '../../domain/entities/change.js'
import {
  type ArchivedChangeIndexEntry,
  workspacesFromSpecIds,
} from '../../domain/archived-change-index-entry.js'
import { toArchivedChangeView } from '../../domain/read-only-change-view.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
  type ArchiveListResult,
  type ArchivePathEntry,
  type ArchiveRepositoryConfig,
} from '../../application/ports/archive-repository.js'
import { ChangeNotFoundError } from '../../application/errors/change-not-found-error.js'
import { UnsupportedPatternError } from '../../domain/errors/unsupported-pattern-error.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { Logger } from '../../application/logger.js'
import { changeDirName } from './dir-name.js'
import { isEnoent } from './is-enoent.js'
import { moveDir } from './move-dir.js'
import { normalizeRelativePath, resolveConfinedPath } from './path-confinement.js'
import { sha256 } from './hash.js'
import { writeFileAtomic } from './write-atomic.js'
import { type ChangeManifest, changeManifestSchema } from './manifest.js'
import { loadChangeFromManifest } from './manifest-change-loader.js'

/** Filename of the append-only archive index at the archive root. */
const INDEX_FILE = '.specd-index.jsonl'
const INDEX_META_FILE = '.specd-index-meta.json'
const ARCHIVE_GITIGNORE_FILE = '.gitignore'
const ARCHIVE_RUNTIME_GITIGNORE_ENTRIES = [
  '.specd-index.jsonl',
  '.staging',
  INDEX_META_FILE,
] as const

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
   * Reads the current total archived change count from the metadata file.
   *
   * Falls back to a full index scan if the file is missing or corrupted.
   *
   * @returns The total number of archived changes
   */
  private async _readMetaCount(): Promise<number> {
    const metaPath = path.join(this._archivePath, INDEX_META_FILE)
    try {
      const content = await fs.readFile(metaPath, 'utf8')
      const data = JSON.parse(content) as Record<string, unknown> | null
      if (data !== null && typeof data === 'object' && typeof data.totalCount === 'number') {
        return data.totalCount
      }
    } catch (err) {
      if (!isEnoent(err)) {
        Logger.debug(
          'FsArchiveRepository failed to read metadata file; falling back to index scan',
          {
            error: err,
          },
        )
      }
    }

    // Fallback: full index scan
    try {
      const lines = await this._readIndexLines()
      const names = new Set<string>()
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as IndexEntry
          names.add(entry.name)
        } catch {
          continue
        }
      }
      return names.size
    } catch (err) {
      if (!isEnoent(err)) throw err
      return 0
    }
  }

  /**
   * Writes the total archived change count to the metadata file atomically.
   *
   * @param count - The new total count
   */
  private async _writeMetaCount(count: number): Promise<void> {
    const metaPath = path.join(this._archivePath, INDEX_META_FILE)
    await fs.mkdir(this._archivePath, { recursive: true })
    await writeFileAtomic(metaPath, JSON.stringify({ totalCount: count }, null, 2) + '\n')
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
    const archiveDir = this._resolveArchiveDirPath(relPath)
    const stageRelPath = `.staging/${archivedName}-${Date.now()}`
    const stageDir = this._resolveArchiveDirPath(stageRelPath)

    const sourceDir = await this._resolveChangeDir(change.name)
    if (sourceDir === null) {
      throw new ChangeNotFoundError(change.name)
    }

    Logger.debug('FsArchiveRepository starting staged archive commit', {
      change: change.name,
      archiveRelPath: normalizeRelativePath(relPath),
      stageRelPath: normalizeRelativePath(stageRelPath),
    })

    await fs.mkdir(path.dirname(stageDir), { recursive: true })
    await moveDir(sourceDir, stageDir)

    try {
      const manifest = await this._loadManifest(stageDir)
      const archivedManifest: ChangeManifest = {
        ...manifest,
        archivedAt: archivedAt.toISOString(),
        ...(options?.actor !== undefined ? { archivedBy: options.actor } : {}),
      }
      await this._writeManifestAtomic(stageDir, archivedManifest)

      const previousCount = await this._readMetaCount()

      await fs.mkdir(path.dirname(archiveDir), { recursive: true })
      await moveDir(stageDir, archiveDir)
      await this._ensureArchiveRuntimeGitignore()
      await this._appendIndex(this._buildIndexEntry(archivedManifest, relPath))
      await this._writeMetaCount(previousCount + 1)

      const archivedChange = toArchivedChangeView(change, {
        archivedName,
        archivedAt,
        ...(options?.actor !== undefined ? { archivedBy: options.actor } : {}),
      })

      Logger.debug('FsArchiveRepository completed staged archive commit', {
        change: change.name,
        archiveRelPath: normalizeRelativePath(relPath),
      })

      return { archivedChange, archiveDirPath: archiveDir }
    } catch (error) {
      Logger.debug('FsArchiveRepository archive staging failed', {
        change: change.name,
        archiveRelPath: normalizeRelativePath(relPath),
      })
      await this._rollbackStagedArchive(sourceDir, stageDir, archiveDir)
      throw error
    }
  }

  /**
   * Lists archived changes in this workspace in chronological order (oldest first).
   *
   * Streams `index.jsonl` from the start, deduplicating by name so that the
   * last entry wins in case of duplicates introduced by manual recovery.
   *
   * @param options - Pagination and filtering options
   * @returns Paginated index-backed archive result, oldest first
   */
  override async list(options?: ArchiveListOptions): Promise<ArchiveListResult> {
    await this._ensureIndex()
    const lines = await this._readIndexLines()
    const map = new Map<string, ArchivedChangeIndexEntry>()

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as IndexEntry
        const row = await this._indexEntryToRow(entry)
        if (row !== null) {
          map.set(entry.name, row)
        }
      } catch (err) {
        if (err instanceof SyntaxError || isEnoent(err)) continue
        throw err
      }
    }

    const allItems = Array.from(map.values())
    const limit = options?.limit ?? 100
    const total = await this._readMetaCount()

    let items = allItems
    let page: number | undefined
    let startAt: string | undefined

    if (options?.startAt !== undefined) {
      startAt = options.startAt
      const startIdx = items.findIndex((i) => i.name === options.startAt)
      if (startIdx >= 0) {
        items = items.slice(startIdx + 1)
      }
    } else {
      const p = options?.page ?? 1
      page = p
      const offset = (p - 1) * limit
      items = items.slice(offset)
    }

    const count = Math.min(items.length, limit)
    items = items.slice(0, limit)

    return {
      items,
      meta: {
        total,
        count,
        limit,
        ...(page !== undefined ? { page } : {}),
        ...(startAt !== undefined ? { startAt } : {}),
      },
    }
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
      const archiveDir = this._resolveArchiveDirPath(entry.path)
      return this._loadArchivedDetail(archiveDir)
    }

    // Fallback: scan directory tree
    const found = await this._scanForChange(this._archivePath, this._archivePath, name)
    if (found === null) return null

    const manifest = await this._loadManifest(found.dir)
    const archivedChange = this._loadArchivedDetailFromManifest(manifest)

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
    await this._ensureArchiveRuntimeGitignore()
    await fs.mkdir(this._archivePath, { recursive: true })
    await writeFileAtomic(indexPath, content)
    await this._writeMetaCount(entries.length)
  }

  /**
   * Returns the absolute filesystem path for an archived change's directory.
   *
   * Reconstructs the path deterministically from the archived change's
   * properties and the configured archive pattern.
   *
   * @param entry - Index row or full archived detail with path resolution fields
   * @returns The absolute path to the archived change's directory
   */
  override archivePath(entry: ArchivePathEntry): string {
    const relPath = this._expandPattern(
      entry.name,
      entry.archivedName,
      entry.archivedAt,
      entry.workspaces[0] ?? 'default',
    )
    return resolveArchiveDirPathSync(this._archivePath, relPath)
  }

  /** @inheritdoc */
  override async artifact(change: ArchivedChange, filename: string): Promise<SpecArtifact | null> {
    const dir = this.archivePath(change)
    const allowed = new Set<string>()
    for (const artifact of change.artifacts.values()) {
      for (const file of artifact.files.values()) {
        allowed.add(normalizeRelativePath(file.filename))
      }
    }
    const filePath = resolveConfinedPath(dir, filename, allowed.size > 0 ? allowed : undefined)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    return new SpecArtifact(filename, content, sha256(content))
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
   * Maps an index line to an {@link ArchivedChangeIndexEntry}.
   *
   * Enriched entries are converted without manifest I/O. Legacy entries fall
   * back to reading the archived manifest once.
   *
   * @param entry - Parsed index entry
   * @returns Index row, or `null` when the entry cannot be resolved
   */
  private async _indexEntryToRow(entry: IndexEntry): Promise<ArchivedChangeIndexEntry | null> {
    if (entry.createdAt !== undefined) {
      const createdAt = new Date(entry.createdAt)
      const archivedAt = new Date(entry.archivedAt ?? entry.createdAt)
      const specIds = entry.specIds ?? []
      return {
        name: entry.name,
        archivedName: changeDirName(entry.name, createdAt),
        archivedAt,
        ...(entry.archivedBy !== undefined ? { archivedBy: entry.archivedBy } : {}),
        artifacts: entry.artifacts ?? [],
        specIds,
        schemaName: entry.schemaName ?? 'unknown',
        schemaVersion: entry.schemaVersion ?? 0,
        workspaces: workspacesFromSpecIds(specIds),
      }
    }

    try {
      const archiveDir = this._resolveArchiveDirPath(entry.path)
      const manifest = await this._loadManifest(archiveDir)
      return this._manifestToIndexEntry(manifest)
    } catch (err) {
      if (err instanceof SyntaxError || isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Builds an index row from manifest summary fields.
   *
   * @param manifest - Parsed archive manifest
   * @returns Index-backed archive row
   */
  private _manifestToIndexEntry(manifest: ChangeManifest): ArchivedChangeIndexEntry {
    const archivedName = changeDirName(manifest.name, new Date(manifest.createdAt))
    const archivedAt = new Date(manifest.archivedAt ?? manifest.createdAt)
    return {
      name: manifest.name,
      archivedName,
      archivedAt,
      ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
      artifacts: manifest.artifacts.map((a) => a.type),
      specIds: manifest.specIds,
      schemaName: manifest.schema.name,
      schemaVersion: manifest.schema.version,
      workspaces: workspacesFromSpecIds(manifest.specIds),
    }
  }

  /**
   * Loads full archived detail from an archive directory.
   *
   * @param archiveDir - Absolute path to the archived change directory
   * @returns Manifest-backed archived read model
   */
  private async _loadArchivedDetail(archiveDir: string): Promise<ArchivedChange> {
    const manifest = await this._loadManifest(archiveDir)
    return this._loadArchivedDetailFromManifest(manifest)
  }

  /**
   * Constructs full archived detail from a parsed manifest.
   *
   * @param manifest - Parsed archive manifest
   * @returns Manifest-backed archived read model
   */
  private _loadArchivedDetailFromManifest(manifest: ChangeManifest): ArchivedChange {
    const archivedName = changeDirName(manifest.name, new Date(manifest.createdAt))
    const archivedAt = new Date(manifest.archivedAt ?? manifest.createdAt)
    const change = loadChangeFromManifest(manifest)
    return toArchivedChangeView(change, {
      archivedName,
      archivedAt,
      ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
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
      path: normalizeRelativePath(relPath),
      createdAt: manifest.createdAt,
      archivedAt: manifest.archivedAt,
      ...(manifest.archivedBy !== undefined ? { archivedBy: manifest.archivedBy } : {}),
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
    await this._ensureArchiveRuntimeGitignore()
    const indexPath = path.join(this._archivePath, INDEX_FILE)
    await fs.mkdir(this._archivePath, { recursive: true })
    await fs.appendFile(indexPath, JSON.stringify(entry) + '\n', 'utf8')
  }

  /**
   * Ensures archive-local runtime artifacts are ignored by git.
   *
   * @returns A promise that resolves once `.gitignore` contains runtime entries
   */
  private async _ensureArchiveRuntimeGitignore(): Promise<void> {
    const gitignorePath = path.join(this._archivePath, ARCHIVE_GITIGNORE_FILE)
    await fs.mkdir(this._archivePath, { recursive: true })
    for (const entry of ARCHIVE_RUNTIME_GITIGNORE_ENTRIES) {
      await this._appendArchiveGitignoreEntry(gitignorePath, entry)
    }
  }

  /**
   * Appends a gitignore entry exactly once while preserving existing content.
   *
   * @param gitignorePath - Absolute path to the archive-local `.gitignore`
   * @param entry - The ignore entry to ensure
   * @returns A promise that resolves after entry synchronization
   */
  private async _appendArchiveGitignoreEntry(gitignorePath: string, entry: string): Promise<void> {
    let existing = ''
    try {
      existing = await fs.readFile(gitignorePath, 'utf8')
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
    const lines = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.includes(entry)) return
    const newContent = existing.length > 0 ? `${existing}${entry}\n` : `${entry}\n`
    await writeFileAtomic(gitignorePath, newContent)
  }

  /**
   * Resolves an archive-relative path while enforcing archive-root confinement.
   *
   * @param relPath - Forward-slash archive-relative path
   * @returns Absolute confined archive path
   */
  private _resolveArchiveDirPath(relPath: string): string {
    return resolveConfinedPath(this._archivePath, relPath)
  }

  /**
   * Attempts to restore the pre-archive layout after a staged archive failure.
   *
   * @param sourceDir - Original active change directory path
   * @param stageDir - Temporary staging directory path
   * @param archiveDir - Final archive directory path
   */
  private async _rollbackStagedArchive(
    sourceDir: string,
    stageDir: string,
    archiveDir: string,
  ): Promise<void> {
    try {
      await fs.mkdir(path.dirname(sourceDir), { recursive: true })
      await moveDir(stageDir, sourceDir)
      return
    } catch (stageError) {
      if (!isEnoent(stageError)) throw stageError
    }

    try {
      await fs.mkdir(path.dirname(sourceDir), { recursive: true })
      await moveDir(archiveDir, sourceDir)
    } catch (archiveError) {
      if (!isEnoent(archiveError)) throw archiveError
    }
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
 * Resolves an archive-relative path synchronously while enforcing confinement.
 *
 * @param root - Archive root directory
 * @param relPath - Archive-relative path
 * @returns Absolute confined archive path
 * @throws {PathTraversalError} When the candidate escapes the archive root
 */
function resolveArchiveDirPathSync(root: string, relPath: string): string {
  const normalizedRoot = path.resolve(root)
  const normalizedRelative = normalizeRelativePath(relPath)
  if (
    normalizedRelative === '..' ||
    normalizedRelative.startsWith('../') ||
    path.posix.isAbsolute(normalizedRelative)
  ) {
    throw new CorruptedManifestError(relPath)
  }

  const resolved = path.resolve(normalizedRoot, ...normalizedRelative.split('/'))
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new CorruptedManifestError(relPath)
  }

  return resolved
}
