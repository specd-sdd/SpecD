import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { StorageDirectoryNotFoundError } from '../../domain/errors/index.js'
import { randomUUID } from 'node:crypto'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { SpecPublicationError } from '../../domain/errors/spec-publication-error.js'
import {
  specMetadataSchema,
  type PersistedSpecMetadata,
} from '../../domain/services/parse-metadata.js'
import {
  parseSpecLock,
  type SpecLockData,
  type SpecLockImplementationEntry,
} from '../../domain/services/parse-spec-lock.js'
import {
  SpecRepository,
  type SpecRepositoryConfig as BaseSpecRepositoryConfig,
  type SpecPublication,
  type ResolveFromPathResult,
  type SpecSearchResult,
  type SpecSearchMatch,
  type SpecListEntry,
  type SpecListOptions,
} from '../../application/ports/spec-repository.js'
import { type ListResult } from '../../application/ports/repository.js'
import { Logger } from '../../application/logger.js'
import { isEnoent } from './is-enoent.js'
import { normalizeRelativePath, resolveConfinedPath } from './path-confinement.js'
import { writeFileAtomic } from './write-atomic.js'
import { sha256 } from './hash.js'
import { checkMetadataFreshness } from '../../application/use-cases/_shared/metadata-freshness.js'
import { FsSpecIndexCache, type SpecIndexSource } from './fs-spec-index-cache.js'
import { type SourceFileStamp } from './fs-index-cache-base.js'
import { ensureTmpGitignore } from './ensure-tmp-gitignore.js'

const SPEC_LOCK_FILENAME = 'spec-lock.json'

/**
 * Extended configuration for `FsSpecRepository`.
 */
export interface SpecRepositoryConfig extends BaseSpecRepositoryConfig {
  readonly prefix?: string
}

/**
 * Configuration options for the filesystem spec repository.
 */
export interface FsSpecRepositoryConfig {
  readonly path: string
  readonly metadataPath: string
}

export const FsSpecOptionsSchema = z.object({
  path: z.string(),
  metadataPath: z.string(),
})

/**
 * Filesystem implementation of `SpecRepository`.
 *
 * Each spec is a directory under `<specsPath>/<specName>/` containing one or
 * more artifact files (e.g. `spec.md`, `proposal.md`). The `Spec` entity
 * returned by `get` and `list` contains only metadata — artifact content is
 * loaded on demand via `artifact()`.
 *
 * Multiple `specsPath` roots across workspaces are handled by instantiating
 * a separate `FsSpecRepository` per workspace at the call site; the port
 * itself is per-workspace.
 */
export class FsSpecRepository extends SpecRepository {
  private readonly _specsPath: string
  private readonly _metadataPath: string
  private readonly _prefixSegments: readonly string[]
  private readonly _indexCache: FsSpecIndexCache
  private _tmpGitignoreEnsured = false

  /**
   * Creates a new `FsSpecRepository` instance.
   *
   * @param config - Legacy specs root path, workspace configuration, and locality settings
   */
  constructor(config: SpecRepositoryConfig & { specsPath: string; metadataPath: string })
  /**
   * Creates a new `FsSpecRepository` instance.
   *
   * @param context - Shared repository context
   * @param config - Adapter options
   */
  constructor(context: SpecRepositoryConfig, config: FsSpecRepositoryConfig)
  /**
   * Creates a new `FsSpecRepository` instance.
   *
   * @param contextOrConfig - Shared repository context or legacy config
   * @param config - Adapter options or undefined for legacy constructor
   */
  constructor(contextOrConfig: unknown, config?: unknown) {
    let context: SpecRepositoryConfig
    let parsedConfig: FsSpecRepositoryConfig
    if (config === undefined) {
      const legacy = contextOrConfig as SpecRepositoryConfig & {
        specsPath: string
        metadataPath: string
      }
      context = legacy
      parsedConfig = { path: legacy.specsPath, metadataPath: legacy.metadataPath }
    } else {
      context = contextOrConfig as SpecRepositoryConfig
      const typedConfig = config as {
        readonly path?: string
        readonly specsPath?: string
        readonly metadataPath?: string
      }
      const normalized = {
        path: typedConfig.path ?? typedConfig.specsPath,
        metadataPath: typedConfig.metadataPath,
      }
      parsedConfig = FsSpecOptionsSchema.parse(normalized)
    }

    super(context)

    // Verify paths exist on disk
    if (!existsSync(parsedConfig.path)) {
      throw new StorageDirectoryNotFoundError(parsedConfig.path, 'Specs directory does not exist')
    }
    if (!existsSync(parsedConfig.metadataPath)) {
      throw new StorageDirectoryNotFoundError(
        parsedConfig.metadataPath,
        'Metadata directory does not exist',
      )
    }

    this._specsPath = parsedConfig.path
    this._metadataPath = parsedConfig.metadataPath
    this._prefixSegments =
      context.prefix !== undefined ? context.prefix.split('/').filter((s) => s.length > 0) : []

    const source: SpecIndexSource = {
      walk: () => this._listAllSpecs(),
      metadata: (spec) => this.metadata(spec),
      artifact: (spec, filename) => this.artifact(spec, filename),
      sourceFileStamps: (spec) => this._computeSourceFileStamps(spec),
    }
    this._indexCache = new FsSpecIndexCache({
      bucketDir: path.join(context.configPath, 'tmp', 'fs-cache', 'specs', context.workspace),
      workspace: context.workspace,
      source,
    })
  }

  /**
   * Idempotently ensures `{configPath}/tmp/.gitignore` exists before this
   * repository writes anything under `tmp/fs-cache`.
   */
  private async _ensureGitignore(): Promise<void> {
    if (this._tmpGitignoreEnsured) return
    await ensureTmpGitignore(this.configPath())
    this._tmpGitignoreEnsured = true
  }

  /**
   * Walks the entire specs tree, returning every leaf spec directory.
   *
   * Used by {@link FsSpecIndexCache} to rebuild this workspace's index.
   *
   * @returns All specs under `specsPath`
   */
  private async _listAllSpecs(): Promise<Spec[]> {
    const specs: Spec[] = []
    await this._walk(this._specsPath, this._specsPath, specs)
    return specs
  }

  /**
   * Computes current mtimes for every file that spec-list materialization
   * depends on (artifact files, `metadata.json`, `spec-lock.json`).
   *
   * Missing files are omitted rather than erroring — a file that disappears
   * changes the stamp set length, which the freshness check already treats
   * as a mismatch.
   *
   * @param spec - The spec whose source files should be stamped
   * @returns Current mtime stamps, one per existing dependency file
   */
  private async _computeSourceFileStamps(spec: Spec): Promise<readonly SourceFileStamp[]> {
    const candidates: Array<{ filename: string; absPath: string }> = [
      ...spec.filenames.map((filename) => ({
        filename,
        absPath: path.join(this._specDir(spec.name), filename),
      })),
      { filename: 'metadata.json', absPath: this._metadataFilePath(spec.name) },
      { filename: SPEC_LOCK_FILENAME, absPath: this._specLockFilePath(spec.name) },
    ]

    const stamps: SourceFileStamp[] = []
    await Promise.all(
      candidates.map(async ({ filename, absPath }) => {
        try {
          const stat = await fs.stat(absPath)
          stamps.push({ filename, mtime: stat.mtime.toISOString() })
        } catch (err) {
          if (!isEnoent(err)) throw err
        }
      }),
    )
    return stamps
  }

  /** Canonical specs root path for this workspace repository. */
  get specsPath(): string {
    return this._specsPath
  }

  /** Logical prefix for specs in this workspace, when configured. */
  get prefix(): string | undefined {
    return this._prefixSegments.length > 0 ? this._prefixSegments.join('/') : undefined
  }

  /**
   * Returns the spec at the given path, or `null` if no such directory exists.
   *
   * @param name - The spec identity path (e.g. `SpecPath.parse("auth/oauth")`)
   * @returns Spec metadata with artifact filenames, or `null` if not found
   */
  override async get(name: SpecPath): Promise<Spec | null> {
    const dir = this._specDir(name)

    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const filenames = await filterFiles(dir, entries)
    return new Spec(this.workspace(), name, filenames)
  }

  /**
   * Lists all specs under `specsPath`, optionally filtered by a path prefix.
   *
   * Delegates to this workspace's fs-cache index; include flags are
   * projected from the full materialized payload without extra I/O.
   *
   * @param prefix - Optional path prefix to filter results
   * @param options - Pagination and include projection options
   * @returns Paginated matching specs in canonical path order
   */
  override async list(
    prefix?: SpecPath,
    options?: SpecListOptions,
  ): Promise<ListResult<SpecListEntry>> {
    await this._ensureGitignore()
    const filter =
      prefix !== undefined
        ? (entry: SpecListEntry) => {
            const prefixStr = prefix.toString()
            return entry.path === prefixStr || entry.path.startsWith(`${prefixStr}/`)
          }
        : undefined
    const result = await this._indexCache.list(options, filter)
    return {
      items: result.items.map((entry) => this._projectSpecInclude(entry, options)),
      meta: result.meta,
    }
  }

  /**
   * Returns the total number of specs in this workspace.
   *
   * @returns The total spec count
   */
  override async count(): Promise<number> {
    await this._ensureGitignore()
    return this._indexCache.count()
  }

  /**
   * Projects a fully-materialized entry down to the fields requested by `options`.
   *
   * @param entry - Full stored/materialized entry
   * @param options - Include projection options
   * @returns The projected entry
   */
  private _projectSpecInclude(entry: SpecListEntry, options?: SpecListOptions): SpecListEntry {
    const { summary, metadataStatus, ...rest } = entry
    return {
      ...rest,
      ...(options?.includeSummary && summary !== undefined ? { summary } : {}),
      ...(options?.includeMetadataStatus && metadataStatus !== undefined ? { metadataStatus } : {}),
    }
  }

  /**
   * Loads the content of a single artifact file within a spec directory.
   *
   * @param spec - The spec containing the artifact
   * @param filename - The artifact filename to load (e.g. `"spec.md"`)
   * @returns The artifact with its content and `originalHash`, or `null` if the file does not exist
   */
  override async artifact(spec: Spec, filename: string): Promise<SpecArtifact | null> {
    const filePath = resolveConfinedPath(
      this._specDir(spec.name),
      filename,
      allowedSpecArtifactFilenames(spec),
    )

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    Logger.debug('FsSpecRepository resolved expected artifact file', {
      workspace: this.workspace(),
      spec: spec.name.toString(),
      filename: normalizeRelativePath(filename),
    })
    return new SpecArtifact(filename, content, sha256(content))
  }

  /**
   * Writes a single artifact file into a spec directory.
   *
   * Creates the spec directory if it does not already exist. If
   * `artifact.originalHash` is set, the current file on disk is hashed and
   * compared before writing — a mismatch causes `ArtifactConflictError`
   * unless `options.force` is `true`.
   *
   * @param spec - The spec to write the artifact into
   * @param artifact - The artifact to save (filename + content)
   * @param options - Save options
   * @param options.force - When `true`, skip conflict detection and overwrite unconditionally
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  override async save(
    spec: Spec,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void> {
    if (this.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(
        `Cannot write to spec "${this.workspace()}:${spec.name.toString()}" — workspace "${this.workspace()}" is readOnly.`,
      )
    }

    const dir = this._specDir(spec.name)
    await fs.mkdir(dir, { recursive: true })

    const filePath = resolveConfinedPath(dir, artifact.filename, allowedSpecArtifactFilenames(spec))

    if (artifact.originalHash !== undefined && options?.force !== true) {
      let currentContent: string
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (isEnoent(err)) {
          currentContent = ''
        } else {
          throw err
        }
      }

      const currentHash = sha256(currentContent)
      if (currentHash !== artifact.originalHash) {
        throw new ArtifactConflictError(artifact.filename, artifact.content, currentContent)
      }
    }

    await writeFileAtomic(filePath, artifact.content)
    await this._indexCache.refresh(spec)
  }

  /**
   * Publishes the canonical artifact set for one spec through a staged directory swap.
   *
   * The current spec directory is copied into a staging directory, the new
   * artifact set is written there, and the canonical directory is swapped only
   * after all staged writes succeed. If the final swap fails, the canonical
   * directory is restored and the staging directory is preserved for manual
   * recovery.
   *
   * @param spec - The spec whose canonical artifacts are being published
   * @param publication - Final artifact bundle for the spec
   * @returns When publication completes successfully
   * @throws {ReadOnlyWorkspaceError} When the workspace is read-only
   * @throws {SpecPublicationError} When staged publication or final swap fails
   */
  override async publish(spec: Spec, publication: SpecPublication): Promise<void> {
    if (this.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(
        `Cannot write to spec "${this.workspace()}:${spec.name.toString()}" — workspace "${this.workspace()}" is readOnly.`,
      )
    }

    const specDir = this._specDir(spec.name)
    const parentDir = path.dirname(specDir)
    const dirName = path.basename(specDir)
    const stagingDir = path.join(parentDir, `${dirName}.staging-${randomUUID()}`)
    const backupDir = path.join(parentDir, `${dirName}.backup-${randomUUID()}`)
    const specId = `${this.workspace()}:${spec.name.toString()}`
    const specDirExists = await pathExists(specDir)

    await fs.mkdir(parentDir, { recursive: true })
    if (specDirExists) {
      await fs.cp(specDir, stagingDir, { recursive: true })
    } else {
      await fs.mkdir(stagingDir, { recursive: true })
    }

    try {
      for (const artifact of publication.artifacts) {
        const filePath = resolveConfinedPath(
          stagingDir,
          artifact.filename,
          allowedSpecArtifactFilenames(spec),
        )
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await writeFileAtomic(filePath, artifact.content)
      }

      if (
        publication.persistedSchema !== undefined ||
        publication.persistedDependsOn !== undefined ||
        publication.persistedImplementation !== undefined
      ) {
        const specLockPath = this._specLockFilePathInDir(stagingDir)
        const specLock: SpecLockData = {
          schema: publication.persistedSchema ?? { name: 'unknown', version: 0 },
          dependsOn: publication.persistedDependsOn ?? [],
          implementation: (publication.persistedImplementation ??
            []) as SpecLockImplementationEntry[],
        }
        await fs.mkdir(path.dirname(specLockPath), { recursive: true })
        await writeFileAtomic(specLockPath, JSON.stringify(specLock, null, 2) + '\n')
      }
    } catch (error) {
      throw new SpecPublicationError(specId, stagingDir, errorMessage(error))
    }

    try {
      if (specDirExists) {
        await fs.rename(specDir, backupDir)
      }

      try {
        await fs.rename(stagingDir, specDir)
      } catch (error) {
        if (specDirExists) {
          await fs.rename(backupDir, specDir).catch(() => {})
        }
        throw new SpecPublicationError(specId, stagingDir, errorMessage(error))
      }

      if (specDirExists) {
        await fs.rm(backupDir, { recursive: true, force: true })
      }
    } catch (error) {
      if (error instanceof SpecPublicationError) throw error
      throw new SpecPublicationError(specId, stagingDir, errorMessage(error))
    }

    await this._indexCache.refresh(spec)
  }

  /**
   * Deletes the entire spec directory and all its artifact files.
   *
   * No-ops silently if the directory does not exist.
   *
   * @param spec - The spec to delete
   */
  override async delete(spec: Spec): Promise<void> {
    const dir = this._specDir(spec.name)
    try {
      await fs.rm(dir, { recursive: true })
    } catch (err) {
      if (isEnoent(err)) return
      throw err
    }
    await this._indexCache.remove(spec.name.toFsPath('/'))
  }

  /**
   * Returns the parsed metadata for the given spec, or `null` if no metadata
   * file exists.
   *
   * Reads from `<metadataPath>/<specFsPath>/metadata.json`, parses via the
   * lenient schema, and attaches `originalHash` (SHA-256 of raw content).
   *
   * @param spec - The spec whose metadata to load
   * @returns Parsed metadata with `originalHash`, or `null` if absent
   */
  override async metadata(spec: Spec): Promise<PersistedSpecMetadata | null> {
    const filePath = this._metadataFilePath(spec.name)

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const hash = sha256(content)
    const persistedDependsOn = await this.readPersistedDependsOn(spec)

    try {
      const parsed = JSON.parse(content) as unknown
      const result = specMetadataSchema.safeParse(parsed)
      const metadata = result.success ? result.data : {}
      const freshness = await this._classifyMetadataFreshness(spec, metadata, persistedDependsOn)
      return { ...metadata, originalHash: hash, freshness } as PersistedSpecMetadata
    } catch {
      return { originalHash: hash, freshness: 'stale' }
    }
  }

  /**
   * Persists raw JSON metadata content for a spec.
   *
   * Writes to `<metadataPath>/<specFsPath>/metadata.json`. Creates the
   * directory if needed. Supports conflict detection via `originalHash`.
   *
   * @param spec - The spec to write metadata for
   * @param content - Raw JSON string to persist
   * @param options - Save options with optional conflict detection
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the current file on disk
   * @throws {ArtifactConflictError} On hash mismatch when `force` is not set
   */
  override async saveMetadata(
    spec: Spec,
    content: string,
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    if (this.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(
        `Cannot write to spec "${this.workspace()}:${spec.name.toString()}" — workspace "${this.workspace()}" is readOnly.`,
      )
    }

    const filePath = this._metadataFilePath(spec.name)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    if (options?.originalHash !== undefined && options.force !== true) {
      let currentContent: string
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (isEnoent(err)) {
          currentContent = ''
        } else {
          throw err
        }
      }

      const currentHash = sha256(currentContent)
      if (currentHash !== options.originalHash) {
        throw new ArtifactConflictError('metadata.json', content, currentContent)
      }
    }

    await writeFileAtomic(filePath, content)
    await this._indexCache.refresh(spec)
  }

  /**
   * Returns the persisted schema identity for the given spec, or `null` if absent.
   *
   * @param spec - The spec whose persisted schema to load
   * @returns The persisted schema identity, or `null` if absent
   */
  override async readPersistedSchema(
    spec: Spec,
  ): Promise<{ name: string; version: number } | null> {
    const data = await this._readSpecLock(spec)
    return data?.schema ?? null
  }

  /**
   * Returns the persisted dependencies for the given spec, or `null` if absent.
   *
   * @param spec - The spec whose persisted dependencies to load
   * @returns The persisted dependencies, or `null` if absent
   */
  override async readPersistedDependsOn(spec: Spec): Promise<readonly string[] | null> {
    const data = await this._readSpecLock(spec)
    return data?.dependsOn ?? null
  }

  /**
   * Returns the persisted implementation links for the given spec, or `null` if absent.
   *
   * @param spec - The spec whose persisted implementation links to load
   * @returns The persisted implementation links, or `null` if absent
   */
  override async readPersistedImplementation(
    spec: Spec,
  ): Promise<readonly { readonly file: string; readonly symbols?: readonly string[] }[] | null> {
    const data = await this._readSpecLock(spec)
    return (
      (data?.implementation as readonly {
        readonly file: string
        readonly symbols?: readonly string[]
      }[]) ?? null
    )
  }

  /**
   * Returns a stable hash representing the persisted spec state.
   *
   * @param spec - The spec whose stable hash to compute
   * @returns The stable hash, or `null` if absent
   */
  override async specHash(spec: Spec): Promise<string | null> {
    const filePath = this._specLockFilePath(spec.name)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      return sha256(content)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Updates the persisted schema identity for the given spec.
   *
   * @param spec - The spec whose persisted schema to update
   * @param schema - The new schema identity
   * @param schema.name - The schema name
   * @param schema.version - The schema version
   * @param options - Update options
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the persisted spec state
   */
  override async updatePersistedSchema(
    spec: Spec,
    schema: { name: string; version: number },
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const data = (await this._readSpecLock(spec)) ?? this._emptySpecLock()
    await this._saveSpecLock(spec, { ...data, schema }, options)
  }

  /**
   * Updates the persisted dependencies for the given spec.
   *
   * @param spec - The spec whose persisted dependencies to update
   * @param dependsOn - The new dependency list
   * @param options - Update options
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the persisted spec state
   */
  override async updatePersistedDependsOn(
    spec: Spec,
    dependsOn: readonly string[],
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const data = (await this._readSpecLock(spec)) ?? this._emptySpecLock()
    await this._saveSpecLock(spec, { ...data, dependsOn }, options)
  }

  /**
   * Updates the persisted implementation links for the given spec.
   *
   * @param spec - The spec whose persisted implementation links to update
   * @param implementation - The new implementation link list
   * @param options - Update options
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the persisted spec state
   */
  override async updatePersistedImplementation(
    spec: Spec,
    implementation: readonly { readonly file: string; readonly symbols?: readonly string[] }[],
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const data = (await this._readSpecLock(spec)) ?? this._emptySpecLock()
    await this._saveSpecLock(
      spec,
      {
        ...data,
        implementation: implementation as SpecLockImplementationEntry[],
      },
      options,
    )
  }

  /**
   * Returns the parsed `spec-lock.json` sidecar for the given spec, or `null`
   * when no sidecar exists.
   *
   * @param spec - The spec whose sidecar to load
   * @returns Parsed sidecar with `originalHash`, or `null` if absent
   */
  private async _readSpecLock(spec: Spec): Promise<SpecLockData | null> {
    const filePath = this._specLockFilePath(spec.name)

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    return { ...parseSpecLock(content), originalHash: sha256(content) }
  }

  /**
   * Persists `spec-lock.json` for the given spec.
   *
   * Supports optimistic conflict detection via `options.originalHash`.
   *
   * @param spec - The spec whose sidecar should be written
   * @param content - Parsed sidecar payload to persist
   * @param options - Save options
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the persisted spec state
   */
  private async _saveSpecLock(
    spec: Spec,
    content: SpecLockData,
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    if (this.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(
        `Cannot write to spec "${this.workspace()}:${spec.name.toString()}" — workspace "${this.workspace()}" is readOnly.`,
      )
    }

    const filePath = this._specLockFilePath(spec.name)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    if (options?.originalHash !== undefined && options.force !== true) {
      let currentContent: string
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (isEnoent(err)) {
          currentContent = ''
        } else {
          throw err
        }
      }

      const currentHash = sha256(currentContent)
      if (currentHash !== options.originalHash) {
        throw new ArtifactConflictError(SPEC_LOCK_FILENAME, JSON.stringify(content), currentContent)
      }
    }

    const { originalHash, ...persisted } = content
    void originalHash
    await writeFileAtomic(filePath, JSON.stringify(persisted, null, 2) + '\n')
    await this._indexCache.refresh(spec)
  }

  /**
   * Returns an empty spec lock data object.
   *
   * @returns An empty spec lock data object
   */
  private _emptySpecLock(): SpecLockData {
    return {
      schema: { name: 'unknown', version: 0 },
      dependsOn: [],
      implementation: [],
    }
  }

  /**
   * Classifies persisted metadata freshness for one spec.
   *
   * @param spec - The spec whose metadata is being evaluated
   * @param metadata - Parsed metadata object
   * @param persistedDependsOn - Persisted dependency state from semantic storage
   * @returns `'fresh'` when hashes and projected dependencies match, otherwise `'stale'`
   */
  private async _classifyMetadataFreshness(
    spec: Spec,
    metadata: Record<string, unknown>,
    persistedDependsOn: readonly string[] | null,
  ): Promise<'fresh' | 'stale'> {
    const freshness = await checkMetadataFreshness(
      isStringRecord(metadata.contentHashes) ? metadata.contentHashes : undefined,
      async (filename) => {
        const artifact = await this.artifact(spec, filename)
        return artifact?.content ?? null
      },
      sha256,
    )

    if (!freshness.allFresh) {
      return 'stale'
    }

    if (
      persistedDependsOn !== null &&
      (!Array.isArray(metadata.dependsOn) || !sameStringSet(metadata.dependsOn, persistedDependsOn))
    ) {
      return 'stale'
    }

    return 'fresh'
  }

  /**
   * Resolves a storage path to a spec identity within this workspace.
   *
   * When `inputPath` is relative (does not start with `/`), strips any
   * anchor fragment, resolves against the `from` spec's directory, and
   * returns the result without filesystem access. When `inputPath` is
   * absolute, validates via `fs.lstat` as before.
   *
   * @param inputPath - Absolute path or relative spec link
   * @param from - Reference spec for relative resolution
   * @returns The resolved spec path and ID, or `null` if no match
   */
  override async resolveFromPath(
    inputPath: string,
    from?: SpecPath,
  ): Promise<ResolveFromPathResult | null> {
    if (!path.isAbsolute(inputPath)) {
      return this._resolveRelative(inputPath, from)
    }

    if (inputPath !== this._specsPath && !inputPath.startsWith(this._specsPath + path.sep)) {
      return null
    }

    let dir: string
    try {
      const stat = await fs.lstat(inputPath)
      dir = stat.isDirectory() ? inputPath : path.dirname(inputPath)
    } catch {
      return null
    }

    if (dir === this._specsPath) return null

    const relative = path.relative(this._specsPath, dir)
    const segments = relative.split(path.sep).filter((s) => s.length > 0)
    if (segments.length === 0) return null

    const prefixed = [...this._prefixSegments, ...segments]
    const specPath = SpecPath.fromSegments(prefixed)
    const specId = this.workspace() + ':' + specPath.toString()
    return { specPath, specId }
  }

  /** @inheritdoc */
  override async reindex(): Promise<void> {
    await this._ensureGitignore()
    await this._indexCache.reindex()
  }

  /**
   * Marks this workspace's fs-cache index invalidated so the next
   * `list`/`count` rebuilds from disk.
   */
  override async invalidateCache(): Promise<void> {
    await this._indexCache.invalidate()
  }

  /**
   * Searches spec artifact content for the given query string.
   *
   * Iterates all specs, loads each artifact file, and performs
   * case-insensitive substring matching. Results are scored by match count
   * weighted by position (earlier matches score higher) and returned sorted
   * by descending score.
   *
   * @param query - The search query string
   * @param options - Search options
   * @param options.limit - Maximum number of results to return
   * @returns Matching specs with scores and match locations
   */
  override async search(query: string, options?: { limit?: number }): Promise<SpecSearchResult[]> {
    const limit = options?.limit
    const lowerQuery = query.toLowerCase()
    const listed = await this.list(undefined)
    const results: SpecSearchResult[] = []

    for (const entry of listed.items) {
      const spec = await this.get(SpecPath.parse(entry.path))
      if (spec === null) continue
      let score = 0
      const matches: SpecSearchMatch[] = []

      for (const filename of spec.filenames) {
        const artifact = await this.artifact(spec, filename)
        if (artifact === null) continue

        const content = artifact.content
        const lowerContent = content.toLowerCase()
        let searchOffset = 0

        while (searchOffset < lowerContent.length) {
          const idx = lowerContent.indexOf(lowerQuery, searchOffset)
          if (idx === -1) break

          const line = content.substring(0, idx).split('\n').length
          const snippetStart = Math.max(0, idx - 60)
          const snippetEnd = Math.min(content.length, idx + query.length + 60)
          const snippet = content.substring(snippetStart, snippetEnd)

          matches.push({ filename, line, snippet })
          const positionWeight = 1 / (1 + idx / content.length)
          score += 1 + positionWeight
          searchOffset = idx + 1
        }
      }

      if (matches.length > 0) {
        results.push({ spec, score, matches })
      }
    }

    results.sort((a, b) => b.score - a.score)

    if (limit !== undefined && limit > 0) {
      return results.slice(0, limit)
    }

    return results
  }

  /**
   * Resolves a relative spec link (e.g. `../storage/spec.md`) to a spec
   * identity, using `from` as the reference point. Pure computation, no I/O.
   *
   * When the path escapes the workspace (more `..` than parent segments),
   * returns a `crossWorkspaceHint` with the remaining forward segments
   * so the caller can try other repositories.
   *
   * @param relativePath - Relative path, possibly with anchor fragment
   * @param from - The spec from which the link originates
   * @returns Resolved result, cross-workspace hint, or `null`
   */
  private _resolveRelative(relativePath: string, from?: SpecPath): ResolveFromPathResult | null {
    if (from === undefined) return null

    // Strip anchor fragments
    const cleanPath = relativePath.replace(/#.*$/, '')

    // Must end with /spec.md and start with ../
    if (!cleanPath.startsWith('../') || !cleanPath.endsWith('/spec.md')) return null

    // Remove trailing /spec.md and split into segments
    const rawParts = cleanPath.slice(0, -'/spec.md'.length).split('/')

    // Resolve against the from spec's directory
    const baseParts = from.toString().split('/')

    const forwardParts: string[] = []
    let escaped = false

    for (const part of rawParts) {
      if (part === '..') {
        if (baseParts.length === 0) {
          escaped = true
        } else {
          baseParts.pop()
        }
      } else if (part !== '.') {
        forwardParts.push(part)
      }
    }

    // If baseParts is empty, the path reached or crossed the workspace root
    if (escaped || baseParts.length === 0) {
      return forwardParts.length > 0 ? { crossWorkspaceHint: forwardParts } : null
    }

    const segments = [...baseParts, ...forwardParts]
    if (segments.length === 0) return null

    const specPath = SpecPath.fromSegments(segments)
    const specId = this.workspace() + ':' + specPath.toString()
    return { specPath, specId }
  }

  // ---- Private helpers ----

  /**
   * Returns the absolute path to the spec directory for the given spec name.
   *
   * When a prefix is configured, strips the prefix segments from the front
   * of the spec name before computing the filesystem path. For example,
   * with prefix `_global`, name `_global/architecture` → fs path `architecture/`.
   *
   * @param name - The spec identity path (possibly prefixed)
   * @returns Absolute path to the spec directory
   */
  private _specDir(name: SpecPath): string {
    if (this._prefixSegments.length > 0) {
      const nameSegments = name.toString().split('/')
      const namePrefix = nameSegments.slice(0, this._prefixSegments.length)
      if (namePrefix.join('/') !== this._prefixSegments.join('/')) {
        // prefix doesn't match — use full name
        return path.join(this._specsPath, name.toFsPath(path.sep))
      }
      const stripped = nameSegments.slice(this._prefixSegments.length)
      return path.join(this._specsPath, ...stripped)
    }
    return path.join(this._specsPath, name.toFsPath(path.sep))
  }

  /**
   * Returns the absolute path to the metadata file for the given spec name.
   *
   * @param name - The spec identity path
   * @returns Absolute path to `<metadataPath>/<specFsPath>/metadata.json`
   */
  private _metadataFilePath(name: SpecPath): string {
    return path.join(this._metadataPath, this.workspace(), name.toFsPath(path.sep), 'metadata.json')
  }

  /**
   * Returns the absolute path to `spec-lock.json` for the given spec name.
   *
   * @param name - Logical spec path
   * @returns Absolute sidecar path inside the canonical spec directory
   */
  private _specLockFilePath(name: SpecPath): string {
    return this._specLockFilePathInDir(this._specDir(name))
  }

  /**
   * Returns the absolute path to `spec-lock.json` for the given spec root.
   *
   * @param specDir - Concrete spec directory root to target
   * @returns Absolute sidecar path
   */
  private _specLockFilePathInDir(specDir: string): string {
    return path.join(specDir, SPEC_LOCK_FILENAME)
  }

  /**
   * Recursively walks a directory tree, collecting `Spec` entries for every
   * leaf directory that contains at least one file.
   *
   * A "leaf" directory is one whose direct children include at least one
   * regular file. Directories that contain only subdirectories are
   * intermediate path segments and are not returned as specs.
   *
   * @param dir - Absolute path to the current directory being walked
   * @param root - Absolute path to the specs root (used to derive the `SpecPath`)
   * @param results - Accumulator array to push discovered specs into
   */
  private async _walk(dir: string, root: string, results: Spec[]): Promise<void> {
    Logger.debug(`[FsSpecRepository] _walk walking dir: ${dir}`)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) {
        Logger.debug(`[FsSpecRepository] _walk dir does not exist (ENOENT): ${dir}`)
        return
      }
      Logger.debug(`[FsSpecRepository] _walk dir readdir failed for ${dir}: ${String(err)}`)
      throw err
    }

    const files: string[] = []
    const subdirs: string[] = []

    const stats = await Promise.all(
      entries.map(async (entry) => {
        try {
          const stat = await fs.lstat(path.join(dir, entry))
          return { entry, isDir: stat.isDirectory(), isFile: stat.isFile() }
        } catch {
          return { entry, isDir: false, isFile: false }
        }
      }),
    )
    for (const { entry, isDir, isFile } of stats) {
      if (isDir) subdirs.push(entry)
      else if (isFile && entry !== SPEC_LOCK_FILENAME) files.push(entry)
    }

    if (files.length > 0) {
      // This is a leaf spec directory — compute the SpecPath relative to root
      const rel = path.relative(root, dir)
      const segments = rel.split(path.sep).filter((s) => s.length > 0)
      if (segments.length > 0) {
        const prefixed = [...this._prefixSegments, ...segments]
        const specPath = SpecPath.fromSegments(prefixed)
        results.push(new Spec(this.workspace(), specPath, files))
      }
    }

    for (const subdir of subdirs) {
      await this._walk(path.join(dir, subdir), root, results)
    }
  }
}

/**
 * Returns whether the given path currently exists.
 *
 * @param targetPath - Absolute filesystem path to probe
 * @returns `true` when the path exists
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * Normalizes an unknown error value into a display-safe message.
 *
 * @param error - Unknown thrown value
 * @returns Human-readable message
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Filters a list of directory entry names to include only regular files.
 *
 * @param dir - Absolute path to the parent directory
 * @param entries - Entry names to filter
 * @returns Names of entries that are regular files
 */
async function filterFiles(dir: string, entries: string[]): Promise<string[]> {
  const checks = await Promise.all(
    entries.map(async (entry) => {
      try {
        const stat = await fs.lstat(path.join(dir, entry))
        return { entry, isFile: stat.isFile() }
      } catch {
        return { entry, isFile: false }
      }
    }),
  )
  return checks.filter((c) => c.isFile && c.entry !== SPEC_LOCK_FILENAME).map((c) => c.entry)
}

/**
 * Returns the allowed normal artifact filenames for a spec.
 *
 * @param spec - Spec whose artifact API surface is being constrained
 * @returns Allowed normalized basenames for `artifact()` and `save()`
 */
function allowedSpecArtifactFilenames(spec: Spec): ReadonlySet<string> {
  const allowed = new Set<string>(['spec.md', 'verify.md'])
  for (const filename of spec.filenames) {
    const normalized = normalizeRelativePath(filename)
    if (normalized === SPEC_LOCK_FILENAME) continue
    allowed.add(normalized)
  }
  return allowed
}

/**
 * Checks whether a value is a string-to-string record.
 *
 * @param value - Candidate record
 * @returns `true` when every enumerable value is a string
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
}

/**
 * Compares two dependency lists ignoring order.
 *
 * @param left - First list
 * @param right - Second list
 * @returns `true` when both lists contain the same entries
 */
function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((entry, index) => entry === sortedRight[index])
}
