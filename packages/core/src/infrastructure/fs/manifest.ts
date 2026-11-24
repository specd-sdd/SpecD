/**
 * Internal types for the `manifest.json` file format.
 *
 * These types are private to the `fs/` infrastructure layer and must not be
 * exported from the package's public `index.ts`. They exist solely to provide
 * a typed surface for JSON serialization and deserialization.
 */

import { z } from 'zod'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import {
  type InvalidationPolicy,
  type ArtifactInvalidationPolicy,
} from '../../domain/value-objects/invalidation-policy.js'
import {
  type ArtifactFingerprint,
  type SpecApprovalFingerprint,
  type ImplementationFingerprint,
  type ValidityFingerprint,
  type FingerprintDifference,
  type ArtifactFingerprintAlgorithm,
  type TextNormalizationAlgorithm,
  type BinaryNormalizationAlgorithm,
} from '../../domain/value-objects/validity-fingerprint.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import {
  type ProjectionStatus,
  type ValidityInvalidationCause,
} from '../../domain/entities/change.js'
import { UnsupportedManifestVersionError } from '../../domain/errors/unsupported-manifest-version-error.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'

/** Actor identity as stored in the manifest JSON. */
export interface ManifestActorIdentity {
  /** Display name of the actor. */
  readonly name: string
  /** Email address of the actor. */
  readonly email: string
  /** Optional provider identifier (e.g. 'git', 'ldap', 'sso'). */
  readonly provider?: string
  /** Optional unique identifier within the provider (e.g. LDAP DN, employee ID). */
  readonly providerId?: string
  /** Optional bag of additional identity metadata. */
  readonly metadata?: Record<string, string>
}

/** A single file within a manifest artifact. */
export interface ManifestArtifactFile {
  /** File key (artifact type id for scope:change, specId for scope:spec). */
  readonly key: string
  /** Relative filename within the change directory. */
  readonly filename: string
  /** Persisted file state. Optional only for defensive loading of old manifests. */
  readonly state?: ArtifactStatus
  /**
   * The hash recorded at last validation.
   *
   * - `null` — not yet validated
   * - `"__skipped__"` — optional artifact explicitly not produced
   * - `"sha256:..."` — validated
   */
  readonly validatedHash: string | null
  /** Whether the file's current state differs from its validated baseline. Defaults to `false`. */
  readonly hasDrift?: boolean
}

/** A single artifact descriptor as stored in the manifest `artifacts` array. */
export interface ManifestArtifact {
  /** The artifact type identifier (e.g. `"proposal"`, `"specs"`). */
  readonly type: string
  /** Whether the artifact is optional in the schema. */
  readonly optional: boolean
  /** Artifact type IDs that must be complete before this one can be validated. */
  readonly requires: string[]
  /** Persisted aggregate artifact state. Optional only for defensive loading of old manifests. */
  readonly state?: ArtifactStatus
  /** Per-file tracking entries. */
  readonly files: ManifestArtifactFile[]
}

/** Raw change artifact alias used in specs. */
export type RawChangeArtifact = ManifestArtifact

/** Allowed review states for tracked implementation files. */
export type ManifestTrackedImplementationFileState = 'open' | 'resolved' | 'ignored' | 'removed'

/** A tracked implementation file entry persisted in `manifest.json`. */
export interface ManifestTrackedImplementationFile {
  /** Raw project-relative file path. */
  readonly file: string
  /** Explicit review state for the tracked file. */
  readonly state: ManifestTrackedImplementationFileState
}

/** A confirmed implementation link persisted in `manifest.json`. */
export interface ManifestImplementationLink {
  /** Canonical spec ID owning the implementation link. */
  readonly specId: string
  /** Raw project-relative file path. */
  readonly file: string
  /**
   * Whether the file-level link was explicitly created.
   *
   * `false` means the file-level presence exists only as the container for
   * symbol-level refinements.
   */
  readonly fileLinkExplicit: boolean
  /** Optional symbol-level refinements for the `specId + file` link. */
  readonly symbols?: string[]
}

/** Raw JSON shape for artifact/file payloads attached to invalidation events. */
export interface RawInvalidatedArtifactEntry {
  readonly type: string
  readonly files: string[]
}

/** Raw persisted invalidation causes accepted by the fs manifest reader. */
export type RawInvalidatedCause =
  | 'spec-change'
  | 'artifact-drift'
  | 'artifact-review-required'
  | 'spec-overlap-conflict'

/** Raw JSON shape of a `created` event. */
export interface RawCreatedEvent {
  readonly type: 'created'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly specIds: string[]
  readonly schemaName: string
  readonly schemaVersion: number
}

/** Raw JSON shape of a `transitioned` event. */
export interface RawTransitionedEvent {
  readonly type: 'transitioned'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly from: string
  readonly to: string
}

/** Raw JSON shape of a `spec-approved` event. */
export interface RawSpecApprovedEvent {
  readonly type: 'spec-approved'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
  /** Present on native v2 writes; absent on legacy/transitional history. */
  readonly fingerprint?: SpecApprovalFingerprint
}

/** Raw JSON shape of a `signed-off` event. */
export interface RawSignedOffEvent {
  readonly type: 'signed-off'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason: string
  readonly artifactHashes: Record<string, string>
}

/** Raw JSON shape of a `signoff-invalidated` event. */
export interface RawSignoffInvalidatedEvent {
  readonly type: 'signoff-invalidated'
  readonly at: string
  readonly by: ManifestActorIdentity
}

/** Raw JSON shape of an `invalidated` event. */
export interface RawInvalidatedEvent {
  readonly type: 'invalidated'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly cause: RawInvalidatedCause
  readonly message: string
  readonly affectedArtifacts: RawInvalidatedArtifactEntry[]
}

/** Raw JSON shape of an `archive-failed` event. */
export interface RawArchiveFailedEvent {
  readonly type: 'archive-failed'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly step: 'prepare' | 'commit' | 'archive' | 'metadata'
  readonly message: string
  readonly commitStarted: boolean
}

/** Raw JSON shape of a `drafted` event. */
export interface RawDraftedEvent {
  readonly type: 'drafted'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason?: string
}

/** Raw JSON shape of a `restored` event. */
export interface RawRestoredEvent {
  readonly type: 'restored'
  readonly at: string
  readonly by: ManifestActorIdentity
}

/** Raw JSON shape of a `discarded` event. */
export interface RawDiscardedEvent {
  readonly type: 'discarded'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason: string
  readonly supersededBy?: string[]
}

/** Raw JSON shape of an `artifacts-synced` event. */
export interface RawArtifactsSyncedEvent {
  readonly type: 'artifacts-synced'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly typesAdded: string[]
  readonly typesRemoved: string[]
  readonly filesAdded: Array<{ type: string; key: string }>
  readonly filesRemoved: Array<{ type: string; key: string }>
}

/** Raw JSON shape of an `artifact-skipped` event. */
export interface RawArtifactSkippedEvent {
  readonly type: 'artifact-skipped'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly artifactId: string
  readonly reason?: string
}

/** Raw JSON shape of a `description-updated` event. */
export interface RawDescriptionUpdatedEvent {
  readonly type: 'description-updated'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly description: string
}

/** Raw JSON shape of an `approval-invalidated` event. */
export interface RawApprovalInvalidatedEvent {
  readonly type: 'approval-invalidated'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly gate: 'spec' | 'signoff'
  readonly status: 'stale' | 'revoked'
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

/** Raw JSON shape of a `verification-attempt-started` event. */
export interface RawVerificationAttemptStartedEvent {
  readonly type: 'verification-attempt-started'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly attemptId: string
  readonly state: ChangeState
  readonly fingerprintVersion: 1
  readonly artifactAlgorithm: ArtifactFingerprintAlgorithm
  readonly textNormalization: TextNormalizationAlgorithm
  readonly binaryNormalization: BinaryNormalizationAlgorithm
}

/** Raw JSON shape of a `verification-completed` event. */
export interface RawVerificationCompletedEvent {
  readonly type: 'verification-completed'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly attemptId: string
  readonly verificationId: string
}

/** Raw JSON shape of a `verification-invalidated` event. */
export interface RawVerificationInvalidatedEvent {
  readonly type: 'verification-invalidated'
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly verificationId: string
  readonly reason: string
}

/** Discriminated union of raw event JSON shapes for v1 manifests. */
export type RawChangeEventV1 =
  | RawCreatedEvent
  | RawTransitionedEvent
  | RawSpecApprovedEvent
  | RawSignedOffEvent
  | RawSignoffInvalidatedEvent
  | RawInvalidatedEvent
  | RawArchiveFailedEvent
  | RawDraftedEvent
  | RawRestoredEvent
  | RawDiscardedEvent
  | RawArtifactSkippedEvent
  | RawArtifactsSyncedEvent
  | RawDescriptionUpdatedEvent

/** Discriminated union of raw event JSON shapes for v2 manifests. */
export type RawChangeEventV2 =
  | RawChangeEventV1
  | RawApprovalInvalidatedEvent
  | RawVerificationAttemptStartedEvent
  | RawVerificationCompletedEvent
  | RawVerificationInvalidatedEvent

/** Alias for backward compatibility with v1 raw events. */
export type RawChangeEvent = RawChangeEventV2

// ---- Raw projection definitions ----

/** Raw projection invalidation. */
export interface RawProjectionInvalidation {
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

/** Raw approval decision. */
export interface RawApprovalDecision {
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason: string
}

/** Raw spec approval projection. */
export interface RawSpecApprovalProjection {
  readonly status: ProjectionStatus
  readonly decision: RawApprovalDecision
  readonly fingerprint: SpecApprovalFingerprint | ArtifactFingerprint
  readonly invalidation?: RawProjectionInvalidation
}

/** Raw signoff projection. */
export interface RawSignoffProjection {
  readonly status: ProjectionStatus
  readonly decision: RawApprovalDecision
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly verificationId: string | null
  readonly invalidation?: RawProjectionInvalidation
}

/** Raw verification attempt. */
export interface RawVerificationAttempt {
  readonly id: string
  readonly startedAt: string
  readonly startedBy: ManifestActorIdentity
  readonly startedIn: ChangeState
  readonly baseline: ValidityFingerprint
}

/** Raw completed verification. */
export interface RawCompletedVerification {
  readonly id: string
  readonly attemptId: string
  readonly status: 'valid' | 'stale'
  readonly completedAt: string
  readonly completedBy: ManifestActorIdentity
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly invalidation?: RawProjectionInvalidation
}

/** Raw verification projection. */
export interface RawVerificationProjection {
  readonly activeAttempt?: RawVerificationAttempt
  readonly completed?: RawCompletedVerification
}

// ---- Legacy v1 and Native v2 ChangeManifest shapes ----

/** Legacy change manifest v1. */
export interface LegacyChangeManifestV1 {
  readonly manifestVersion?: undefined
  readonly name: string
  readonly createdAt: string
  readonly updatedAt?: string
  readonly description?: string
  readonly archivedAt?: string
  readonly archivedBy?: ManifestActorIdentity
  readonly schema: { readonly name: string; readonly version: number }
  readonly workspaces?: readonly string[]
  readonly specIds: readonly string[]
  readonly specDependsOn?: Readonly<Record<string, readonly string[]>>
  readonly invalidationPolicy?: ArtifactInvalidationPolicy
  readonly implementationTrackingStartedAt?: string | null
  readonly trackedImplementationFiles?: readonly ManifestTrackedImplementationFile[]
  readonly implementationLinks?: readonly ManifestImplementationLink[]
  readonly artifacts: readonly ManifestArtifact[]
  readonly history: readonly RawChangeEventV1[]
}

/** Change manifest v2. */
export interface ChangeManifestV2 {
  readonly manifestVersion: 2
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly description?: string
  readonly archivedAt?: string
  readonly archivedBy?: ManifestActorIdentity
  readonly schema: { readonly name: string; readonly version: number }
  readonly specIds: readonly string[]
  readonly specDependsOn?: Readonly<Record<string, readonly string[]>>
  readonly invalidation: InvalidationPolicy
  readonly artifacts: readonly ManifestArtifact[]
  readonly trackedImplementationFiles?: readonly ManifestTrackedImplementationFile[]
  readonly implementationLinks?: readonly ManifestImplementationLink[]
  readonly implementationTrackingStartedAt?: string | null
  readonly specApproval?: RawSpecApprovalProjection
  readonly signoff?: RawSignoffProjection
  readonly verification?: RawVerificationProjection
  readonly history: readonly RawChangeEventV2[]
}

/** Discriminated union of all supported manifest versions. */
export type ChangeManifest = LegacyChangeManifestV1 | ChangeManifestV2

export const MAX_SUPPORTED_MANIFEST_VERSION = 2

// ---- Zod validation schemas ----

export const actorIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  provider: z.string().optional(),
  providerId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
})

const artifactStatusSchema = z.enum([
  'missing',
  'in-progress',
  'complete',
  'skipped',
  'pending-review',
  'drifted-pending-review',
  'pending-parent-artifact-review',
])

export const manifestArtifactFileSchema = z.object({
  key: z.string(),
  filename: z.string(),
  state: artifactStatusSchema.optional(),
  validatedHash: z.string().nullable(),
  hasDrift: z.boolean().optional(),
})

export const manifestArtifactSchema = z.object({
  type: z.string(),
  optional: z.boolean(),
  requires: z.array(z.string()),
  state: artifactStatusSchema.optional(),
  files: z.array(manifestArtifactFileSchema),
})

export const manifestTrackedImplementationFileSchema = z.object({
  file: z.string(),
  state: z.enum(['open', 'resolved', 'ignored', 'removed']),
})

export const manifestImplementationLinkSchema = z
  .object({
    specId: z.string(),
    file: z.string(),
    fileLinkExplicit: z.boolean(),
    symbols: z.array(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.fileLinkExplicit && (value.symbols === undefined || value.symbols.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileLinkExplicit'],
        message: 'fileLinkExplicit=false requires one or more symbols',
      })
    }
  })

export const rawChangeEventSchema = z
  .object({
    type: z.string(),
    at: z.string(),
    by: actorIdentitySchema,
  })
  .passthrough()

const validityCauseSchema = z.enum([
  'artifact-drift',
  'implementation-drift',
  'scope-change',
  'manual-invalidation',
  'verification-invalidated',
  'spec-overlap-conflict',
  'legacy-unknown',
])

/**
 * Legacy event.
 *
 * @param type - type
 * @param shape - shape
 * @returns passthrough Zod schema for one legacy history event
 */
function legacyEvent<T extends string>(type: T, shape: z.ZodRawShape) {
  return z
    .object({
      type: z.literal(type),
      at: z.string(),
      by: actorIdentitySchema,
      ...shape,
    })
    .passthrough()
}

/** Strict serialized representation of one validity fingerprint difference. */
export const fingerprintDifferenceSchema = z
  .object({
    scope: z.enum(['artifact', 'implementation', 'spec']),
    key: z.string(),
    kind: z.enum([
      'added',
      'removed',
      'changed',
      'algorithm-changed',
      'unreadable',
      'spec-added',
      'spec-removed',
    ]),
    expected: z.string().optional(),
    actual: z.string().optional(),
  })
  .strict()

/**
 * Explicit v2 history variants. Legacy event types stay passthrough so additive
 * historical fields survive; the four validity events are strict.
 */
export const rawChangeEventV2Schema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('approval-invalidated'),
      at: z.string(),
      by: actorIdentitySchema,
      gate: z.enum(['spec', 'signoff']),
      status: z.enum(['stale', 'revoked']),
      cause: validityCauseSchema,
      reason: z.string(),
      differences: z.array(fingerprintDifferenceSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal('verification-attempt-started'),
      at: z.string(),
      by: actorIdentitySchema,
      attemptId: z.string(),
      state: z.string(),
      fingerprintVersion: z.literal(1),
      artifactAlgorithm: z.literal('artifact-pre-hash-v1'),
      textNormalization: z.literal('text-v1'),
      binaryNormalization: z.literal('bytes-v1'),
    })
    .strict(),
  z
    .object({
      type: z.literal('verification-completed'),
      at: z.string(),
      by: actorIdentitySchema,
      attemptId: z.string(),
      verificationId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('verification-invalidated'),
      at: z.string(),
      by: actorIdentitySchema,
      verificationId: z.string(),
      reason: z.string(),
    })
    .strict(),
  legacyEvent('created', {
    specIds: z.array(z.string()),
    schemaName: z.string(),
    schemaVersion: z.number(),
  }),
  legacyEvent('transitioned', { from: z.string(), to: z.string() }),
  legacyEvent('spec-approved', {
    reason: z.string(),
    artifactHashes: z.record(z.string(), z.string()),
    fingerprint: z
      .object({
        version: z.literal(1),
        specIds: z.array(z.string()),
        artifacts: z.lazy(() => artifactFingerprintSchema),
      })
      .strict()
      .optional(),
  }),
  legacyEvent('signed-off', {
    reason: z.string(),
    artifactHashes: z.record(z.string(), z.string()),
  }),
  legacyEvent('signoff-invalidated', {}),
  legacyEvent('invalidated', {
    cause: z.string(),
    message: z.string(),
    affectedArtifacts: z.array(z.object({ type: z.string(), files: z.array(z.string()) })),
  }),
  legacyEvent('archive-failed', {
    step: z.enum(['prepare', 'commit', 'archive', 'metadata']),
    message: z.string(),
    commitStarted: z.boolean(),
  }),
  legacyEvent('drafted', { reason: z.string().optional() }),
  legacyEvent('restored', {}),
  legacyEvent('discarded', { reason: z.string(), supersededBy: z.array(z.string()).optional() }),
  legacyEvent('artifact-skipped', { artifactId: z.string(), reason: z.string().optional() }),
  legacyEvent('artifacts-synced', {
    typesAdded: z.array(z.string()),
    typesRemoved: z.array(z.string()),
    filesAdded: z.array(z.object({ type: z.string(), key: z.string() })),
    filesRemoved: z.array(z.object({ type: z.string(), key: z.string() })),
  }),
  legacyEvent('description-updated', { description: z.string() }),
])

const sha256Pattern = /^sha256:[0-9a-f]{64}$/

export const artifactFingerprintSchema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal('artifact-pre-hash-v1'),
    files: z.record(z.string(), z.string().regex(sha256Pattern)),
  })
  .strict()

export const implementationFingerprintEntrySchema = z.object({
  hash: z.string().regex(sha256Pattern),
  content: z.enum(['text', 'binary']),
  normalization: z.enum(['text-v1', 'bytes-v1']),
})

export const implementationFingerprintSchema = z
  .object({
    version: z.literal(1),
    hashAlgorithm: z.literal('sha256'),
    textNormalization: z.literal('text-v1'),
    binaryNormalization: z.literal('bytes-v1'),
    files: z.record(z.string(), implementationFingerprintEntrySchema),
  })
  .strict()

export const validityFingerprintSchema = z.object({
  version: z.literal(1),
  artifacts: artifactFingerprintSchema,
  implementation: implementationFingerprintSchema,
})

export const rawProjectionInvalidationSchema = z.object({
  at: z.string(),
  by: actorIdentitySchema,
  cause: z.enum([
    'artifact-drift',
    'implementation-drift',
    'scope-change',
    'manual-invalidation',
    'verification-invalidated',
    'spec-overlap-conflict',
    'legacy-unknown',
  ]),
  reason: z.string(),
  differences: z.array(fingerprintDifferenceSchema),
})

export const rawApprovalDecisionSchema = z.object({
  at: z.string(),
  by: actorIdentitySchema,
  reason: z.string(),
})

export const rawSpecApprovalProjectionSchema = z
  .object({
    status: z.enum(['valid', 'stale', 'revoked']),
    decision: rawApprovalDecisionSchema,
    fingerprint: z.union([
      z
        .object({
          version: z.literal(1),
          specIds: z.array(z.string()),
          artifacts: artifactFingerprintSchema,
        })
        .strict(),
      artifactFingerprintSchema,
    ]),
    invalidation: rawProjectionInvalidationSchema.optional(),
  })
  .strict()

export const rawSignoffProjectionSchema = z.object({
  status: z.enum(['valid', 'stale', 'revoked']),
  decision: rawApprovalDecisionSchema,
  fingerprint: z.object({
    version: z.literal(1),
    artifacts: artifactFingerprintSchema,
    implementation: implementationFingerprintSchema.nullable(),
  }),
  verificationId: z.string().nullable(),
  invalidation: rawProjectionInvalidationSchema.optional(),
})

export const rawVerificationAttemptSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  startedBy: actorIdentitySchema,
  startedIn: z.enum([
    'drafting',
    'proposing',
    'specifying',
    'designing',
    'ready',
    'pending-spec-approval',
    'spec-approved',
    'implementing',
    'verifying',
    'done',
    'pending-signoff',
    'signed-off',
    'archivable',
    'archiving',
    'archived',
    'drafted',
    'discarded',
  ]),
  baseline: validityFingerprintSchema,
})

export const rawCompletedVerificationSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  status: z.enum(['valid', 'stale']),
  completedAt: z.string(),
  completedBy: actorIdentitySchema,
  fingerprint: z.object({
    version: z.literal(1),
    artifacts: artifactFingerprintSchema,
    implementation: implementationFingerprintSchema.nullable(),
  }),
  invalidation: rawProjectionInvalidationSchema.optional(),
})

export const rawVerificationProjectionSchema = z.object({
  activeAttempt: rawVerificationAttemptSchema.optional(),
  completed: rawCompletedVerificationSchema.optional(),
})

export const invalidationPolicySchema = z.object({
  artifacts: z.enum(['none', 'surgical', 'downstream', 'global']),
  workflow: z.enum(['preserve', 'redesign']),
})

export const legacyChangeManifestV1Schema = z.object({
  manifestVersion: z.undefined().optional(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  description: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedBy: actorIdentitySchema.optional(),
  schema: z.object({
    name: z.string(),
    version: z.number(),
  }),
  workspaces: z.array(z.string()).optional(),
  specIds: z.array(z.string()),
  specDependsOn: z.record(z.string(), z.array(z.string())).optional(),
  invalidationPolicy: z.enum(['none', 'surgical', 'downstream', 'global']).optional(),
  implementationTrackingStartedAt: z.string().datetime().optional().nullable(),
  trackedImplementationFiles: z.array(manifestTrackedImplementationFileSchema).optional(),
  implementationLinks: z.array(manifestImplementationLinkSchema).optional(),
  artifacts: z.array(manifestArtifactSchema),
  history: z.array(rawChangeEventSchema),
})

export const changeManifestV2Schema = z.object({
  manifestVersion: z.literal(2),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  description: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedBy: actorIdentitySchema.optional(),
  schema: z.object({
    name: z.string(),
    version: z.number(),
  }),
  specIds: z.array(z.string()),
  specDependsOn: z.record(z.string(), z.array(z.string())).optional(),
  invalidation: invalidationPolicySchema,
  artifacts: z.array(manifestArtifactSchema),
  trackedImplementationFiles: z.array(manifestTrackedImplementationFileSchema).optional(),
  implementationLinks: z.array(manifestImplementationLinkSchema).optional(),
  implementationTrackingStartedAt: z.string().datetime().optional().nullable(),
  specApproval: rawSpecApprovalProjectionSchema.optional(),
  signoff: rawSignoffProjectionSchema.optional(),
  verification: rawVerificationProjectionSchema.optional(),
  history: z.array(rawChangeEventV2Schema),
})

/**
 * Top-level union schema that accepts either a v1 or v2 manifest.
 */
export const changeManifestSchema = z.union([changeManifestV2Schema, legacyChangeManifestV1Schema])

/**
 * Parses and validates raw manifest content according to manifestVersion.
 *
 * Missing or undefined `manifestVersion` uses the legacy v1 schema.
 * Version 2 uses the strict v2 schema.
 * Greater versions or invalid non-number versions throw `UnsupportedManifestVersionError`.
 * Malformed valid-version shapes throw `CorruptedManifestError`.
 *
 * @param raw - Unknown deserialized JSON object
 * @returns Validated `ChangeManifest` (v1 or v2)
 * @throws {UnsupportedManifestVersionError} When `manifestVersion` is unsupported or invalid
 * @throws {CorruptedManifestError} When manifest structure is invalid
 */
export function parseChangeManifest(raw: unknown): ChangeManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new CorruptedManifestError('manifest root must be an object')
  }

  const obj = raw as Record<string, unknown>
  if ('manifestVersion' in obj && obj.manifestVersion !== undefined) {
    const version = obj.manifestVersion
    if (version !== 2) {
      throw new UnsupportedManifestVersionError(version)
    }
    const parsed = changeManifestV2Schema.safeParse(raw)
    if (!parsed.success) {
      throw new CorruptedManifestError(parsed.error.issues.map((i) => i.message).join(', '))
    }
    return parsed.data as ChangeManifestV2
  }

  // Absent version -> v1
  const parsed = legacyChangeManifestV1Schema.safeParse(raw)
  if (!parsed.success) {
    throw new CorruptedManifestError(parsed.error.issues.map((i) => i.message).join(', '))
  }
  return parsed.data as LegacyChangeManifestV1
}
