import { type ChangeArtifact } from '../entities/change-artifact.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { type Schema } from '../value-objects/schema.js'
import { Logger } from '../../observability/logger.js'

/** Artifact lookup for DAG projection (`Change` or a drafted view). */
export interface ArtifactGraphSource {
  readonly name: string
  readonly artifacts: ReadonlyMap<string, ChangeArtifact>
  getArtifact(type: string): ChangeArtifact | null
}

/**
 * Finds the nearest upstream artifact in the DAG whose status is `pending-review` or
 * `drifted-pending-review`, causing `artifactId` to be blocked for review.
 *
 * @param change - Change or drafted artifact source
 * @param schema - Sovereign change schema
 * @param artifactId - Artifact identifier to inspect
 * @returns Blocking parent artifact and status, or `null` when none
 */
export function findBlockingParent(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
): { artifactId: string; status: ArtifactStatus } | null {
  return findBlockingParentInternal(change, schema, artifactId, new Set())
}

/**
 * Computes the effective DAG status of an artifact, propagating upstream review or
 * incomplete blocks.
 *
 * @param change - Change or drafted artifact source
 * @param schema - Sovereign change schema
 * @param artifactId - Artifact identifier to evaluate
 * @param visiting - Cycle-guard set of visited artifact ids
 * @returns Effective artifact status
 */
export function effectiveStatus(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
  visiting: Set<string>,
): ArtifactStatus {
  const artifact = change.getArtifact(artifactId)
  if (artifact === null) return 'missing'
  if (artifact.status === 'missing') return 'missing'
  if (
    artifact.status === 'pending-review' ||
    artifact.status === 'drifted-pending-review' ||
    artifact.status === 'skipped' ||
    artifact.status === 'in-progress'
  ) {
    return artifact.status
  }
  if (visiting.has(artifactId)) {
    return 'in-progress'
  }

  visiting.add(artifactId)
  let blockedByReview = false
  let blockedByIncomplete = false
  for (const requiredId of requiresForArtifact(change, schema, artifactId)) {
    const requiredStatus = effectiveStatus(change, schema, requiredId, visiting)
    if (requiredStatus === 'complete' || requiredStatus === 'skipped') {
      continue
    }
    if (
      requiredStatus === 'pending-review' ||
      requiredStatus === 'drifted-pending-review' ||
      requiredStatus === 'pending-parent-artifact-review'
    ) {
      blockedByReview = true
      continue
    }

    blockedByIncomplete = true
  }
  visiting.delete(artifactId)

  if (blockedByReview) {
    const parent = findBlockingParentInternal(change, schema, artifactId, new Set())
    Logger.debug('evaluateLifecycleVerdict downgraded artifact to parent-review', {
      change: change.name,
      artifactId,
      blockedBy: parent?.artifactId ?? null,
      blockedByStatus: parent?.status ?? null,
    })
    return 'pending-parent-artifact-review'
  }

  if (blockedByIncomplete) {
    return 'in-progress'
  }

  return artifact.status
}

/**
 * Recursively finds the first upstream required artifact awaiting review.
 *
 * @param change - Artifact graph source
 * @param schema - Change schema
 * @param artifactId - Artifact to inspect
 * @param visiting - Cycle-guard set
 * @returns First blocking parent or `null`
 */
function findBlockingParentInternal(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
  visiting: Set<string>,
): { artifactId: string; status: ArtifactStatus } | null {
  const requiredIds = requiresForArtifact(change, schema, artifactId)
  if (visiting.has(artifactId)) {
    return null
  }

  visiting.add(artifactId)
  for (const requiredId of requiredIds) {
    const requiredStatus = effectiveStatus(change, schema, requiredId, new Set())
    if (requiredStatus === 'pending-review' || requiredStatus === 'drifted-pending-review') {
      return { artifactId: requiredId, status: requiredStatus }
    }
    const parent = findBlockingParentInternal(change, schema, requiredId, visiting)
    if (parent !== null) {
      return parent
    }
  }

  return null
}

/**
 * Returns required parent artifact IDs from the schema DAG or change artifact fallback.
 *
 * @param change - Artifact graph source
 * @param schema - Change schema
 * @param artifactId - Artifact identifier
 * @returns Required parent artifact IDs
 */
function requiresForArtifact(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
): readonly string[] {
  if (schema.artifact(artifactId) !== null) {
    return schema.artifactDag().parentsOf(artifactId)
  }
  return change.getArtifact(artifactId)?.requires ?? []
}
