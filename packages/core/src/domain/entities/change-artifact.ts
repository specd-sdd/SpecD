import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { ArtifactFile, SKIPPED_SENTINEL } from '../value-objects/artifact-file.js'
import { ArtifactNotOptionalError } from '../errors/artifact-not-optional-error.js'

export { SKIPPED_SENTINEL }

/**
 * Construction properties for a {@link ChangeArtifact}.
 */
export interface ChangeArtifactProps {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`, `"tasks"`). */
  readonly type: string
  /** Whether the artifact is optional in the schema. Defaults to `false`. */
  readonly optional?: boolean
  /** Artifact type IDs that must be `complete` before this one can be validated. */
  readonly requires?: readonly string[]
  /** Pre-populated files map. */
  readonly files?: ReadonlyMap<string, ArtifactFile>
}

/**
 * Represents one artifact type within a change (e.g. proposal, specs, tasks).
 *
 * Contains zero or more {@link ArtifactFile} entries — one per file the artifact
 * produces. For `scope: change` artifacts there is typically one file keyed by
 * the artifact type id. For `scope: spec` artifacts there is one file per specId.
 *
 * Aggregated status: `complete` iff all files are complete or skipped;
 * `missing` iff all files are missing or there are no files;
 * `in-progress` otherwise.
 *
 * @see ArtifactFile
 */
export class ChangeArtifact {
  private readonly _type: string
  private readonly _optional: boolean
  private readonly _requires: readonly string[]
  private _files: Map<string, ArtifactFile>

  /**
   * Creates a new `ChangeArtifact` from the given properties.
   *
   * @param props - Artifact construction properties
   */
  constructor(props: ChangeArtifactProps) {
    this._type = props.type
    this._optional = props.optional ?? false
    this._requires = [...(props.requires ?? [])]
    this._files =
      props.files !== undefined
        ? new Map<string, ArtifactFile>(props.files)
        : new Map<string, ArtifactFile>()
  }

  /** The artifact type identifier (matches the schema's `artifacts[].id`). */
  get type(): string {
    return this._type
  }

  /** Whether this artifact is optional in the schema. */
  get optional(): boolean {
    return this._optional
  }

  /** Artifact type IDs that must be complete before this one can be validated. */
  get requires(): readonly string[] {
    return [...this._requires]
  }

  /** Read-only view of all files in this artifact. */
  get files(): ReadonlyMap<string, ArtifactFile> {
    return new Map(this._files)
  }

  /**
   * Aggregated validation status across all files.
   *
   * - `complete` — all files are complete or skipped (and at least one file exists)
   * - `skipped` — all files are skipped (and at least one file exists)
   * - `missing` — all files are missing or there are no files
   * - `in-progress` — some files exist but not all are complete/skipped
   *
   * @returns The aggregated artifact status
   */
  get status(): ArtifactStatus {
    if (this._files.size === 0) return 'missing'

    let allComplete = true
    let allMissing = true
    let allSkipped = true

    for (const file of this._files.values()) {
      if (file.status !== 'complete' && file.status !== 'skipped') allComplete = false
      if (file.status !== 'skipped') allSkipped = false
      if (file.status !== 'missing') allMissing = false
    }

    if (allSkipped) return 'skipped'
    if (allComplete) return 'complete'
    if (allMissing) return 'missing'
    return 'in-progress'
  }

  /** Whether all files in this artifact have been validated or skipped. */
  get isComplete(): boolean {
    const s = this.status
    return s === 'complete' || s === 'skipped'
  }

  /**
   * Returns the file with the given key, or `undefined` if not present.
   *
   * @param key - The file key (artifact type id for scope:change, specId for scope:spec)
   * @returns The file, or `undefined` if not found
   */
  getFile(key: string): ArtifactFile | undefined {
    return this._files.get(key)
  }

  /**
   * Adds or replaces a file in this artifact.
   *
   * @param file - The file to set
   */
  setFile(file: ArtifactFile): void {
    this._files.set(file.key, file)
  }

  /**
   * Removes a file from this artifact.
   *
   * @param key - The file key to remove
   */
  removeFile(key: string): void {
    this._files.delete(key)
  }

  /**
   * Records a successful validation for a specific file by storing the content
   * hash and setting the file's status to `"complete"`.
   *
   * @param key - The file key to mark complete
   * @param hash - The SHA-256 hash of the validated content
   */
  markComplete(key: string, hash: string): void {
    const file = this._files.get(key)
    if (file !== undefined) {
      file.markComplete(hash)
    }
  }

  /**
   * Marks all files in this artifact as explicitly skipped.
   *
   * Only optional artifacts may be skipped. Skipped artifacts satisfy dependency
   * requirements -- dependents do not treat a skipped artifact as a blocker.
   *
   * @throws {ArtifactNotOptionalError} If this artifact is not optional
   */
  markSkipped(): void {
    if (!this._optional) {
      throw new ArtifactNotOptionalError(this._type)
    }
    for (const file of this._files.values()) {
      file.markSkipped()
    }
  }

  /**
   * Resets the validation state for all files.
   *
   * - `complete` -> `in-progress`
   * - `skipped` -> `missing`
   * - `in-progress` / `missing` -- no status change
   */
  resetValidation(): void {
    for (const file of this._files.values()) {
      file.resetValidation()
    }
  }
}
