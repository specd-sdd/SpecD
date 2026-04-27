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
  /** Persisted aggregate state. Recomputed from `files` on construction. */
  readonly status?: ArtifactStatus
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
  private _status: ArtifactStatus
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
    this._status = props.status ?? 'missing'
    this._files =
      props.files !== undefined
        ? new Map<string, ArtifactFile>(props.files)
        : new Map<string, ArtifactFile>()
    this._recomputeStatus()
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
    return this._status
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
    this._recomputeStatus()
  }

  /**
   * Removes a file from this artifact.
   *
   * @param key - The file key to remove
   */
  removeFile(key: string): void {
    this._files.delete(key)
    this._recomputeStatus()
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
      this._recomputeStatus()
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
    this._recomputeStatus()
  }

  /**
   * Marks all files in this artifact as pending review, preserving any more
   * specific `drifted-pending-review` file states.
   */
  markPendingReview(): void {
    for (const file of this._files.values()) {
      file.markPendingReview()
    }
    this._recomputeStatus()
  }

  /**
   * Marks only the selected files as drifted pending review.
   *
   * @param keys - File keys to downgrade
   */
  markDriftedPendingReview(keys: readonly string[]): void {
    for (const key of keys) {
      this._files.get(key)?.markDriftedPendingReview()
    }
    this._recomputeStatus()
  }

  /**
   * Materializes an unvalidated file state discovered from the filesystem.
   *
   * Intended for repository hydration of `missing` / `in-progress` entries whose
   * file presence changed outside explicit validation flows.
   *
   * @param key - File key to update
   * @param status - Newly observed state
   */
  setFileStatus(key: string, status: Extract<ArtifactStatus, 'missing' | 'in-progress'>): void {
    const file = this._files.get(key)
    if (file === undefined) return
    if (status === 'in-progress') {
      file.markInProgress()
    } else {
      file.markMissing()
    }
    this._recomputeStatus()
  }

  /**
   * Recomputes the aggregate artifact status from the tracked file states.
   *
   * `drifted-pending-review` takes precedence over `pending-review`, followed
   * by `pending-parent-artifact-review`, and then the steady-state aggregation
   * for skipped, complete, missing, and in-progress files.
   */
  private _recomputeStatus(): void {
    if (this._files.size === 0) {
      this._status = 'missing'
      return
    }

    const states = [...this._files.values()].map((file) => file.status)
    if (states.some((state) => state === 'drifted-pending-review')) {
      this._status = 'drifted-pending-review'
      return
    }
    if (states.some((state) => state === 'pending-review')) {
      this._status = 'pending-review'
      return
    }
    if (states.some((state) => state === 'pending-parent-artifact-review')) {
      this._status = 'pending-parent-artifact-review'
      return
    }
    if (states.every((state) => state === 'skipped')) {
      this._status = 'skipped'
      return
    }
    if (states.every((state) => state === 'complete' || state === 'skipped')) {
      this._status = 'complete'
      return
    }
    if (states.every((state) => state === 'missing')) {
      this._status = 'missing'
      return
    }
    this._status = 'in-progress'
  }
}
