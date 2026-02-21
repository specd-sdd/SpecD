import { type ArtifactStatus } from '../value-objects/artifact-status.js'

/**
 * Construction properties for a {@link ChangeArtifact}.
 */
export interface ChangeArtifactProps {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`, `"tasks"`). */
  type: string
  /** The artifact filename (e.g. `"proposal.md"`). */
  filename: string
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
}
