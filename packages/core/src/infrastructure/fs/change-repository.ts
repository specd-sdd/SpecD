import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Change } from '../../domain/entities/change.js'
import { type ChangeEvent } from '../../domain/entities/change.js'
import { ChangeArtifact, SKIPPED_SENTINEL } from '../../domain/entities/change-artifact.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { ChangeAlreadyExistsError } from '../../application/errors/change-already-exists-error.js'
import { ChangeNotFoundError } from '../../application/errors/change-not-found-error.js'
import {
  ChangeRepository,
  type ChangeRepositoryConfig,
} from '../../application/ports/change-repository.js'
import { changeDirName } from './dir-name.js'
import { sha256 } from './hash.js'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'
import {
  type ChangeManifest,
  type ManifestArtifact,
  type RawChangeEvent,
  changeManifestSchema,
} from './manifest.js'

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
  }

  /**
   * Returns the change with the given name, searching `changes/` then `drafts/`
   * (excludes `discarded/`). Returns `null` if not found.
   *
   * Discarded changes are excluded so that a discarded name can be reused
   * when creating a new change.
   *
   * @param name - The change slug name to look up
   * @returns The change with current artifact state, or `null` if not found
   */
  override async get(name: string): Promise<Change | null> {
    const dir = await this._resolveDir(name, { includeDiscarded: false })
    if (dir === null) return null

    const manifest = await this._loadManifest(dir)
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
      // First save: ensure parent exists, then atomically create change dir.
      // Non-recursive mkdir fails with EEXIST if a concurrent create races us.
      await fs.mkdir(path.dirname(targetDir), { recursive: true })
      try {
        await fs.mkdir(targetDir)
      } catch (err) {
        if (isEexist(err)) throw new ChangeAlreadyExistsError(change.name)
        throw err
      }
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
      throw new ChangeNotFoundError(change.name)
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

  /**
   * Checks whether an artifact file exists for a change, without loading content.
   *
   * @param change - The change containing the artifact
   * @param filename - The artifact filename to check
   * @returns `true` if the file exists, `false` otherwise
   */
  override async artifactExists(change: Change, filename: string): Promise<boolean> {
    const dir = await this._resolveDir(change.name)
    if (dir === null) return false
    try {
      await fs.lstat(path.join(dir, filename))
      return true
    } catch {
      return false
    }
  }

  /**
   * Checks whether a delta file exists for a change + specId pair.
   *
   * @param change - The change containing the delta
   * @param specId - The spec identifier
   * @param filename - The delta filename to check
   * @returns `true` if the file exists, `false` otherwise
   */
  override async deltaExists(change: Change, specId: string, filename: string): Promise<boolean> {
    const dir = await this._resolveDir(change.name)
    if (dir === null) return false
    try {
      await fs.lstat(path.join(dir, 'deltas', specId, filename))
      return true
    } catch {
      return false
    }
  }

  // ---- Private helpers ----

  /**
   * Resolves the on-disk directory for a change by scanning `changes/`,
   * `drafts/`, and optionally `discarded/` for an entry ending in `-<name>`.
   *
   * @param name - The change slug name to search for
   * @param options - Resolution options
   * @param options.includeDiscarded - Whether to search `discarded/` (default `true`)
   * @returns The absolute path to the change directory, or `null` if not found
   */
  private async _resolveDir(
    name: string,
    options?: { includeDiscarded?: boolean },
  ): Promise<string | null> {
    const paths =
      options?.includeDiscarded === false
        ? [this._changesPath, this._draftsPath]
        : [this._changesPath, this._draftsPath, this._discardedPath]
    for (const basePath of paths) {
      let entries: string[]
      try {
        entries = await fs.readdir(basePath)
      } catch (err) {
        if (isEnoent(err)) continue
        throw err
      }

      const match = entries.find((entry) => {
        const m = entry.match(/^\d{8}-\d{6}-(.+)$/)
        return m !== null && m[1] === name
      })
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
   * Writes `manifest.json` atomically via a temp file + rename.
   *
   * @param dir - Absolute path to the change directory
   * @param manifest - The manifest data to write
   */
  private async _writeManifestAtomic(dir: string, manifest: ChangeManifest): Promise<void> {
    const manifestPath = path.join(dir, 'manifest.json')
    await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2))
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
      specIds: manifest.specIds,
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
    if (artifact.validatedHash === SKIPPED_SENTINEL && artifact.optional) return 'skipped'
    if (artifact.validatedHash === SKIPPED_SENTINEL) return 'in-progress'

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
    specIds: [...change.specIds],
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

/** All valid `ChangeState` values, derived from the transition map keys. */
const CHANGE_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/** All valid `InvalidatedEvent` cause values. */
const INVALIDATED_CAUSES = ['spec-change', 'artifact-change'] as const
/** Union of valid `InvalidatedEvent` cause strings. */
type InvalidatedCause = (typeof INVALIDATED_CAUSES)[number]

/**
 * Asserts that a string value is a valid `ChangeState`.
 *
 * @param value - The raw string to validate
 * @param field - Field name used in the error message
 * @returns The validated `ChangeState`
 * @throws {Error} If the value is not a valid state
 */
function assertChangeState(value: string, field: string): ChangeState {
  if ((CHANGE_STATES as string[]).includes(value)) return value as ChangeState
  throw new CorruptedManifestError(`invalid ChangeState in manifest field '${field}': '${value}'`)
}

/**
 * Asserts that a string value is a valid `InvalidatedEvent` cause.
 *
 * @param value - The raw string to validate
 * @returns The validated cause
 * @throws {Error} If the value is not a valid cause
 */
function assertInvalidatedCause(value: string): InvalidatedCause {
  if ((INVALIDATED_CAUSES as readonly string[]).includes(value)) return value as InvalidatedCause
  throw new CorruptedManifestError(`invalid invalidated cause in manifest: '${value}'`)
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
        specIds: raw.specIds,
        schemaName: raw.schemaName,
        schemaVersion: raw.schemaVersion,
      }
    case 'transitioned':
      return {
        type: 'transitioned',
        at: new Date(raw.at),
        by: raw.by,
        from: assertChangeState(raw.from, 'from'),
        to: assertChangeState(raw.to, 'to'),
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
        cause: assertInvalidatedCause(raw.cause),
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

// changeManifestSchema imported from ./manifest.js

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

// ---- Error helpers ----

/**
 * Returns `true` if `err` is a Node.js `EEXIST` filesystem error.
 *
 * @param err - The caught error value to inspect
 * @returns Whether `err` is an EEXIST error
 */
function isEexist(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'EEXIST'
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
  const checks = await Promise.all(
    entries.map(async (entry) => {
      try {
        const stat = await fs.lstat(path.join(basePath, entry))
        return { entry, isDir: stat.isDirectory() }
      } catch {
        return { entry, isDir: false }
      }
    }),
  )
  return checks.filter((c) => c.isDir).map((c) => c.entry)
}
