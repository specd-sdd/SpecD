import { type ArtifactStatus } from './artifact-status.js'
import { type ArtifactDisplayStatus } from './artifact-display-status.js'

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
  /** Whether the file's current state differs from its validated baseline. Defaults to `false`. */
  readonly hasDrift?: boolean
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
 * the explicit transition methods to mutate it, or read {@link status} to
 * observe the current value.
 *
 * @see ChangeArtifact
 */
export class ArtifactFile {
  private readonly _key: string
  private readonly _filename: string
  private _status: ArtifactStatus
  private _validatedHash: string | undefined
  private _hasDrift: boolean

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
    this._hasDrift = props.hasDrift ?? false
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

  /** Whether the file's current state differs from its validated baseline. */
  get hasDrift(): boolean {
    return this._hasDrift
  }

  /** Whether this file has been successfully validated (`status === "complete"`). */
  get isComplete(): boolean {
    return this._status === 'complete'
  }

  /**
   * Returns the human-facing display status.
   *
   * Returns `'complete-with-drift'` when the canonical status is `'complete'`
   * and `hasDrift` is `true`. Otherwise returns the canonical status unchanged.
   * Never returns `'complete-with-drift'` for missing files.
   *
   * @returns The display-oriented status string
   */
  displayStatus(): ArtifactDisplayStatus {
    if (this._status === 'complete' && this._hasDrift) return 'complete-with-drift'
    return this._status
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
    this._hasDrift = false
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
   * Marks this file as requiring review while preserving the last validated hash.
   *
   * Drift is sticky: once a file is `drifted-pending-review`, downgrading it to
   * the broader review state is ignored until it is revalidated.
   */
  markPendingReview(): void {
    if (this._status === 'drifted-pending-review') return
    if (this._status === 'missing') return
    this._status = 'pending-review'
  }

  /**
   * Marks this file as drifted from its validated content while preserving the
   * last validated hash for diagnostics and future revalidation.
   */
  markDriftedPendingReview(): void {
    if (this._status === 'missing') return
    this._status = 'drifted-pending-review'
  }

  /**
   * Marks this file as present but not yet validated.
   */
  markInProgress(): void {
    if (this._status === 'drifted-pending-review') return
    this._status = 'in-progress'
  }

  /**
   * Marks this file as absent and not yet validated.
   */
  markMissing(): void {
    if (this._status === 'drifted-pending-review') return
    this._status = 'missing'
  }

  /**
   * Marks this file as drifted from its validated baseline.
   *
   * This is a diagnostic flag only — it does not change canonical status.
   * Callers that need to reopen the file must use `markDriftedPendingReview()`
   * or `markPendingReview()`.
   */
  markDrifted(): void {
    this._hasDrift = true
  }

  /**
   * Clears the drift flag without changing canonical status.
   *
   * Called automatically by `markComplete()` on successful validation.
   * May also be called directly when the baseline is reconciled.
   */
  clearDrift(): void {
    this._hasDrift = false
  }
}
