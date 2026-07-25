import { type SpecMetadata, type SpecMetadataProvenance } from './parse-metadata.js'

/** Reason codes explaining why persisted metadata is stale. */
export type MetadataFreshnessReason =
  | 'missing'
  | 'invalid'
  | 'artifact-added'
  | 'artifact-removed'
  | 'artifact-changed'
  | 'schema-changed'
  | 'persisted-state-changed'
  | 'projection-changed'

/** Result of comparing persisted metadata provenance to current source state. */
export interface MetadataFreshnessAssessment {
  readonly fresh: boolean
  readonly reasons: readonly MetadataFreshnessReason[]
}

/** Current artifact, schema, and projection inputs used for freshness comparison. */
export interface SpecMetadataSourceState {
  readonly artifacts: Readonly<
    Record<string, { readonly hash: string; readonly lastModified: string }>
  >
  readonly persistedStateHash: string | null
  readonly schema: { readonly name: string; readonly version: number }
  readonly projectionVersion: number
  readonly projectionFingerprint: string
}

/**
 * Pure comparison between persisted metadata provenance and current source state.
 * Never performs I/O. `lastModified` is never compared.
 *
 * @param persisted - Previously materialized metadata.
 * @param current - Current source state snapshot.
 * @returns Freshness assessment with reason codes when stale.
 */
export function assessMetadataFreshness(
  persisted: SpecMetadata,
  current: SpecMetadataSourceState,
): MetadataFreshnessAssessment {
  if (persisted.provenance === undefined) {
    return { fresh: false, reasons: ['missing'] }
  }

  const reasons: MetadataFreshnessReason[] = []
  const provenance: SpecMetadataProvenance = persisted.provenance

  if (provenance.persistedStateHash !== current.persistedStateHash) {
    reasons.push('persisted-state-changed')
  }

  if (
    provenance.schema.name !== current.schema.name ||
    provenance.schema.version !== current.schema.version
  ) {
    reasons.push('schema-changed')
  }

  if (provenance.projectionVersion !== current.projectionVersion) {
    reasons.push('projection-changed')
  }

  if (provenance.projectionFingerprint !== current.projectionFingerprint) {
    reasons.push('projection-changed')
  }

  compareArtifactSets(provenance.artifacts, current.artifacts, reasons)

  return {
    fresh: reasons.length === 0,
    reasons,
  }
}

/**
 * Appends artifact add/remove/change reasons by comparing persisted and current sets.
 *
 * @param persisted - Artifact baselines from metadata provenance.
 * @param current - Current artifact hashes.
 * @param reasons - Mutable reason accumulator.
 */
function compareArtifactSets(
  persisted: Readonly<Record<string, { readonly hash: string; readonly lastModified: string }>>,
  current: Readonly<Record<string, { readonly hash: string; readonly lastModified: string }>>,
  reasons: MetadataFreshnessReason[],
): void {
  const persistedKeys = new Set(Object.keys(persisted))
  const currentKeys = new Set(Object.keys(current))

  for (const filename of currentKeys) {
    if (!persistedKeys.has(filename)) {
      reasons.push('artifact-added')
    }
  }

  for (const filename of persistedKeys) {
    if (!currentKeys.has(filename)) {
      reasons.push('artifact-removed')
    }
  }

  for (const filename of persistedKeys) {
    if (!currentKeys.has(filename)) {
      continue
    }
    if (persisted[filename]!.hash !== current[filename]!.hash) {
      reasons.push('artifact-changed')
      break
    }
  }
}
