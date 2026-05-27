import { Change, type ChangeEvent } from '../../domain/entities/change.js'
import { ArtifactFile } from '../../domain/value-objects/artifact-file.js'
import { ChangeArtifact } from '../../domain/entities/change-artifact.js'
import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { CorruptedManifestError } from '../../domain/errors/corrupted-manifest-error.js'
import { type ChangeManifest, type RawChangeEvent } from './manifest.js'

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
 * Artifact and file states are taken from the manifest as stored at archive time.
 *
 * @param manifest - Parsed archive manifest
 * @returns Rehydrated change aggregate
 */
export function loadChangeFromManifest(manifest: ChangeManifest): Change {
  const artifactMap = new Map<string, ChangeArtifact>()

  for (const raw of manifest.artifacts) {
    const filesMap = new Map<string, ArtifactFile>()
    for (const rawFile of raw.files) {
      filesMap.set(
        rawFile.key,
        new ArtifactFile({
          key: rawFile.key,
          filename: rawFile.filename,
          status: rawFile.state ?? 'missing',
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
        requires: raw.requires,
        status: raw.state ?? 'missing',
        files: filesMap,
      }),
    )
  }

  const history = manifest.history.map(deserializeManifestEvent)

  let specDependsOn: Map<string, readonly string[]> | undefined
  if (manifest.specDependsOn !== undefined) {
    specDependsOn = new Map<string, readonly string[]>()
    for (const [key, deps] of Object.entries(manifest.specDependsOn)) {
      specDependsOn.set(key, deps)
    }
  }

  return new Change({
    name: manifest.name,
    createdAt: new Date(manifest.createdAt),
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    specIds: manifest.specIds,
    ...(manifest.trackedImplementationFiles !== undefined
      ? { trackedImplementationFiles: manifest.trackedImplementationFiles }
      : {}),
    ...(manifest.implementationLinks !== undefined
      ? { implementationLinks: manifest.implementationLinks }
      : {}),
    history,
    artifacts: artifactMap,
    ...(specDependsOn !== undefined ? { specDependsOn } : {}),
    ...(manifest.invalidationPolicy !== undefined
      ? { invalidationPolicy: manifest.invalidationPolicy }
      : {}),
  })
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
      }
    case 'signed-off':
      return {
        type: 'signed-off',
        at: new Date(raw.at),
        by: raw.by,
        reason: raw.reason,
        artifactHashes: raw.artifactHashes,
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
