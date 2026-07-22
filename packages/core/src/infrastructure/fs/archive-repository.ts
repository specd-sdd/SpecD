import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { StorageDirectoryNotFoundError } from '../../domain/errors/index.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type Change } from '../../domain/entities/change.js'
import { type ArchiveListEntry } from '../../domain/archived-change-index-entry.js'
import { toArchivedChangeView } from '../../domain/read-only-change-view.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
  type ArchivePathEntry,
  type ArchiveRepositoryConfig as BaseArchiveRepositoryConfig,
} from '../../application/ports/archive-repository.js'
import { type ListResult } from '../../application/ports/repository.js'
import { ChangeNotFoundError } from '../../application/errors/change-not-found-error.js'
import { UnsupportedPatternError } from '../../domain/errors/unsupported-pattern-error.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { Logger } from '../../application/logger.js'
import { changeDirName } from './dir-name.js'
import { isEnoent } from './is-enoent.js'
import { moveDir } from './move-dir.js'
import { normalizeRelativePath, resolveConfinedPath } from './path-confinement.js'
import { writeFileAtomic } from './write-atomic.js'
import { type ChangeManifest, changeManifestSchema } from './manifest.js'
import { loadChangeFromManifest } from './manifest-change-loader.js'
import { FsArchiveIndexCache, type ArchiveIndexEntry } from './fs-archive-index-cache.js'
import { ensureTmpGitignore } from './ensure-tmp-gitignore.js'

/** Legacy filenames at the archive root before fs-cache migration. Deleted on rebuild only. */
const LEGACY_INDEX_FILE = '.specd-index.jsonl'
const LEGACY_INDEX_META_FILE = '.specd-index-meta.json'
const ARCHIVE_GITIGNORE_FILE = '.gitignore'
const ARCHIVE_RUNTIME_GITIGNORE_ENTRIES = ['.staging'] as const

/** Default archive pattern when none is configured. */
const DEFAULT_PATTERN = '{{change.archivedName}}'

/**
 * Configuration for `FsArchiveRepository`.
 */
export interface ArchiveRepositoryConfig extends BaseArchiveRepositoryConfig {
  readonly changesPath: string
  readonly draftsPath: string
}

/**
 * Configuration options for the filesystem archive repository.
 */
export interface FsArchiveRepositoryConfig {
  readonly path: string
  readonly pattern?: string
}

export const FsArchiveOptionsSchema = z.object({
  path: z.string(),
  pattern: z.string().optional(),
})

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
 * The fs-cache index under `{configPath}/tmp/fs-cache/archive/` provides O(1)
 * upserts and fast lookups. `reindex()` rebuilds it from the directory tree for
 * recovery.
 */
export class FsArchiveRepository extends ArchiveRepository {
  private readonly _changesPath: string
  private readonly _draftsPath: string
  private readonly _archivePath: string
  private readonly _pattern: string
  private readonly _index: FsArchiveIndexCache
  private _tmpGitignoreEnsured = false

  /**
   * Creates a new `FsArchiveRepository` instance.
   *
   * @param config - Legacy storage paths, archive pattern, and repository configuration
   */
  constructor(config: ArchiveRepositoryConfig & { archivePath: string; pattern?: string })
  /**
   * Creates a new `FsArchiveRepository` instance.
   *
   * @param context - Shared repository context
   * @param config - Adapter options
   */
  constructor(context: ArchiveRepositoryConfig, config: FsArchiveRepositoryConfig)
  /**
   * Creates a new `FsArchiveRepository` instance.
   *
   * @param contextOrConfig - Shared repository context or legacy config
   * @param config - Adapter options or undefined for legacy constructor
   */
  constructor(contextOrConfig: unknown, config?: unknown) {
    let context: ArchiveRepositoryConfig
    let parsedConfig: FsArchiveRepositoryConfig
    if (config === undefined) {
      const legacy = contextOrConfig as ArchiveRepositoryConfig & {
        archivePath: string
        pattern?: string
      }
      context = legacy
      parsedConfig = {
        path: legacy.archivePath,
        ...(legacy.pattern !== undefined ? { pattern: legacy.pattern } : {}),
      }
    } else {
      context = contextOrConfig as ArchiveRepositoryConfig
      const parsed = FsArchiveOptionsSchema.parse(config)
      parsedConfig = {
        path: parsed.path,
        ...(parsed.pattern !== undefined ? { pattern: parsed.pattern } : {}),
      }
    }

    super(context)
    if ((parsedConfig.pattern ?? '').includes('{{change.scope}}')) {
      throw new UnsupportedPatternError(
        '{{change.scope}}',
        'scope paths contain "/" which produces ambiguous directory names',
      )
    }
    if ((parsedConfig.pattern ?? '').includes('{{change.workspace}}')) {
      throw new UnsupportedPatternError(
        '{{change.workspace}}',
        'changes have no primary workspace; use {{change.name}} or {{change.archivedName}} instead',
      )
    }

    if (!existsSync(parsedConfig.path)) {
      throw new StorageDirectoryNotFoundError(parsedConfig.path, 'Archive directory does not exist')
    }
    if (!existsSync(context.changesPath)) {
      throw new StorageDirectoryNotFoundError(
        context.changesPath,
        'Changes directory does not exist',
      )
    }
    if (!existsSync(context.draftsPath)) {
      throw new StorageDirectoryNotFoundError(context.draftsPath, 'Drafts directory does not exist')
    }

    this._archivePath = parsedConfig.path
    this._changesPath = context.changesPath
    this._draftsPath = context.draftsPath
    this._pattern = parsedConfig.pattern ?? DEFAULT_PATTERN

    const fsCacheRoot = path.join(context.configPath, 'tmp', 'fs-cache')
    this._index = new FsArchiveIndexCache({
      bucketDir: path.join(fsCacheRoot, 'archive'),
      archivePath: this._archivePath,
      onRebuilt: () => this._deleteLegacyRootIndex(),
    })
  }

  /**
   * Idempotently ensures `{configPath}/tmp/.gitignore` exists before writing
   * under `tmp/fs-cache`.
   */
  private async _ensureGitignore(): Promise<void> {
    if (this._tmpGitignoreEnsured) return
    await ensureTmpGitignore(this.configPath())
    this._tmpGitignoreEnsured = true
  }

  /**
   * Deletes legacy archive-root index files after a fs-cache rebuild.
   *
   * Ignores ENOENT — normal list/count cache hits must not remove these files.
   */
  private async _deleteLegacyRootIndex(): Promise<void> {
    for (const file of [LEGACY_INDEX_FILE, LEGACY_INDEX_META_FILE]) {
      try {
        await fs.unlink(path.join(this._archivePath, file))
      } catch (err) {
        if (!isEnoent(err)) throw err
      }
    }
  }

  /** @inheritdoc */
  override async archive(
    change: Change,
    options?: { force?: boolean; actor?: { name: string; email: string } },
  ): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }> {
    if (options?.force !== true) {
      change.assertArchivable()
    }

    const archivedAt = new Date()
    const archivedName = changeDirName(change.name, change.createdAt)
    const relPath = this._expandPattern(change.name, archivedName, archivedAt)
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

      await fs.mkdir(path.dirname(archiveDir), { recursive: true })
      await moveDir(stageDir, archiveDir)
      await this._ensureArchiveRuntimeGitignore()

      const manifestPath = path.join(archiveDir, 'manifest.json')
      const stat = await fs.stat(manifestPath)
      await this._ensureGitignore()
      await this._index.upsert(
        this._buildIndexEntry(archivedManifest, relPath),
        stat.mtime.toISOString(),
      )

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

  /** @inheritdoc */
  override async list(options?: ArchiveListOptions): Promise<ListResult<ArchiveListEntry>> {
    await this._ensureGitignore()
    const result = await this._index.list(options)
    return {
      items: result.items.map((entry) => projectArchiveInclude(entry, options)),
      meta: result.meta,
    }
  }

  /** @inheritdoc */
  override async count(): Promise<number> {
    await this._ensureGitignore()
    return this._index.count()
  }

  /** @inheritdoc */
  override async get(name: string): Promise<ArchivedChange | null> {
    await this._ensureGitignore()
    const entry = await this._index.findByName(name)
    if (entry !== null) {
      const archiveDir = this._resolveArchiveDirPath(entry.path)
      return this._loadArchivedDetail(archiveDir)
    }

    const found = await this._scanForChange(this._archivePath, this._archivePath, name)
    if (found === null) return null

    const manifest = await this._loadManifest(found.dir)
    const archivedChange = this._loadArchivedDetailFromManifest(manifest)

    const manifestPath = path.join(found.dir, 'manifest.json')
    const stat = await fs.stat(manifestPath)
    await this._index.upsert(
      this._buildIndexEntry(manifest, found.relPath),
      stat.mtime.toISOString(),
    )

    return archivedChange
  }

  /** @inheritdoc */
  override async reindex(): Promise<void> {
    await this._ensureGitignore()
    await this._ensureArchiveRuntimeGitignore()
    await this._index.reindex()
  }

  /**
   * Marks the archive fs-cache index invalidated so the next `list()`/`count()`
   * rebuilds from disk.
   */
  override async invalidateCache(): Promise<void> {
    await this._index.invalidate()
  }

  /** @inheritdoc */
  override archivePath(entry: ArchivePathEntry): string {
    const relPath = this._expandPattern(entry.name, entry.archivedName, entry.archivedAt)
    return resolveArchiveDirPathSync(this._archivePath, relPath)
  }

  // ---- Private helpers ----

  /**
   * Resolves the on-disk source directory for a change by name.
   *
   * @param name - The change slug name to search for
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
   * Expands the configured archive path pattern for one archived change.
   *
   * @param name - Change slug name
   * @param archivedName - Timestamp-prefixed directory name
   * @param archivedAt - Archive timestamp
   * @returns Forward-slash-separated path relative to the archive root
   */
  private _expandPattern(name: string, archivedName: string, archivedAt: Date): string {
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
  }

  /**
   * Builds a fs-cache index row from a persisted archive manifest.
   *
   * @param manifest - Parsed archive manifest
   * @param relPath - Forward-slash-separated path relative to the archive root
   * @returns Index row including helper `path`
   */
  private _buildIndexEntry(manifest: ChangeManifest, relPath: string): ArchiveIndexEntry {
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
   * Loads full archived change detail from an archive directory.
   *
   * @param archiveDir - Absolute path to the archived change directory
   * @returns Archived change read model
   */
  private async _loadArchivedDetail(archiveDir: string): Promise<ArchivedChange> {
    const manifest = await this._loadManifest(archiveDir)
    return this._loadArchivedDetailFromManifest(manifest)
  }

  /**
   * Builds an archived change read model from a parsed manifest.
   *
   * @param manifest - Parsed archive manifest
   * @returns Archived change read model
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
   * Reads and validates `manifest.json` from an archive directory.
   *
   * @param dir - Absolute path to the archived change directory
   * @returns Parsed manifest
   * @throws {CorruptedManifestError} When the manifest is invalid
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
   * Writes `manifest.json` atomically inside an archive directory.
   *
   * @param dir - Absolute path to the archived change directory
   * @param manifest - Manifest payload to persist
   */
  private async _writeManifestAtomic(dir: string, manifest: ChangeManifest): Promise<void> {
    const manifestPath = path.join(dir, 'manifest.json')
    await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2))
  }

  /**
   * Ensures archive-root runtime entries are listed in `.gitignore`.
   */
  private async _ensureArchiveRuntimeGitignore(): Promise<void> {
    const gitignorePath = path.join(this._archivePath, ARCHIVE_GITIGNORE_FILE)
    await fs.mkdir(this._archivePath, { recursive: true })
    for (const entry of ARCHIVE_RUNTIME_GITIGNORE_ENTRIES) {
      await this._appendArchiveGitignoreEntry(gitignorePath, entry)
    }
  }

  /**
   * Appends one entry to the archive `.gitignore` when absent.
   *
   * @param gitignorePath - Absolute path to the archive `.gitignore`
   * @param entry - Entry line to append
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
   * Resolves an archive-relative path while enforcing confinement.
   *
   * @param relPath - Forward-slash-separated path relative to the archive root
   * @returns Absolute confined archive path
   */
  private _resolveArchiveDirPath(relPath: string): string {
    return resolveConfinedPath(this._archivePath, relPath)
  }

  /**
   * Rolls back a failed staged archive by restoring the source directory.
   *
   * @param sourceDir - Original active/draft change directory
   * @param stageDir - Staging directory used during archive
   * @param archiveDir - Final archive destination directory
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
   * Recursively scans the archive tree for a change directory by name.
   *
   * @param dir - Current directory being walked
   * @param root - Archive root used for relative paths
   * @param name - Change slug name to locate
   * @returns Matching archive directory, or `null` if not found
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

  /** @inheritdoc */
  override internalPaths(): readonly string[] {
    return [this._archivePath]
  }
}

/**
 * Projects a cached archive index row to the public list shape.
 *
 * Strips helper-only `path` and applies `includeArchivedBy` projection.
 *
 * @param entry - Full stored index row
 * @param options - Include projection options
 * @returns Public {@link ArchiveListEntry}
 */
function projectArchiveInclude(
  entry: ArchiveIndexEntry,
  options?: ArchiveListOptions,
): ArchiveListEntry {
  const { archivedBy, name, archivedName, archivedAt, specIds, schemaName, schemaVersion } = entry
  const base: ArchiveListEntry = {
    name,
    archivedName,
    archivedAt,
    specIds,
    schemaName,
    schemaVersion,
  }
  if (options?.includeArchivedBy && archivedBy !== undefined) {
    return { ...base, archivedBy }
  }
  return base
}

/**
 * Resolves an archive-relative path synchronously while enforcing confinement.
 *
 * @param root - Archive root directory
 * @param relPath - Archive-relative path
 * @returns Absolute confined archive path
 * @throws {CorruptedManifestError} When the candidate escapes the archive root
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
