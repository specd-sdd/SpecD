import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { ArtifactNotOptionalError } from '../errors/artifact-not-optional-error.js'

/**
 * Sentinel hash stored in `validatedHash` when an optional artifact is skipped.
 * Presence of this value indicates the artifact was explicitly bypassed rather
 * than validated.
 */
export const SKIPPED_SENTINEL = '__skipped__'

/**
 * Construction properties for a {@link ChangeArtifact}.
 */
export interface ChangeArtifactProps {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`, `"tasks"`). */
  readonly type: string
  /** The artifact filename (e.g. `"proposal.md"`). */
  readonly filename: string
  /** Whether the artifact is optional in the schema. Defaults to `false`. */
  readonly optional?: boolean
  /** Artifact type IDs that must be `complete` before this one can be validated. */
  readonly requires?: readonly string[]
  /** Current validation status. Defaults to `"missing"`. */
  readonly status?: ArtifactStatus
  /** SHA-256 hash recorded at last successful validation, if any. */
  readonly validatedHash?: string
}

/**
 * Represents a single artifact file within a change (e.g. `proposal.md`, `spec.md`).
 *
 * Tracks validation state for the artifact: whether it exists, whether it has
 * been validated, and what hash was recorded at last validation. Content is not
 * held in memory — it is loaded on demand by the repository port when needed.
 *
 * Status is derived, not stored: `missing` until the file exists, `in-progress`
 * while unvalidated or dependencies are incomplete, `complete` after `markComplete`.
 */
export class ChangeArtifact {
  private readonly _type: string
  private readonly _filename: string
  private readonly _optional: boolean
  private readonly _requires: readonly string[]
  private _status: ArtifactStatus
  private _validatedHash: string | undefined

  /**
   * Creates a new `ChangeArtifact` from the given properties.
   *
   * @param props - Artifact construction properties
   */
  constructor(props: ChangeArtifactProps) {
    this._type = props.type
    this._filename = props.filename
    this._optional = props.optional ?? false
    this._requires = props.requires ?? []
    this._status = props.status ?? 'missing'
    this._validatedHash = props.validatedHash
  }

  /** The artifact type identifier (matches the schema's `artifacts[].id`). */
  get type(): string {
    return this._type
  }

  /** The artifact filename (e.g. `"proposal.md"`). */
  get filename(): string {
    return this._filename
  }

  /** Whether this artifact is optional in the schema. */
  get optional(): boolean {
    return this._optional
  }

  /** Artifact type IDs that must be complete before this one can be validated. */
  get requires(): readonly string[] {
    return this._requires
  }

  /** The current validation status of this artifact. */
  get status(): ArtifactStatus {
    return this._status
  }

  /** The SHA-256 hash recorded at the last successful validation, or `undefined`. */
  get validatedHash(): string | undefined {
    return this._validatedHash
  }

  /** Whether this artifact has been successfully validated (`status === "complete"`). */
  get isComplete(): boolean {
    return this._status === 'complete'
  }

  /**
   * Records a successful validation by storing the content hash and setting
   * the status to `"complete"`.
   *
   * @param hash - The SHA-256 hash of the validated artifact content
   */
  markComplete(hash: string): void {
    this._validatedHash = hash
    this._status = 'complete'
  }

  /**
   * Marks this artifact as explicitly skipped, storing the sentinel hash and
   * setting the status to `"skipped"`.
   *
   * Only optional artifacts may be skipped. Skipped artifacts satisfy dependency
   * requirements — dependents do not treat a skipped artifact as a blocker.
   *
   * @throws {ArtifactNotOptionalError} If this artifact is not optional
   */
  markSkipped(): void {
    if (!this._optional) {
      throw new ArtifactNotOptionalError(this._type)
    }
    this._validatedHash = SKIPPED_SENTINEL
    this._status = 'skipped'
  }

  /**
   * Resets the validation state by clearing `validatedHash` and rolling the
   * status back to its unvalidated equivalent.
   *
   * - `complete` → `in-progress` (file still present, hash no longer valid)
   * - `skipped` → `missing` (sentinel cleared, file treated as absent)
   * - `in-progress` / `missing` — no status change, hash already unset
   */
  resetValidation(): void {
    if (this._status === 'complete') this._status = 'in-progress'
    else if (this._status === 'skipped') this._status = 'missing'
    this._validatedHash = undefined
  }
}
