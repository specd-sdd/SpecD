/**
 * Internal types for the `manifest.json` file format.
 *
 * These types are private to the `fs/` infrastructure layer and must not be
 * exported from the package's public `index.ts`. They exist solely to provide
 * a typed surface for JSON serialization and deserialization.
 */

/** Git identity as stored in the manifest JSON. */
export interface ManifestGitIdentity {
  /** Display name of the actor. */
  name: string
  /** Email address of the actor. */
  email: string
}

/** A single artifact descriptor as stored in the manifest `artifacts` array. */
export interface ManifestArtifact {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`). */
  type: string
  /** The artifact filename (e.g. `"proposal.md"`). */
  filename: string
  /** Whether the artifact is optional in the schema. */
  optional: boolean
  /** Artifact type IDs that must be complete before this one can be validated. */
  requires: string[]
  /**
   * The hash recorded at last validation.
   *
   * - `null` — not yet validated
   * - `"__skipped__"` — optional artifact explicitly not produced
   * - `"sha256:..."` — validated
   */
  validatedHash: string | null
}

/** Raw JSON shape of a `created` event. */
export interface RawCreatedEvent {
  /** Event discriminant. */
  type: 'created'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who created the change. */
  by: ManifestGitIdentity
  /** Workspace IDs at creation time. */
  workspaces: string[]
  /** Spec paths at creation time. */
  specIds: string[]
  /** Schema name at creation time. */
  schemaName: string
  /** Schema version at creation time. */
  schemaVersion: number
}

/** Raw JSON shape of a `transitioned` event. */
export interface RawTransitionedEvent {
  /** Event discriminant. */
  type: 'transitioned'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who triggered the transition. */
  by: ManifestGitIdentity
  /** The state transitioned from. */
  from: string
  /** The state transitioned to. */
  to: string
}

/** Raw JSON shape of a `spec-approved` event. */
export interface RawSpecApprovedEvent {
  /** Event discriminant. */
  type: 'spec-approved'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who approved the spec. */
  by: ManifestGitIdentity
  /** Free-text rationale for the approval. */
  reason: string
  /** Hashes of the artifacts reviewed during approval, keyed by artifact type. */
  artifactHashes: Record<string, string>
}

/** Raw JSON shape of a `signed-off` event. */
export interface RawSignedOffEvent {
  /** Event discriminant. */
  type: 'signed-off'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who signed off. */
  by: ManifestGitIdentity
  /** Free-text rationale for the sign-off. */
  reason: string
  /** Hashes of the artifacts reviewed during sign-off, keyed by artifact type. */
  artifactHashes: Record<string, string>
}

/** Raw JSON shape of an `invalidated` event. */
export interface RawInvalidatedEvent {
  /** Event discriminant. */
  type: 'invalidated'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who triggered the invalidation. */
  by: ManifestGitIdentity
  /** The reason the approval was invalidated. */
  cause: string
}

/** Raw JSON shape of a `drafted` event. */
export interface RawDraftedEvent {
  /** Event discriminant. */
  type: 'drafted'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who shelved the change. */
  by: ManifestGitIdentity
  /** Optional explanation for shelving. */
  reason?: string
}

/** Raw JSON shape of a `restored` event. */
export interface RawRestoredEvent {
  /** Event discriminant. */
  type: 'restored'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who restored the change. */
  by: ManifestGitIdentity
}

/** Raw JSON shape of a `discarded` event. */
export interface RawDiscardedEvent {
  /** Event discriminant. */
  type: 'discarded'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who discarded the change. */
  by: ManifestGitIdentity
  /** Mandatory reason for discarding. */
  reason: string
  /** Optional list of change names that replace this one. */
  supersededBy?: string[]
}

/** Raw JSON shape of an `artifact-skipped` event. */
export interface RawArtifactSkippedEvent {
  /** Event discriminant. */
  type: 'artifact-skipped'
  /** ISO 8601 timestamp. */
  at: string
  /** Actor who skipped the artifact. */
  by: ManifestGitIdentity
  /** The artifact type ID that was skipped. */
  artifactId: string
  /** Optional explanation for skipping. */
  reason?: string
}

/** Discriminated union of all raw event JSON shapes. */
export type RawChangeEvent =
  | RawCreatedEvent
  | RawTransitionedEvent
  | RawSpecApprovedEvent
  | RawSignedOffEvent
  | RawInvalidatedEvent
  | RawDraftedEvent
  | RawRestoredEvent
  | RawDiscardedEvent
  | RawArtifactSkippedEvent

/** The top-level structure of a `manifest.json` file. */
export interface ChangeManifest {
  /** The change slug; immutable after creation. */
  name: string
  /** ISO 8601 creation timestamp; immutable after creation. */
  createdAt: string
  /** Schema name and version recorded at creation; never updated. */
  schema: {
    /** Schema name (e.g. `"@specd/schema-std"`). */
    name: string
    /** Schema version integer. */
    version: number
  }
  /** Current snapshot of workspace IDs. */
  workspaces: string[]
  /** Current snapshot of spec paths being modified. */
  specIds: string[]
  /** Current snapshot of context spec paths. */
  contextSpecIds: string[]
  /** Artifact descriptors including their validation hashes. */
  artifacts: ManifestArtifact[]
  /** Append-only event history. */
  history: RawChangeEvent[]
}
