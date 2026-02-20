import { type ArtifactStatus } from '../value-objects/artifact-status.js'

/**
 * Construction properties for an `Artifact`.
 */
export interface ArtifactProps {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`, `"tasks"`). */
  type: string
  /** Path to the artifact file relative to the change directory. */
  path: string
  /** Whether the artifact is optional in the schema. Defaults to `false`. */
  optional?: boolean
  /** Artifact type IDs that must be `complete` before this one can be validated. */
  requires?: readonly string[]
  /** Current validation status. Defaults to `"missing"`. */
  status?: ArtifactStatus
  /** SHA-256 hash recorded at last successful validation, if any. */
  validatedHash?: string
}

/**
 * Represents a single artifact file within a change (e.g. `proposal.md`, `spec.md`).
 *
 * Status is derived, not stored: `missing` until the file exists, `in-progress`
 * while unvalidated or dependencies are incomplete, `complete` after `markComplete`.
 */
export class Artifact {
  /** The artifact type identifier (matches the schema's `artifacts[].id`). */
  readonly type: string
  /** Path to the artifact file relative to the change directory. */
  readonly path: string
  /** Whether this artifact is optional in the schema. */
  readonly optional: boolean
  /** Artifact type IDs that must be complete before this one can be validated. */
  readonly requires: readonly string[]
  private _status: ArtifactStatus
  private _validatedHash: string | undefined

  /**
   * Creates a new `Artifact` from the given properties.
   *
   * @param props - Artifact construction properties
   */
  constructor(props: ArtifactProps) {
    this.type = props.type
    this.path = props.path
    this.optional = props.optional ?? false
    this.requires = props.requires ?? []
    this._status = props.status ?? 'missing'
    this._validatedHash = props.validatedHash
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
}
