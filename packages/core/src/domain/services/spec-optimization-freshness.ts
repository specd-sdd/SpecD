import {
  type PersistedArtifactState,
  type PersistedOptimizationField,
  type PersistedSchemaIdentity,
} from './spec-optimization.js'

/** Reasons a persisted optimization field is stale or absent. */
export type PersistedOptimizationStaleReason =
  | 'artifact-added'
  | 'artifact-removed'
  | 'artifact-changed'
  | 'schema-changed'
  | 'missing'

/** Freshness assessment for one persisted optimization field. */
export interface OptimizationFieldFreshness {
  readonly fresh: boolean
  readonly reasons: readonly PersistedOptimizationStaleReason[]
}

/**
 * Classifies one optimization field against current artifact state and schema.
 * Equal hash with unequal lastModified never counts as a change.
 *
 * @param field - Persisted optimization field, if any.
 * @param currentArtifactState - Current artifact hashes.
 * @param currentSchema - Current schema identity.
 * @returns Freshness assessment with stale reason codes.
 */
export function classifyOptimizationFieldFreshness(
  field: PersistedOptimizationField | undefined,
  currentArtifactState: PersistedArtifactState,
  currentSchema: PersistedSchemaIdentity,
): OptimizationFieldFreshness {
  if (field === undefined) {
    return { fresh: false, reasons: ['missing'] }
  }

  const reasons: PersistedOptimizationStaleReason[] = []

  if (field.schema.name !== currentSchema.name || field.schema.version !== currentSchema.version) {
    reasons.push('schema-changed')
  }

  const baseline = field.artifactState
  const baselineKeys = new Set(Object.keys(baseline))
  const currentKeys = new Set(Object.keys(currentArtifactState))

  for (const filename of currentKeys) {
    if (!baselineKeys.has(filename)) {
      reasons.push('artifact-added')
    }
  }

  for (const filename of baselineKeys) {
    if (!currentKeys.has(filename)) {
      reasons.push('artifact-removed')
    }
  }

  for (const filename of baselineKeys) {
    if (!currentKeys.has(filename)) {
      continue
    }
    const baselineHash = baseline[filename]!.hash
    const currentHash = currentArtifactState[filename]!.hash
    if (baselineHash !== currentHash) {
      reasons.push('artifact-changed')
      break
    }
  }

  const staleReasons = reasons.filter(
    (r) =>
      r === 'artifact-added' ||
      r === 'artifact-removed' ||
      r === 'artifact-changed' ||
      r === 'schema-changed',
  )

  return {
    fresh: staleReasons.length === 0,
    reasons,
  }
}
