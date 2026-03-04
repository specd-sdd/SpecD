import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { Change } from '../../domain/entities/change.js'
import { type ChangeEvent } from '../../domain/entities/change.js'
import { ChangeArtifact, SKIPPED_SENTINEL } from '../../domain/entities/change-artifact.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import {
  ChangeRepository,
  type ChangeRepositoryConfig,
} from '../../application/ports/change-repository.js'
import { changeDirName } from './dir-name.js'
import { sha256 } from './hash.js'
import { isEnoent } from './is-enoent.js'
import { type ChangeManifest, type ManifestArtifact, type RawChangeEvent } from './manifest.js'

/**
 * Configuration for `FsChangeRepository`.
 *
 * Extends the base `ChangeRepositoryConfig` with the three storage directory
 * paths that `FsChangeRepository` manages.
 */
export interface FsChangeRepositoryConfig extends ChangeRepositoryConfig {
  /** Absolute path to the `changes/` directory for active changes. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory for shelved changes. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory for abandoned changes. */
  readonly discardedPath: string
  /**
   * Active schema name and version — used to emit a warning when a loaded
   * manifest records a different schema. Advisory only; the change remains usable.
   */
  readonly activeSchema?: { name: string; version: number }
}

/**
 * Filesystem implementation of `ChangeRepository`.
 *
 * Each change is stored as a directory named `YYYYMMDD-HHmmss-<name>` under
 * one of three paths — `changes/`, `drafts/`, or `discarded/` — depending on
 * the change's lifecycle state. The timestamp prefix is a filesystem-only
 * convention that enables chronological sorting; it never appears in the domain
 * model, the manifest, or CLI arguments.
 *
 * The manifest is written atomically (temp file + rename) to prevent partial
 * reads if the process is interrupted mid-write.
 */
export class FsChangeRepository extends ChangeRepository {
  private readonly _changesPath: string
  private readonly _draftsPath: string
  private readonly _discardedPath: string
  private readonly _activeSchema: { name: string; version: number } | undefined

  /**
   * Creates a new `FsChangeRepository` instance.
   *
   * @param config - Storage paths, workspace configuration, and optional active schema
   */
  constructor(config: FsChangeRepositoryConfig) {
    super(config)
    this._changesPath = config.changesPath
    this._draftsPath = config.draftsPath
    this._discardedPath = config.discardedPath
    this._activeSchema = config.activeSchema
  }

  /**
   * Returns the change with the given name, searching `changes/` then `drafts/`.
   * Returns `null` if not found.
   *
   * @param name - The change slug name to look up
   * @returns The change with current artifact state, or `null` if not found
   */
  override async get(name: string): Promise<Change | null> {
    const dir = await this._resolveDir(name)
    if (dir === null) return null

    const manifest = await this._loadManifest(dir)
    this._warnOnSchemaMismatch(name, manifest)
    return this._manifestToChange(manifest, dir)
  }

  /**
   * Lists all active (non-drafted, non-discarded) changes, oldest first.
   *
   * @returns All active changes in this workspace, sorted by creation order
   */
  override async list(): Promise<Change[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this._changesPath)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const dirs = await filterDirectories(this._changesPath, entries)
    dirs.sort()

    const changes: Change[] = []
    for (const dirName of dirs) {
      const dir = path.join(this._changesPath, dirName)
      const manifest = await this._loadManifest(dir)
      changes.push(await this._manifestToChange(manifest, dir))
    }
    return changes
  }

  /**
   * Lists all drafted (shelved) changes, oldest first.
   *
   * @returns All drafted changes in this workspace, sorted by creation order
   */
  override async listDrafts(): Promise<Change[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this._draftsPath)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const dirs = await filterDirectories(this._draftsPath, entries)
    dirs.sort()

    const changes: Change[] = []
    for (const dirName of dirs) {
      const dir = path.join(this._draftsPath, dirName)
      const manifest = await this._loadManifest(dir)
      changes.push(await this._manifestToChange(manifest, dir))
    }
    return changes
  }

  /**
   * Lists all discarded changes, oldest first.
   *
   * @returns All discarded changes in this workspace, sorted by creation order
   */
  override async listDiscarded(): Promise<Change[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this._discardedPath)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const dirs = await filterDirectories(this._discardedPath, entries)
    dirs.sort()

    const changes: Change[] = []
    for (const dirName of dirs) {
      const dir = path.join(this._discardedPath, dirName)
      const manifest = await this._loadManifest(dir)
      changes.push(await this._manifestToChange(manifest, dir))
    }
    return changes
  }

  /**
   * Persists the change manifest, moving the change directory between
   * `changes/`, `drafts/`, or `discarded/` as the lifecycle state requires.
   *
   * @param change - The change whose manifest should be persisted
   */
  override async save(change: Change): Promise<void> {
    const manifest = changeToManifest(change)
    const dirName = changeDirName(change.name, change.createdAt)

    const targetDir = this._targetDir(change, dirName)

    // Determine current location (if any)
    const currentDir = await this._resolveDir(change.name)

    if (currentDir === null) {
      // First save: create directory and write manifest
      await fs.mkdir(targetDir, { recursive: true })
    } else if (currentDir !== targetDir) {
      // Move to new location (draft ↔ active, or to discarded)
      await fs.rename(currentDir, targetDir)
    }

    await this._writeManifestAtomic(targetDir, manifest)
  }

  /**
   * Deletes the entire change directory and all its contents.
   *
   * @param change - The change to delete
   */
  override async delete(change: Change): Promise<void> {
    const dir = await this._resolveDir(change.name)
    if (dir === null) return
    await fs.rm(dir, { recursive: true })
  }

  /**
   * Loads the content of a single artifact file within a change directory.
   *
   * The returned `SpecArtifact` has `originalHash` set to `sha256(content)`,
   * enabling conflict detection in `saveArtifact()`.
   *
   * @param change - The change containing the artifact
   * @param filename - The artifact filename to load (e.g. `"proposal.md"`)
   * @returns The artifact with content and `originalHash`, or `null` if the file does not exist
   */
  override async artifact(change: Change, filename: string): Promise<SpecArtifact | null> {
    const dir = await this._resolveDir(change.name)
    if (dir === null) return null

    const filePath = path.join(dir, filename)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    return new SpecArtifact(filename, content, sha256(content))
  }

  /**
   * Writes an artifact file within a change directory.
   *
   * If `artifact.originalHash` is set, the current file on disk is hashed and
   * compared before writing. A mismatch causes `ArtifactConflictError` unless
   * `options.force` is `true`.
   *
   * @param change - The change to write the artifact into
   * @param artifact - The artifact to save (filename + content)
   * @param options - Save options
   * @param options.force - When `true`, skip conflict detection and overwrite unconditionally
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  override async saveArtifact(
    change: Change,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void> {
    const dir = await this._resolveDir(change.name)
    if (dir === null) {
      throw new Error(`Change directory not found for change "${change.name}" — call save() first`)
    }

    const filePath = path.join(dir, artifact.filename)

    if (artifact.originalHash !== undefined && options?.force !== true) {
      // Conflict check: read current content and compare hashes
      let currentContent: string
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (isEnoent(err)) {
          // File doesn't exist yet — treat as no conflict (no originalHash would
          // be set if the file was new, but if it is set we still allow the write
          // since the file was deleted externally, which isn't a concurrent modification)
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

    await fs.writeFile(filePath, artifact.content, 'utf8')
  }

  // ---- Private helpers ----

  /**
   * Resolves the on-disk directory for a change by scanning `changes/`,
   * `drafts/`, and `discarded/` for an entry ending in `-<name>`.
   *
   * @param name - The change slug name to search for
   * @returns The absolute path to the change directory, or `null` if not found
   */
  private async _resolveDir(name: string): Promise<string | null> {
    const suffix = `-${name}`

    for (const basePath of [this._changesPath, this._draftsPath, this._discardedPath]) {
      let entries: string[]
      try {
        entries = await fs.readdir(basePath)
      } catch (err) {
        if (isEnoent(err)) continue
        throw err
      }

      const match = entries.find((entry) => entry.endsWith(suffix))
      if (match !== undefined) {
        return path.join(basePath, match)
      }
    }

    return null
  }

  /**
   * Determines the target directory for `save()` based on the change's lifecycle state.
   *
   * @param change - The change whose target directory is needed
   * @param dirName - The pre-computed `YYYYMMDD-HHmmss-<name>` directory name
   * @returns Absolute path to the target directory
   */
  private _targetDir(change: Change, dirName: string): string {
    if (isDiscardedChange(change)) return path.join(this._discardedPath, dirName)
    if (change.isDrafted) return path.join(this._draftsPath, dirName)
    return path.join(this._changesPath, dirName)
  }

  /**
   * Reads, JSON-parses, and validates `manifest.json` from the given directory.
   *
   * @param dir - Absolute path to the change directory
   * @returns The parsed and validated `ChangeManifest`
   * @throws {Error} If the manifest structure is invalid
   */
  private async _loadManifest(dir: string): Promise<ChangeManifest> {
    const content = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
    const raw: unknown = JSON.parse(content)
    const result = changeManifestSchema.safeParse(raw)
    if (!result.success) {
      throw new Error(
        `Invalid manifest.json in ${dir}: ${result.error.issues.map((i) => i.message).join(', ')}`,
      )
    }
    return result.data as ChangeManifest
  }

  /**
   * Writes `manifest.json` atomically via a temp file + rename.
   *
   * @param dir - Absolute path to the change directory
   * @param manifest - The manifest data to write
   */
  private async _writeManifestAtomic(dir: string, manifest: ChangeManifest): Promise<void> {
    const manifestPath = path.join(dir, 'manifest.json')
    const tmpPath = path.join(dir, `manifest.json.tmp-${process.pid.toString()}-${randomUUID()}`)
    const content = JSON.stringify(manifest, null, 2)
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, manifestPath)
  }

  /**
   * Reconstructs a `Change` domain entity from a persisted manifest.
   *
   * Artifact status is derived by comparing the current file hash on disk
   * against the stored `validatedHash` — it is never stored directly.
   *
   * @param manifest - The parsed manifest data
   * @param dir - Absolute path to the change directory (used for artifact status derivation)
   * @returns A fully reconstructed `Change` entity with current artifact state
   */
  private async _manifestToChange(manifest: ChangeManifest, dir: string): Promise<Change> {
    const artifactMap = new Map<string, ChangeArtifact>()

    for (const raw of manifest.artifacts) {
      const status = await this._deriveArtifactStatus(raw, dir)
      const artifactProps = {
        type: raw.type,
        filename: raw.filename,
        optional: raw.optional,
        requires: raw.requires,
        status,
        ...(raw.validatedHash !== null ? { validatedHash: raw.validatedHash } : {}),
      }
      const artifact = new ChangeArtifact(artifactProps)
      artifactMap.set(artifact.type, artifact)
    }

    const history = manifest.history.map(deserializeEvent)

    return new Change({
      name: manifest.name,
      createdAt: new Date(manifest.createdAt),
      ...(manifest.description !== undefined ? { description: manifest.description } : {}),
      workspaces: manifest.workspaces,
      specIds: manifest.specIds,
      contextSpecIds: manifest.contextSpecIds ?? [],
      history,
      artifacts: artifactMap,
    })
  }

  /**
   * Derives the `ArtifactStatus` for a manifest artifact entry by inspecting
   * `validatedHash` and the presence and content of the artifact file on disk.
   *
   * @param artifact - The manifest artifact descriptor
   * @param dir - Absolute path to the change directory
   * @returns The derived `ArtifactStatus`
   */
  private async _deriveArtifactStatus(
    artifact: ManifestArtifact,
    dir: string,
  ): Promise<ArtifactStatus> {
    if (artifact.validatedHash === SKIPPED_SENTINEL) return 'skipped'

    const filePath = path.join(dir, artifact.filename)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return 'missing'
      throw err
    }

    if (artifact.validatedHash === null) return 'in-progress'

    const currentHash = sha256(content)
    return currentHash === artifact.validatedHash ? 'complete' : 'in-progress'
  }

  /**
   * Emits a `console.warn` when the manifest's schema differs from the active schema.
   *
   * @param name - The change name (used in the warning message)
   * @param manifest - The parsed manifest whose schema is checked
   */
  private _warnOnSchemaMismatch(name: string, manifest: ChangeManifest): void {
    if (this._activeSchema === undefined) return
    const { name: activeName, version: activeVersion } = this._activeSchema
    const { name: storedName, version: storedVersion } = manifest.schema
    if (storedName !== activeName || storedVersion !== activeVersion) {
      console.warn(
        `[specd] Change "${name}" was created with schema ${storedName}@${storedVersion.toString()} ` +
          `but the active schema is ${activeName}@${activeVersion.toString()}. ` +
          `The change is still usable — review before archiving.`,
      )
    }
  }
}

// ---- Serialization helpers ----

/**
 * Serializes a `Change` entity into the `ChangeManifest` JSON structure.
 *
 * @param change - The change to serialize
 * @returns The manifest JSON structure
 */
function changeToManifest(change: Change): ChangeManifest {
  const createdEvent = change.history.find((e) => e.type === 'created')
  const schema =
    createdEvent?.type === 'created'
      ? { name: createdEvent.schemaName, version: createdEvent.schemaVersion }
      : { name: '', version: 0 }

  return {
    name: change.name,
    createdAt: change.createdAt.toISOString(),
    ...(change.description !== undefined ? { description: change.description } : {}),
    schema,
    workspaces: [...change.workspaces],
    specIds: [...change.specIds],
    contextSpecIds: [...change.contextSpecIds],
    artifacts: [...change.artifacts.values()].map(serializeArtifact),
    history: change.history.map(serializeEvent),
  }
}

/**
 * Serializes a `ChangeArtifact` entity into a `ManifestArtifact` JSON object.
 *
 * @param artifact - The artifact to serialize
 * @returns The serialized artifact JSON object
 */
function serializeArtifact(artifact: ChangeArtifact): ManifestArtifact {
  return {
    type: artifact.type,
    filename: artifact.filename,
    optional: artifact.optional,
    requires: [...artifact.requires],
    validatedHash: artifact.validatedHash ?? null,
  }
}

/**
 * Serializes a `ChangeEvent` domain type into its raw JSON representation.
 *
 * @param event - The domain event to serialize
 * @returns The raw JSON event object
 */
function serializeEvent(event: ChangeEvent): RawChangeEvent {
  switch (event.type) {
    case 'created':
      return {
        type: 'created',
        at: event.at.toISOString(),
        by: event.by,
        workspaces: [...event.workspaces],
        specIds: [...event.specIds],
        schemaName: event.schemaName,
        schemaVersion: event.schemaVersion,
      }
    case 'transitioned':
      return {
        type: 'transitioned',
        at: event.at.toISOString(),
        by: event.by,
        from: event.from,
        to: event.to,
      }
    case 'spec-approved':
      return {
        type: 'spec-approved',
        at: event.at.toISOString(),
        by: event.by,
        reason: event.reason,
        artifactHashes: event.artifactHashes,
      }
    case 'signed-off':
      return {
        type: 'signed-off',
        at: event.at.toISOString(),
        by: event.by,
        reason: event.reason,
        artifactHashes: event.artifactHashes,
      }
    case 'invalidated':
      return {
        type: 'invalidated',
        at: event.at.toISOString(),
        by: event.by,
        cause: event.cause,
      }
    case 'drafted':
      return event.reason !== undefined
        ? { type: 'drafted', at: event.at.toISOString(), by: event.by, reason: event.reason }
        : { type: 'drafted', at: event.at.toISOString(), by: event.by }
    case 'restored':
      return { type: 'restored', at: event.at.toISOString(), by: event.by }
    case 'discarded':
      return event.supersededBy !== undefined
        ? {
            type: 'discarded',
            at: event.at.toISOString(),
            by: event.by,
            reason: event.reason,
            supersededBy: [...event.supersededBy],
          }
        : { type: 'discarded', at: event.at.toISOString(), by: event.by, reason: event.reason }
    case 'artifact-skipped':
      return event.reason !== undefined
        ? {
            type: 'artifact-skipped',
            at: event.at.toISOString(),
            by: event.by,
            artifactId: event.artifactId,
            reason: event.reason,
          }
        : {
            type: 'artifact-skipped',
            at: event.at.toISOString(),
            by: event.by,
            artifactId: event.artifactId,
          }
  }
}

/**
 * Deserializes a raw JSON event object into a `ChangeEvent` domain type.
 *
 * @param raw - The raw JSON event as stored in `manifest.json`
 * @returns The deserialized domain event
 */
function deserializeEvent(raw: RawChangeEvent): ChangeEvent {
  switch (raw.type) {
    case 'created':
      return {
        type: 'created',
        at: new Date(raw.at),
        by: raw.by,
        workspaces: raw.workspaces,
        specIds: raw.specIds,
        schemaName: raw.schemaName,
        schemaVersion: raw.schemaVersion,
      }
    case 'transitioned':
      return {
        type: 'transitioned',
        at: new Date(raw.at),
        by: raw.by,
        from: raw.from as ChangeState,
        to: raw.to as ChangeState,
      }
    case 'spec-approved':
      return {
        type: 'spec-approved',
        at: new Date(raw.at),
        by: raw.by,
        reason: raw.reason,
        artifactHashes: raw.artifactHashes,
      }
    case 'signed-off':
      return {
        type: 'signed-off',
        at: new Date(raw.at),
        by: raw.by,
        reason: raw.reason,
        artifactHashes: raw.artifactHashes,
      }
    case 'invalidated':
      return {
        type: 'invalidated',
        at: new Date(raw.at),
        by: raw.by,
        cause: raw.cause as 'workspace-change' | 'spec-change' | 'artifact-change',
      }
    case 'drafted':
      return raw.reason !== undefined
        ? { type: 'drafted', at: new Date(raw.at), by: raw.by, reason: raw.reason }
        : { type: 'drafted', at: new Date(raw.at), by: raw.by }
    case 'restored':
      return { type: 'restored', at: new Date(raw.at), by: raw.by }
    case 'discarded':
      return raw.supersededBy !== undefined
        ? {
            type: 'discarded',
            at: new Date(raw.at),
            by: raw.by,
            reason: raw.reason,
            supersededBy: raw.supersededBy,
          }
        : { type: 'discarded', at: new Date(raw.at), by: raw.by, reason: raw.reason }
    case 'artifact-skipped':
      return raw.reason !== undefined
        ? {
            type: 'artifact-skipped',
            at: new Date(raw.at),
            by: raw.by,
            artifactId: raw.artifactId,
            reason: raw.reason,
          }
        : { type: 'artifact-skipped', at: new Date(raw.at), by: raw.by, artifactId: raw.artifactId }
  }
}

// ---- Manifest validation schema ----

const gitIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
})

const manifestArtifactSchema = z.object({
  type: z.string(),
  filename: z.string(),
  optional: z.boolean(),
  requires: z.array(z.string()),
  validatedHash: z.string().nullable(),
})

const rawChangeEventSchema = z
  .object({
    type: z.string(),
    at: z.string(),
    by: gitIdentitySchema,
  })
  .passthrough()

const changeManifestSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  description: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedBy: gitIdentitySchema.optional(),
  schema: z.object({
    name: z.string(),
    version: z.number(),
  }),
  workspaces: z.array(z.string()),
  specIds: z.array(z.string()),
  contextSpecIds: z.array(z.string()).optional(),
  artifacts: z.array(manifestArtifactSchema),
  history: z.array(rawChangeEventSchema),
})

// ---- Discard detection ----

/**
 * Returns `true` if the change's most recent history event is a `discarded` event.
 *
 * @param change - The change to inspect
 * @returns Whether the change has been discarded
 */
function isDiscardedChange(change: Change): boolean {
  const history = change.history
  if (history.length === 0) return false
  return history[history.length - 1]?.type === 'discarded'
}

// ---- Directory filtering ----

/**
 * Filters a list of directory entry names to include only subdirectories.
 *
 * @param basePath - Absolute path to the parent directory
 * @param entries - Entry names to filter
 * @returns The names of entries that are directories
 */
async function filterDirectories(basePath: string, entries: string[]): Promise<string[]> {
  const results: string[] = []
  for (const entry of entries) {
    const stat = await fs.stat(path.join(basePath, entry))
    if (stat.isDirectory()) results.push(entry)
  }
  return results
}
