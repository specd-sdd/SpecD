import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { StorageDirectoryNotFoundError } from '../../domain/errors/index.js'
import { randomUUID } from 'node:crypto'
import { Spec, type SpecArtifactEntry, type SpecSidecarStamp } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { SpecMetadataParseError } from '../../domain/errors/spec-metadata-parse-error.js'
import { SpecPublicationError } from '../../domain/errors/spec-publication-error.js'
import {
  specMetadataSchema,
  type MetadataSnapshot,
  type SpecMetadata,
} from '../../domain/services/parse-metadata.js'
import {
  type PersistedSpecState,
  type PersistedSpecStateSnapshot,
} from '../../domain/services/apply-persisted-spec-state-patch.js'
import { parseSpecLock, type SpecLockData } from '../../domain/services/parse-spec-lock.js'
import {
  SpecRepository,
  type ArtifactMeta,
  type GeneratedMetadataMeta,
  type PersistedStateMeta,
  type SpecMetaOptions,
  type SpecRepositoryConfig as BaseSpecRepositoryConfig,
  type SpecPublication,
  type ResolveFromPathResult,
  type SpecSearchResult,
  type SpecSearchMatch,
  type SpecListEntry,
  type SpecListOptions,
} from '../../application/ports/spec-repository.js'
import { type ListResult } from '../../application/ports/repository.js'
import { projectListMetaFromSourceFiles } from './project-list-meta.js'
import { Logger } from '../../application/logger.js'
import { isEnoent } from './is-enoent.js'
import { normalizeRelativePath, resolveConfinedPath } from './path-confinement.js'
import { writeFileAtomic } from './write-atomic.js'
import { sha256 } from './hash.js'
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
      readMetadataSnapshot: (spec) => this.readMetadataSnapshot(spec),
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
      ...spec.artifacts.map((artifact) => ({
        filename: artifact.filename,
        absPath: path.join(this._specDir(spec.name), artifact.filename),
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
    return this._buildSpec(name, dir, filenames)
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

    if (options?.includeMeta === true) {
      const listed = await this._indexCache.listWithSourceFiles(options, filter)
      return {
        items: listed.items.map(({ entry, sourceFiles }) =>
          this._projectSpecInclude(entry, options, sourceFiles),
        ),
        meta: listed.meta,
      }
    }

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
   * @param sourceFiles - Indexed source file stamps when `includeMeta` is requested
   * @returns The projected entry
   */
  private _projectSpecInclude(
    entry: SpecListEntry,
    options?: SpecListOptions,
    sourceFiles?: readonly SourceFileStamp[],
  ): SpecListEntry {
    const { summary, ...rest } = entry
    const projected: SpecListEntry = {
      ...rest,
      ...(options?.includeSummary && summary !== undefined ? { summary } : {}),
    }

    if (options?.includeMeta === true && sourceFiles !== undefined) {
      return {
        ...projected,
        ...projectListMetaFromSourceFiles(sourceFiles),
      }
    }

    return projected
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
    if (!specDirExists && publication.artifacts.length === 0) {
      throw new SpecPublicationError(
        specId,
        stagingDir,
        `Cannot publish spec "${specId}" because no artifacts were provided for a new spec.`,
      )
    }

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

      const specLockPath = this._specLockFilePathInDir(stagingDir)
      await fs.mkdir(path.dirname(specLockPath), { recursive: true })
      await writeFileAtomic(specLockPath, serializeSpecLock(publication.persistedState))
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
   * Reads the exact persisted semantic state, or `null` when no lock exists.
   *
   * @param spec - The spec whose lock file to read
   * @returns Parsed persisted state snapshot, or `null` when absent
   */
  override async readPersistedState(spec: Spec): Promise<PersistedSpecStateSnapshot | null> {
    const data = await this._readSpecLock(spec)
    if (data === null) return null
    return toPersistedStateSnapshot(data)
  }

  /**
   * Conditionally replaces the complete persisted state in `spec-lock.json`.
   *
   * @param spec - The spec whose lock file to write
   * @param state - Complete persisted state to serialize
   * @param options - Revision guard for optimistic concurrency
   * @param options.expectedRevision - Required current lock hash, or `null` to create
   * @returns Written state snapshot including the new content hash
   */
  override async writePersistedState(
    spec: Spec,
    state: PersistedSpecState,
    options: { readonly expectedRevision: string | null },
  ): Promise<PersistedSpecStateSnapshot> {
    if (this.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(
        `Cannot write to spec "${this.workspace()}:${spec.name.toString()}" — workspace "${this.workspace()}" is readOnly.`,
      )
    }

    const filePath = this._specLockFilePath(spec.name)
    const current = await this._readSpecLock(spec)
    const content = serializeSpecLock(state)

    if (options.expectedRevision === null) {
      if (current !== null) {
        const currentContent = await fs.readFile(filePath, 'utf8')
        throw new ArtifactConflictError(SPEC_LOCK_FILENAME, content, currentContent)
      }
    } else if (current === null || current.originalHash !== options.expectedRevision) {
      let currentContent = ''
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (!isEnoent(err)) throw err
      }
      throw new ArtifactConflictError(SPEC_LOCK_FILENAME, content, currentContent)
    }

    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await writeFileAtomic(filePath, content)
    await this._indexCache.refresh(spec)

    return { ...state, originalHash: sha256(content) }
  }

  /**
   * Returns physical artifact metadata for one filename, or `null` when absent.
   *
   * @param spec - The spec containing the artifact
   * @param filename - Artifact basename to inspect
   * @param options - Whether to include a content hash
   * @returns Artifact metadata, or `null` when the file is absent
   */
  override async artifactMeta(
    spec: Spec,
    filename: string,
    options?: SpecMetaOptions,
  ): Promise<ArtifactMeta | null> {
    const filePath = resolveConfinedPath(
      this._specDir(spec.name),
      filename,
      allowedSpecArtifactFilenames(spec),
    )

    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(filePath)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const lastModified = stat.mtime.toISOString()
    if (options?.includeHash !== true) {
      return { lastModified }
    }

    const fileContent = await fs.readFile(filePath, 'utf8')
    return {
      lastModified,
      hash: sha256(fileContent),
    }
  }

  /**
   * Cheap observation of the persisted semantic state sidecar.
   *
   * @param spec - The spec whose lock file to inspect
   * @param options - Whether to include a content hash
   * @returns Sidecar metadata, or `null` when absent
   */
  override async persistedStateMeta(
    spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<PersistedStateMeta | null> {
    return this._sidecarMeta(this._specLockFilePath(spec.name), options)
  }

  /**
   * Cheap observation of the generated metadata cache file.
   *
   * @param spec - The spec whose metadata file to inspect
   * @param options - Whether to include a content hash
   * @returns Sidecar metadata, or `null` when absent
   */
  override async generatedMetadataMeta(
    spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<GeneratedMetadataMeta | null> {
    return this._sidecarMeta(this._metadataFilePath(spec.name), options)
  }

  /**
   * Returns lastModified and optional hash for one sidecar path.
   *
   * @param filePath - Absolute sidecar file path
   * @param options - Whether to include a content hash
   * @returns Sidecar Meta, or `null` when absent
   */
  private async _sidecarMeta(
    filePath: string,
    options?: SpecMetaOptions,
  ): Promise<PersistedStateMeta | null> {
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(filePath)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const lastModified = stat.mtime.toISOString()
    if (options?.includeHash !== true) {
      return { lastModified }
    }

    const content = await fs.readFile(filePath, 'utf8')
    return {
      lastModified,
      hash: sha256(content),
    }
  }

  /**
   * Reads the exact persisted metadata observation.
   *
   * @param spec - The spec whose metadata file to read
   * @returns Present, missing, or invalid metadata snapshot
   */
  override async readMetadataSnapshot(spec: Spec): Promise<MetadataSnapshot> {
    const filePath = this._metadataFilePath(spec.name)
    const specId = `${this.workspace()}:${spec.name.toString()}`

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return { kind: 'missing', revision: null }
      throw err
    }

    const revision = sha256(content)
    try {
      const parsed = JSON.parse(content) as unknown
      const result = specMetadataSchema.safeParse(parsed)
      if (!result.success) {
        const issues = result.error.issues.map((issue) => issue.message).join('; ')
        return {
          kind: 'invalid',
          revision,
          error: new SpecMetadataParseError(specId, issues),
        }
      }
      return { kind: 'present', metadata: result.data as SpecMetadata, revision }
    } catch (err) {
      return {
        kind: 'invalid',
        revision,
        error: new SpecMetadataParseError(specId, err instanceof Error ? err.message : String(err)),
      }
    }
  }

  /**
   * Writes one complete metadata projection. Read-only workspaces still permit this write.
   *
   * @param spec - The spec whose metadata file to write
   * @param metadata - Complete metadata projection to serialize
   * @param options - Revision guard for optimistic concurrency
   * @param options.expectedRevision - Required current metadata hash, or `null` to create
   * @returns Written metadata snapshot including the new revision hash
   */
  override async writeMetadataSnapshot(
    spec: Spec,
    metadata: SpecMetadata,
    options: { readonly expectedRevision: string | null },
  ): Promise<MetadataSnapshot> {
    const filePath = this._metadataFilePath(spec.name)
    const current = await this.readMetadataSnapshot(spec)
    const content = serializeMetadataSnapshot(metadata)

    if (options.expectedRevision === null) {
      if (current.kind !== 'missing') {
        const currentContent =
          current.kind === 'present'
            ? serializeMetadataSnapshot(current.metadata)
            : await fs.readFile(filePath, 'utf8').catch(() => '')
        throw new ArtifactConflictError('metadata.json', content, currentContent)
      }
    } else if (current.revision !== options.expectedRevision) {
      const currentContent =
        current.kind === 'present'
          ? serializeMetadataSnapshot(current.metadata)
          : await fs.readFile(filePath, 'utf8').catch(() => '')
      throw new ArtifactConflictError('metadata.json', content, currentContent)
    }

    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await writeFileAtomic(filePath, content)
    await this._indexCache.refresh(spec)

    return { kind: 'present', metadata, revision: sha256(content) }
  }

  /** @inheritdoc */
  override async specFingerprint(spec: Spec): Promise<string> {
    const persistedStateHash =
      (await this.persistedStateMeta(spec, { includeHash: true }))?.hash ?? null
    const sortedArtifacts = [...spec.artifacts].sort((a, b) => a.filename.localeCompare(b.filename))
    const artifactEntries: Array<{ filename: string; contentHash: string }> = []
    for (const entry of sortedArtifacts) {
      const artifact = await this.artifact(spec, entry.filename)
      if (artifact !== null) {
        artifactEntries.push({ filename: entry.filename, contentHash: sha256(artifact.content) })
      }
    }
    const canonical = sortFingerprintKeys({
      artifacts: artifactEntries,
      persistedStateHash: persistedStateHash ?? '__absent__',
    })
    return sha256(JSON.stringify(canonical))
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

      for (const artifact of spec.artifacts) {
        const filename = artifact.filename
        const loaded = await this.artifact(spec, filename)
        if (loaded === null) continue

        const content = loaded.content
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
   * Builds a {@link Spec} with artifact and sidecar stamps from a spec directory.
   *
   * @param name - Logical spec path
   * @param dir - Absolute spec directory path
   * @param filenames - Artifact basenames in the directory
   * @returns Spec metadata with stamps
   */
  private async _buildSpec(
    name: SpecPath,
    dir: string,
    filenames: readonly string[],
  ): Promise<Spec> {
    const artifacts: SpecArtifactEntry[] = await Promise.all(
      filenames.map(async (filename) => {
        const stat = await fs.stat(path.join(dir, filename))
        return { filename, lastModified: stat.mtime.toISOString() }
      }),
    )
    const persistedStateStamp = await this._statSidecar(this._specLockFilePath(name))
    const generatedMetadataStamp = await this._statSidecar(this._metadataFilePath(name))
    return new Spec(this.workspace(), name, artifacts, persistedStateStamp, generatedMetadataStamp)
  }

  /**
   * Returns presence and mtime for one sidecar path.
   *
   * @param absPath - Absolute sidecar file path
   * @returns Sidecar stamp; absent files encode `present: false`
   */
  private async _statSidecar(absPath: string): Promise<SpecSidecarStamp> {
    try {
      const stat = await fs.stat(absPath)
      return { present: true, lastModified: stat.mtime.toISOString() }
    } catch (err) {
      if (isEnoent(err)) return { present: false, lastModified: null }
      throw err
    }
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
        results.push(await this._buildSpec(specPath, dir, files))
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
  for (const artifact of spec.artifacts) {
    const normalized = normalizeRelativePath(artifact.filename)
    if (normalized === SPEC_LOCK_FILENAME) continue
    allowed.add(normalized)
  }
  return allowed
}

/**
 * Serializes complete persisted state into canonical `spec-lock.json` bytes.
 *
 * @param state - Complete persisted state to serialize
 * @returns Canonical JSON with trailing newline
 */
function serializeSpecLock(state: PersistedSpecState): string {
  const payload: Record<string, unknown> = {
    schema: state.schema,
    dependsOn: state.dependsOn,
    implementation: state.implementation,
  }
  if (state.optimizations !== undefined) {
    payload.optimizations = state.optimizations
  }
  return JSON.stringify(payload, null, 2) + '\n'
}

/**
 * Serializes metadata into canonical `metadata.json` bytes.
 *
 * @param metadata - Metadata projection to serialize
 * @returns Canonical JSON with trailing newline
 */
function serializeMetadataSnapshot(metadata: SpecMetadata): string {
  return JSON.stringify(metadata, null, 2) + '\n'
}

/**
 * Converts parsed lock data into a persisted-state snapshot.
 *
 * @param data - Parsed lock sidecar data
 * @returns Persisted state snapshot including content hash
 */
function toPersistedStateSnapshot(data: SpecLockData): PersistedSpecStateSnapshot {
  const { originalHash, schema, dependsOn, implementation, optimizations } = data
  return {
    schema,
    dependsOn,
    implementation,
    ...(optimizations !== undefined ? { optimizations } : {}),
    originalHash: originalHash!,
  }
}

/**
 * Recursively sorts object keys for stable spec fingerprint JSON.
 *
 * @param value - Value to canonicalize
 * @returns Canonicalized value with sorted object keys
 */
function sortFingerprintKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortFingerprintKeys(entry))
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortFingerprintKeys(record[key])
    }
    return sorted
  }
  return value
}
