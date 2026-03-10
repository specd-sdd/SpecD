/**
 * Internal types for the `manifest.json` file format.
 *
 * These types are private to the `fs/` infrastructure layer and must not be
 * exported from the package's public `index.ts`. They exist solely to provide
 * a typed surface for JSON serialization and deserialization.
 */

import { z } from 'zod'

/** Actor identity as stored in the manifest JSON. */
export interface ManifestActorIdentity {
  /** Display name of the actor. */
  readonly name: string
  /** Email address of the actor. */
  readonly email: string
}

/** A single artifact descriptor as stored in the manifest `artifacts` array. */
export interface ManifestArtifact {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`). */
  readonly type: string
  /** The artifact filename (e.g. `"proposal.md"`). */
  readonly filename: string
  /** Whether the artifact is optional in the schema. */
  readonly optional: boolean
  /** Artifact type IDs that must be complete before this one can be validated. */
  readonly requires: string[]
  /**
   * The hash recorded at last validation.
   *
   * - `null` — not yet validated
   * - `"__skipped__"` — optional artifact explicitly not produced
   * - `"sha256:..."` — validated
   */
  readonly validatedHash: string | null
}

/** Raw JSON shape of a `created` event. */
export interface RawCreatedEvent {
  /** Event discriminant. */
  readonly type: 'created'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who created the change. */
  readonly by: ManifestActorIdentity
  /** Spec paths at creation time. */
  readonly specIds: string[]
  /** Schema name at creation time. */
  readonly schemaName: string
  /** Schema version at creation time. */
  readonly schemaVersion: number
}

/** Raw JSON shape of a `transitioned` event. */
export interface RawTransitionedEvent {
  /** Event discriminant. */
  readonly type: 'transitioned'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who triggered the transition. */
  readonly by: ManifestActorIdentity
  /** The state transitioned from. */
  readonly from: string
  /** The state transitioned to. */
  readonly to: string
}

/** Raw JSON shape of a `spec-approved` event. */
export interface RawSpecApprovedEvent {
  /** Event discriminant. */
  readonly type: 'spec-approved'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who approved the spec. */
  readonly by: ManifestActorIdentity
  /** Free-text rationale for the approval. */
  readonly reason: string
  /** Hashes of the artifacts reviewed during approval, keyed by artifact type. */
  readonly artifactHashes: Record<string, string>
}

/** Raw JSON shape of a `signed-off` event. */
export interface RawSignedOffEvent {
  /** Event discriminant. */
  readonly type: 'signed-off'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who signed off. */
  readonly by: ManifestActorIdentity
  /** Free-text rationale for the sign-off. */
  readonly reason: string
  /** Hashes of the artifacts reviewed during sign-off, keyed by artifact type. */
  readonly artifactHashes: Record<string, string>
}

/** Raw JSON shape of an `invalidated` event. */
export interface RawInvalidatedEvent {
  /** Event discriminant. */
  readonly type: 'invalidated'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who triggered the invalidation. */
  readonly by: ManifestActorIdentity
  /** The reason the approval was invalidated. */
  readonly cause: string
}

/** Raw JSON shape of a `drafted` event. */
export interface RawDraftedEvent {
  /** Event discriminant. */
  readonly type: 'drafted'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who shelved the change. */
  readonly by: ManifestActorIdentity
  /** Optional explanation for shelving. */
  readonly reason?: string
}

/** Raw JSON shape of a `restored` event. */
export interface RawRestoredEvent {
  /** Event discriminant. */
  readonly type: 'restored'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who restored the change. */
  readonly by: ManifestActorIdentity
}

/** Raw JSON shape of a `discarded` event. */
export interface RawDiscardedEvent {
  /** Event discriminant. */
  readonly type: 'discarded'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who discarded the change. */
  readonly by: ManifestActorIdentity
  /** Mandatory reason for discarding. */
  readonly reason: string
  /** Optional list of change names that replace this one. */
  readonly supersededBy?: string[]
}

/** Raw JSON shape of an `artifact-skipped` event. */
export interface RawArtifactSkippedEvent {
  /** Event discriminant. */
  readonly type: 'artifact-skipped'
  /** ISO 8601 timestamp. */
  readonly at: string
  /** Actor who skipped the artifact. */
  readonly by: ManifestActorIdentity
  /** The artifact type ID that was skipped. */
  readonly artifactId: string
  /** Optional explanation for skipping. */
  readonly reason?: string
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

// ---- Zod validation schemas ----

export const actorIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
})

export const manifestArtifactSchema = z.object({
  type: z.string(),
  filename: z.string(),
  optional: z.boolean(),
  requires: z.array(z.string()),
  validatedHash: z.string().nullable(),
})

export const rawChangeEventSchema = z
  .object({
    type: z.string(),
    at: z.string(),
    by: actorIdentitySchema,
  })
  .passthrough()

export const changeManifestSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  description: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedBy: actorIdentitySchema.optional(),
  schema: z.object({
    name: z.string(),
    version: z.number(),
  }),
  workspaces: z.array(z.string()).optional(),
  specIds: z.array(z.string()),
  artifacts: z.array(manifestArtifactSchema),
  history: z.array(rawChangeEventSchema),
})

/** The top-level structure of a `manifest.json` file. */
export interface ChangeManifest {
  /** The change slug; immutable after creation. */
  readonly name: string
  /** ISO 8601 creation timestamp; immutable after creation. */
  readonly createdAt: string
  /** Optional free-text description of the change's purpose. */
  readonly description?: string
  /**
   * ISO 8601 timestamp when the change was archived.
   *
   * Present only in manifests that have been moved to the archive directory.
   * Absent from active, drafted, and discarded change manifests.
   */
  readonly archivedAt?: string
  /**
   * Git identity of the actor who archived the change.
   *
   * Present only in manifests that have been moved to the archive directory.
   */
  readonly archivedBy?: ManifestActorIdentity
  /** Schema name and version recorded at creation; never updated. */
  readonly schema: {
    /** Schema name (e.g. `"@specd/schema-std"`). */
    readonly name: string
    /** Schema version integer. */
    readonly version: number
  }
  /**
   * Legacy workspace IDs field.
   *
   * No longer written on save. Accepted on load for backward compatibility
   * with manifests created before workspaces became a computed property.
   */
  readonly workspaces?: string[]
  /** Current snapshot of spec paths being modified. */
  readonly specIds: string[]
  /** Artifact descriptors including their validation hashes. */
  readonly artifacts: ManifestArtifact[]
  /** Append-only event history. */
  readonly history: RawChangeEvent[]
}
