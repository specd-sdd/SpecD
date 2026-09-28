import {
  Change,
  type ChangeEvent,
  type SpecApprovalProjection,
  type SignoffProjection,
  type VerificationProjection,
  type VerificationAttempt,
  type CompletedVerification,
} from '../../domain/entities/change.js'
import { ArtifactFile } from '../../domain/value-objects/artifact-file.js'
import { ChangeArtifact } from '../../domain/entities/change-artifact.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { fromLegacyInvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import {
  type ChangeManifest,
  type LegacyChangeManifestV1,
  type ChangeManifestV2,
  type RawChangeEvent,
  type RawSpecApprovalProjection,
  type RawSignoffProjection,
  type RawVerificationProjection,
  type RawVerificationAttempt,
  type RawCompletedVerification,
} from './manifest.js'

const CHANGE_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/** All valid `InvalidatedEvent` cause values. */
const INVALIDATED_CAUSES = [
  'spec-change',
  'artifact-drift',
  'artifact-review-required',
  'spec-overlap-conflict',
] as const
/** Historical persisted cause kept readable for archived manifests. */
const LEGACY_INVALIDATED_CAUSE = 'artifact-change' as const
/** Union of valid `InvalidatedEvent` cause strings. */
type InvalidatedCause = (typeof INVALIDATED_CAUSES)[number]

/**
 * Builds a {@link Change} from a persisted manifest without filesystem I/O.
 *
 * Dispatches between legacy v1 manifests and native v2 manifests.
 *
 * @param manifest - Parsed change manifest (v1 or v2)
 * @returns Rehydrated change aggregate
 */
export function loadChangeFromManifest(manifest: ChangeManifest): Change {
  if (manifest.manifestVersion === 2) {
    return loadV2Manifest(manifest)
  }
  return adaptV1Manifest(manifest)
}

/**
 * Native v2 loader: hydrates projections, attempts, structured policy, artifacts,
 * and append-only history without evaluating freshness or inventing baselines.
 *
 * @param manifest - Version 2 change manifest
 * @returns Rehydrated change aggregate
 */
function loadV2Manifest(manifest: ChangeManifestV2): Change {
  const artifactMap = buildArtifactMap(manifest.artifacts)
  const history = manifest.history.map(deserializeManifestEvent)

  let specDependsOn: Map<string, readonly string[]> | undefined
  if (manifest.specDependsOn !== undefined) {
    specDependsOn = new Map<string, readonly string[]>()
    for (const [key, deps] of Object.entries(manifest.specDependsOn)) {
      specDependsOn.set(key, deps)
    }
  }

  const specApproval = manifest.specApproval
    ? deserializeSpecApprovalProjection(manifest.specApproval)
    : undefined

  const signoff = manifest.signoff ? deserializeSignoffProjection(manifest.signoff) : undefined

  const verification = manifest.verification
    ? deserializeVerificationProjection(manifest.verification)
    : undefined

  return new Change({
    name: manifest.name,
    createdAt: new Date(manifest.createdAt),
    updatedAt: new Date(manifest.updatedAt),
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    specIds: [...manifest.specIds],
    ...(manifest.trackedImplementationFiles !== undefined
      ? { trackedImplementationFiles: manifest.trackedImplementationFiles }
      : {}),
    ...(manifest.implementationLinks !== undefined
      ? { implementationLinks: manifest.implementationLinks }
      : {}),
    history,
    artifacts: artifactMap,
    ...(specDependsOn !== undefined ? { specDependsOn } : {}),
    invalidationPolicy: manifest.invalidation,
    ...(manifest.implementationTrackingStartedAt !== undefined
      ? {
          implementationTrackingStartedAt:
            manifest.implementationTrackingStartedAt !== null
              ? new Date(manifest.implementationTrackingStartedAt)
              : null,
        }
      : {}),
    ...(specApproval !== undefined ? { specApproval } : {}),
    ...(signoff !== undefined ? { signoff } : {}),
    ...(verification !== undefined ? { verification } : {}),
  })
}

/**
 * Side-effect-free v1 adapter: replays legacy history once in memory to derive
 * approval/sign-off projections and mark unknown evidence non-authoritative.
 *
 * Rules:
 * - A legacy spec-approved event sets specApproval to valid.
 * - A legacy signed-off event sets signoff to valid with implementation: null.
 * - A later broad 'invalidated' event marks any prior approvals stale with cause 'legacy-unknown'.
 * - A 'signoff-invalidated' event marks signoff as revoked with cause 'manual-invalidation'.
 * - If historical verification can be recognized (e.g. from transition to done/verifying),
 *   it is adapted as stale completed evidence with implementation: null; otherwise absent.
 * - Current files are never used to invent a historical baseline.
 *
 * @param manifest - Legacy version 1 change manifest
 * @returns Rehydrated change aggregate
 */
function adaptV1Manifest(manifest: LegacyChangeManifestV1): Change {
  const artifactMap = buildArtifactMap(manifest.artifacts)
  const history = manifest.history.map(deserializeManifestEvent)

  let specDependsOn: Map<string, readonly string[]> | undefined
  if (manifest.specDependsOn !== undefined) {
    specDependsOn = new Map<string, readonly string[]>()
    for (const [key, deps] of Object.entries(manifest.specDependsOn)) {
      specDependsOn.set(key, deps)
    }
  }

  // In-memory replay of v1 history for projections
  let specApproval: SpecApprovalProjection | undefined
  let signoff: SignoffProjection | undefined
  let verification: VerificationProjection | undefined

  for (const evt of manifest.history) {
    if (evt.type === 'spec-approved') {
      const artHashes: Record<string, `sha256:${string}`> = {}
      for (const [k, v] of Object.entries(evt.artifactHashes ?? {})) {
        artHashes[k] = v as `sha256:${string}`
      }
      specApproval = {
        status: 'stale',
        decision: {
          at: new Date(evt.at),
          by: evt.by,
          reason: evt.reason ?? '',
        },
        fingerprint: {
          version: 1,
          specIds: [],
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: artHashes },
        },
        invalidation: {
          at: new Date(evt.at),
          by: evt.by,
          cause: 'legacy-unknown',
          reason: 'Legacy spec approval does not record its approved spec scope',
          differences: [
            {
              scope: 'spec',
              key: '$scope',
              kind: 'unreadable',
              expected: 'recorded approval scope',
              actual: 'legacy-unknown',
            },
          ],
        },
      }
    } else if (evt.type === 'signed-off') {
      const artHashes: Record<string, `sha256:${string}`> = {}
      for (const [k, v] of Object.entries(evt.artifactHashes ?? {})) {
        artHashes[k] = v as `sha256:${string}`
      }
      signoff = {
        status: 'valid',
        decision: {
          at: new Date(evt.at),
          by: evt.by,
          reason: evt.reason ?? '',
        },
        fingerprint: {
          version: 1,
          artifacts: {
            version: 1,
            algorithm: 'artifact-pre-hash-v1',
            files: artHashes,
          },
          implementation: null,
        },
        verificationId: null,
      }
    } else if (evt.type === 'signoff-invalidated') {
      if (signoff !== undefined) {
        signoff = {
          ...signoff,
          status: 'revoked',
          invalidation: {
            at: new Date(evt.at),
            by: evt.by,
            cause: 'manual-invalidation',
            reason: 'Signoff cleared',
            differences: [],
          },
        }
      }
    } else if (evt.type === 'invalidated') {
      const invalAt = new Date(evt.at)
      if (specApproval !== undefined && specApproval.status === 'valid') {
        specApproval = {
          ...specApproval,
          status: 'stale',
          invalidation: {
            at: invalAt,
            by: evt.by,
            cause: 'legacy-unknown',
            reason: evt.message ?? 'Invalidated in legacy change',
            differences: [],
          },
        }
      }
      if (signoff !== undefined && signoff.status === 'valid') {
        signoff = {
          ...signoff,
          status: 'stale',
          invalidation: {
            at: invalAt,
            by: evt.by,
            cause: 'legacy-unknown',
            reason: evt.message ?? 'Invalidated in legacy change',
            differences: [],
          },
        }
      }
      if (verification?.completed !== undefined && verification.completed.status === 'valid') {
        verification = {
          ...verification,
          completed: {
            ...verification.completed,
            status: 'stale',
            invalidation: {
              at: invalAt,
              by: evt.by,
              cause: 'legacy-unknown',
              reason: evt.message ?? 'Invalidated in legacy change',
              differences: [],
            },
          },
        }
      }
    }
  }

  const invalidationPolicy = fromLegacyInvalidationPolicy(manifest.invalidationPolicy)

  return new Change({
    name: manifest.name,
    createdAt: new Date(manifest.createdAt),
    ...(manifest.updatedAt !== undefined ? { updatedAt: new Date(manifest.updatedAt) } : {}),
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    specIds: [...manifest.specIds],
    ...(manifest.trackedImplementationFiles !== undefined
      ? { trackedImplementationFiles: manifest.trackedImplementationFiles }
      : {}),
    ...(manifest.implementationLinks !== undefined
      ? { implementationLinks: manifest.implementationLinks }
      : {}),
    history,
    artifacts: artifactMap,
    ...(specDependsOn !== undefined ? { specDependsOn } : {}),
    invalidationPolicy,
    ...(manifest.implementationTrackingStartedAt !== undefined
      ? {
          implementationTrackingStartedAt:
            manifest.implementationTrackingStartedAt !== null
              ? new Date(manifest.implementationTrackingStartedAt)
              : null,
        }
      : {}),
    ...(specApproval !== undefined ? { specApproval } : {}),
    ...(signoff !== undefined ? { signoff } : {}),
    ...(verification !== undefined ? { verification } : {}),
  })
}

/**
 * Build artifact map.
 *
 * @param artifacts - artifacts
 * @returns build artifact map result
 */
function buildArtifactMap(
  artifacts: readonly import('./manifest.js').ManifestArtifact[],
): Map<string, ChangeArtifact> {
  const artifactMap = new Map<string, ChangeArtifact>()
  for (const raw of artifacts) {
    const filesMap = new Map<string, ArtifactFile>()
    for (const rawFile of raw.files) {
      filesMap.set(
        rawFile.key,
        new ArtifactFile({
          key: rawFile.key,
          filename: rawFile.filename,
          status:
            rawFile.state === 'pending-parent-artifact-review'
              ? 'in-progress'
              : (rawFile.state ?? 'missing'),
          ...(rawFile.validatedHash !== null ? { validatedHash: rawFile.validatedHash } : {}),
          ...(rawFile.hasDrift === true ? { hasDrift: true } : {}),
        }),
      )
    }

    artifactMap.set(
      raw.type,
      new ChangeArtifact({
        type: raw.type,
        optional: raw.optional,
        requires: [...raw.requires],
        status:
          raw.state === 'pending-parent-artifact-review' ? 'in-progress' : (raw.state ?? 'missing'),
        files: filesMap,
      }),
    )
  }
  return artifactMap
}

/**
 * Deserialize spec approval projection.
 *
 * @param raw - raw
 * @returns deserialize spec approval projection result
 */
function deserializeSpecApprovalProjection(raw: RawSpecApprovalProjection): SpecApprovalProjection {
  const hasScope = 'specIds' in raw.fingerprint
  return {
    status: hasScope ? raw.status : 'stale',
    decision: {
      at: new Date(raw.decision.at),
      by: raw.decision.by,
      reason: raw.decision.reason,
    },
    fingerprint: hasScope
      ? raw.fingerprint
      : { version: 1, specIds: [], artifacts: raw.fingerprint },
    ...(!hasScope
      ? {
          invalidation: {
            at: new Date(raw.decision.at),
            by: raw.decision.by,
            cause: 'legacy-unknown' as const,
            reason: 'Stored spec approval does not record its approved spec scope',
            differences: [
              {
                scope: 'spec' as const,
                key: '$scope',
                kind: 'unreadable' as const,
                expected: 'recorded approval scope',
                actual: 'legacy-unknown',
              },
            ],
          },
        }
      : raw.invalidation
        ? {
            invalidation: {
              at: new Date(raw.invalidation.at),
              by: raw.invalidation.by,
              cause: raw.invalidation.cause,
              reason: raw.invalidation.reason,
              differences: raw.invalidation.differences,
            },
          }
        : {}),
  }
}

/**
 * Deserialize signoff projection.
 *
 * @param raw - raw
 * @returns deserialize signoff projection result
 */
function deserializeSignoffProjection(raw: RawSignoffProjection): SignoffProjection {
  return {
    status: raw.status,
    decision: {
      at: new Date(raw.decision.at),
      by: raw.decision.by,
      reason: raw.decision.reason,
    },
    fingerprint: raw.fingerprint,
    verificationId: raw.verificationId,
    ...(raw.invalidation
      ? {
          invalidation: {
            at: new Date(raw.invalidation.at),
            by: raw.invalidation.by,
            cause: raw.invalidation.cause,
            reason: raw.invalidation.reason,
            differences: raw.invalidation.differences,
          },
        }
      : {}),
  }
}

/**
 * Deserialize verification projection.
 *
 * @param raw - raw
 * @returns deserialize verification projection result
 */
function deserializeVerificationProjection(raw: RawVerificationProjection): VerificationProjection {
  return {
    ...(raw.activeAttempt
      ? { activeAttempt: deserializeVerificationAttempt(raw.activeAttempt) }
      : {}),
    ...(raw.completed ? { completed: deserializeCompletedVerification(raw.completed) } : {}),
  }
}

/**
 * Deserialize verification attempt.
 *
 * @param raw - raw
 * @returns deserialize verification attempt result
 */
function deserializeVerificationAttempt(raw: RawVerificationAttempt): VerificationAttempt {
  return {
    id: raw.id,
    startedAt: new Date(raw.startedAt),
    startedBy: raw.startedBy,
    startedIn: raw.startedIn,
    baseline: raw.baseline,
  }
}

/**
 * Deserialize completed verification.
 *
 * @param raw - raw
 * @returns deserialize completed verification result
 */
function deserializeCompletedVerification(raw: RawCompletedVerification): CompletedVerification {
  return {
    id: raw.id,
    attemptId: raw.attemptId,
    status: raw.status,
    completedAt: new Date(raw.completedAt),
    completedBy: raw.completedBy,
    fingerprint: raw.fingerprint,
    ...(raw.invalidation
      ? {
          invalidation: {
            at: new Date(raw.invalidation.at),
            by: raw.invalidation.by,
            cause: raw.invalidation.cause,
            reason: raw.invalidation.reason,
            differences: raw.invalidation.differences,
          },
        }
      : {}),
  }
}

/**
 * Deserializes a raw JSON event object into a {@link ChangeEvent}.
 *
 * @param raw - Raw manifest history event
 * @returns Domain change event
 */
export function deserializeManifestEvent(raw: RawChangeEvent): ChangeEvent {
  switch (raw.type) {
    case 'created':
      return {
        type: 'created',
        at: new Date(raw.at),
        by: raw.by,
        specIds: raw.specIds,
        schemaName: raw.schemaName,
        schemaVersion: raw.schemaVersion,
      }
    case 'transitioned':
      return {
        type: 'transitioned',
        at: new Date(raw.at),
        by: raw.by,
        from: assertChangeState(raw.from, 'from'),
        to: assertChangeState(raw.to, 'to'),
      }
    case 'spec-approved':
      return {
        type: 'spec-approved',
        at: new Date(raw.at),
        by: raw.by,
        reason: raw.reason,
        artifactHashes: raw.artifactHashes,
        ...(raw.fingerprint !== undefined ? { fingerprint: raw.fingerprint } : {}),
      }
    case 'signed-off':
      return {
        type: 'signed-off',
        at: new Date(raw.at),
        by: raw.by,
        reason: raw.reason,
        artifactHashes: raw.artifactHashes,
      }
    case 'signoff-invalidated':
      return {
        type: 'signoff-invalidated',
        at: new Date(raw.at),
        by: raw.by,
      }
    case 'invalidated':
      return {
        type: 'invalidated',
        at: new Date(raw.at),
        by: raw.by,
        cause: normalizeInvalidatedCause(raw.cause),
        message: raw.message,
        affectedArtifacts: (raw.affectedArtifacts ?? []).map((artifact) => ({
          type: artifact.type,
          files: artifact.files,
        })),
      }
    case 'archive-failed':
      return {
        type: 'archive-failed',
        at: new Date(raw.at),
        by: raw.by,
        step: raw.step,
        message: raw.message,
        commitStarted: raw.commitStarted,
      }
    case 'drafted':
      return raw.reason !== undefined
        ? { type: 'drafted', at: new Date(raw.at), by: raw.by, reason: raw.reason }
        : { type: 'drafted', at: new Date(raw.at), by: raw.by }
    case 'restored':
      return { type: 'restored', at: new Date(raw.at), by: raw.by }
    case 'discarded':
      return raw.supersededBy !== undefined
        ? {
            type: 'discarded',
            at: new Date(raw.at),
            by: raw.by,
            reason: raw.reason,
            supersededBy: raw.supersededBy,
          }
        : { type: 'discarded', at: new Date(raw.at), by: raw.by, reason: raw.reason }
    case 'artifact-skipped':
      return raw.reason !== undefined
        ? {
            type: 'artifact-skipped',
            at: new Date(raw.at),
            by: raw.by,
            artifactId: raw.artifactId,
            reason: raw.reason,
          }
        : { type: 'artifact-skipped', at: new Date(raw.at), by: raw.by, artifactId: raw.artifactId }
    case 'artifacts-synced':
      return {
        type: 'artifacts-synced',
        at: new Date(raw.at),
        by: raw.by ?? { name: 'specd', email: 'system@getspecd.dev' },
        typesAdded: raw.typesAdded ?? [],
        typesRemoved: raw.typesRemoved ?? [],
        filesAdded: raw.filesAdded ?? [],
        filesRemoved: raw.filesRemoved ?? [],
      }
    case 'description-updated':
      return {
        type: 'description-updated',
        at: new Date(raw.at),
        by: raw.by,
        description: raw.description,
      }
    case 'approval-invalidated':
      return {
        type: 'approval-invalidated',
        at: new Date(raw.at),
        by: raw.by,
        gate: raw.gate,
        status: raw.status,
        cause: raw.cause,
        reason: raw.reason,
        differences: raw.differences,
      }
    case 'verification-attempt-started':
      return {
        type: 'verification-attempt-started',
        at: new Date(raw.at),
        by: raw.by,
        attemptId: raw.attemptId,
        state: raw.state,
        fingerprintVersion: raw.fingerprintVersion,
        artifactAlgorithm: raw.artifactAlgorithm,
        textNormalization: raw.textNormalization,
        binaryNormalization: raw.binaryNormalization,
      }
    case 'verification-completed':
      return {
        type: 'verification-completed',
        at: new Date(raw.at),
        by: raw.by,
        attemptId: raw.attemptId,
        verificationId: raw.verificationId,
      }
    case 'verification-invalidated':
      return {
        type: 'verification-invalidated',
        at: new Date(raw.at),
        by: raw.by,
        verificationId: raw.verificationId,
        reason: raw.reason,
      }
  }
}

/**
 * Asserts a manifest lifecycle state string is a valid {@link ChangeState}.
 *
 * @param value - Raw state string from manifest JSON
 * @param label - Field label for error messages
 * @returns Parsed change state
 * @throws {CorruptedManifestError} When the value is not a valid state
 */
function assertChangeState(value: string, label: string): ChangeState {
  if ((CHANGE_STATES as readonly string[]).includes(value)) return value as ChangeState
  throw new CorruptedManifestError(`invalid ${label} state in manifest: '${value}'`)
}

/**
 * Normalizes persisted invalidation cause strings, including legacy values.
 *
 * @param value - Raw cause string from manifest JSON
 * @returns Parsed invalidation cause
 * @throws {CorruptedManifestError} When the value is not a recognized cause
 */
function normalizeInvalidatedCause(value: string): InvalidatedCause {
  if ((INVALIDATED_CAUSES as readonly string[]).includes(value)) return value as InvalidatedCause
  if (value === LEGACY_INVALIDATED_CAUSE) return 'artifact-drift'
  throw new CorruptedManifestError(`invalid invalidated cause in manifest: '${value}'`)
}
