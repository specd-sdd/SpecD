import { type ArtifactStatus } from './artifact-status.js'

/**
 * Construction properties for an {@link ArtifactFile}.
 */
export interface ArtifactFileProps {
  /** Identifier for this file within the artifact (artifact type id for scope:change, specId for scope:spec). */
  readonly key: string
  /** Relative path within the change directory (e.g. `"proposal.md"`, `"spec.md"`). */
  readonly filename: string
  /** Current validation status. Defaults to `"missing"`. */
  readonly status?: ArtifactStatus
  /** SHA-256 hash recorded at last successful validation, if any. */
  readonly validatedHash?: string
}

/** Sentinel hash stored in `validatedHash` when an optional artifact file is skipped. */
export const SKIPPED_SENTINEL = '__skipped__'

/**
 * Tracks the validation state of a single file within a multi-file artifact.
 *
 * For `scope: change` artifacts there is one `ArtifactFile` keyed by the artifact
 * type id. For `scope: spec` artifacts there is one `ArtifactFile` per specId.
 *
 * Status is maintained in a mutable `_status` field, initialised from
 * {@link ArtifactFileProps.status} (defaulting to `"missing"`). Use
 * {@link markComplete}, {@link markSkipped}, and {@link resetValidation} to
 * transition state, or read {@link status} to observe the current value.
 *
 * @see ChangeArtifact
 */
export class ArtifactFile {
  private readonly _key: string
  private readonly _filename: string
  private _status: ArtifactStatus
  private _validatedHash: string | undefined

  /**
   * Creates a new `ArtifactFile` from the given properties.
   *
   * @param props - File construction properties
   */
  constructor(props: ArtifactFileProps) {
    this._key = props.key
    this._filename = props.filename
    this._status = props.status ?? 'missing'
    this._validatedHash = props.validatedHash
  }

  /** Identifier for this file within the artifact. */
  get key(): string {
    return this._key
  }

  /** Relative path within the change directory. */
  get filename(): string {
    return this._filename
  }

  /** The current validation status of this file. */
  get status(): ArtifactStatus {
    return this._status
  }

  /** The SHA-256 hash recorded at the last successful validation, or `undefined`. */
  get validatedHash(): string | undefined {
    return this._validatedHash
  }

  /** Whether this file has been successfully validated (`status === "complete"`). */
  get isComplete(): boolean {
    return this._status === 'complete'
  }

  /**
   * Records a successful validation by storing the content hash and setting
   * the status to `"complete"`.
   *
   * @param hash - The SHA-256 hash of the validated file content
   */
  markComplete(hash: string): void {
    this._validatedHash = hash
    this._status = 'complete'
  }

  /**
   * Marks this file as explicitly skipped, storing the sentinel hash and
   * setting the status to `"skipped"`.
   */
  markSkipped(): void {
    this._validatedHash = SKIPPED_SENTINEL
    this._status = 'skipped'
  }

  /**
   * Resets the validation state by clearing `validatedHash` and rolling the
   * status back to its unvalidated equivalent.
   *
   * - `complete` -> `in-progress` (file still present, hash no longer valid)
   * - `skipped` -> `missing` (sentinel cleared, file treated as absent)
   * - `in-progress` / `missing` -- no status change, hash already unset
   */
  resetValidation(): void {
    if (this._status === 'complete') this._status = 'in-progress'
    else if (this._status === 'skipped') this._status = 'missing'
    this._validatedHash = undefined
  }
}
