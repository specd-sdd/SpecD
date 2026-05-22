import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { InvalidInvalidateTargetError } from '../errors/invalid-invalidate-target-error.js'
import { InvalidateRequiresForceError } from '../errors/invalidate-requires-force-error.js'
import { type ArtifactDag } from '../../domain/value-objects/artifact-dag.js'
import { type InvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'

/** A single target identifying an artifact (and optionally a specific file within it). */
export interface InvalidateTargetInput {
  readonly artifactId: string
  readonly specId?: string
}

/** Input contract for the manual invalidation use case. */
export interface InvalidateChangeInput {
  readonly name: string
  readonly reason: string
  readonly policyOverride?: InvalidationPolicy
  readonly targets?: readonly InvalidateTargetInput[]
  readonly force?: boolean
}

/** A single file affected by invalidation, labelled with its expansion origin. */
export interface AffectedArtifactFile {
  readonly artifactId: string
  readonly key: string
  readonly filename: string
  readonly expansion: 'direct' | 'downstream' | 'global'
}

/** Result of a manual invalidation execution. */
export interface InvalidateChangeResult {
  readonly change: Change
  readonly effectivePolicy: InvalidationPolicy
  readonly affected: readonly AffectedArtifactFile[]
}

/**
 * Use case for manual, targeted invalidation of a change's artifacts.
 *
 * Validates the command shape against the effective policy, normalises targets,
 * enforces the approval/signoff guard, and reports the final expanded affected set.
 */
export class InvalidateChange {
  private readonly _changes: ChangeRepository
  private readonly _actor: ActorResolver
  private readonly _schemaProvider: SchemaProvider

  /**
   * Creates a new `InvalidateChange` use case.
   *
   * @param changes - Change repository for loading and mutating changes
   * @param actor - Actor resolver for identity
   * @param schemaProvider - Schema provider for artifact type resolution
   */
  constructor(changes: ChangeRepository, actor: ActorResolver, schemaProvider: SchemaProvider) {
    this._changes = changes
    this._actor = actor
    this._schemaProvider = schemaProvider
  }

  /**
   * Executes the manual invalidation.
   *
   * @param input - The invalidation command
   * @returns The persisted change and affected set report
   */
  async execute(input: InvalidateChangeInput): Promise<InvalidateChangeResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const effectivePolicy = input.policyOverride ?? change.invalidationPolicy
    const targetErrors = validateCommandShape(effectivePolicy, input.targets)
    if (targetErrors.length > 0) {
      throw new InvalidInvalidateTargetError(targetErrors)
    }

    if (
      (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined) &&
      input.force !== true
    ) {
      throw new InvalidateRequiresForceError()
    }

    const actor = await this._actor.identity()
    const schema = await this._schemaProvider.get()

    if (effectivePolicy === 'none') {
      const persisted = await this._changes.mutate(input.name, (freshChange) => {
        freshChange.invalidate(
          'artifact-review-required',
          actor,
          input.reason,
          [],
          schema.artifactDag(),
        )
        return freshChange
      })

      return { change: persisted, effectivePolicy, affected: [] }
    }

    const resolvedTargets = resolveTargets(change, input.targets ?? [], schema.artifacts())
    const affectedArtifacts = resolvedTargets.map((t) => ({
      type: t.artifactId,
      files: [t.key],
    }))

    const persisted = await this._changes.mutate(input.name, (freshChange) => {
      freshChange.invalidate(
        'artifact-review-required',
        actor,
        input.reason,
        affectedArtifacts,
        schema.artifactDag(),
        effectivePolicy,
      )
      return freshChange
    })

    const expanded = expandAffectedSet(
      resolvedTargets,
      change,
      effectivePolicy,
      schema.artifactDag(),
    )

    return { change: persisted, effectivePolicy, affected: expanded }
  }
}

/**
 * Validates that the provided targets are compatible with the effective policy.
 *
 * @param effectivePolicy - The resolved invalidation policy
 * @param targets - The caller-provided targets (may be undefined)
 * @returns An array of error strings (empty when valid)
 */
function validateCommandShape(
  effectivePolicy: InvalidationPolicy,
  targets: readonly InvalidateTargetInput[] | undefined,
): string[] {
  const errors: string[] = []

  if (effectivePolicy === 'none' || effectivePolicy === 'global') {
    if (targets !== undefined && targets.length > 0) {
      errors.push(
        `--target is not allowed with policy '${effectivePolicy}' — targeting is semantically irrelevant`,
      )
    }
  } else {
    if (targets === undefined || targets.length === 0) {
      errors.push(`At least one --target is required with policy '${effectivePolicy}'`)
    }
  }

  return errors
}

/**
 * Resolves raw target inputs into concrete artifact/file entries.
 *
 * @param change - The change whose artifacts are targeted
 * @param targets - Raw target inputs from the command
 * @param artifactTypes - Schema artifact types for scope validation
 * @returns Deduplicated concrete target entries
 * @throws {InvalidInvalidateTargetError} When an artifact or file is unknown or scope is invalid
 */
function resolveTargets(
  change: Change,
  targets: readonly InvalidateTargetInput[],
  artifactTypes: readonly { id: string; scope: string }[],
): Array<{ artifactId: string; key: string; filename: string }> {
  const results: Array<{ artifactId: string; key: string; filename: string }> = []
  const artifactTypeMap = new Map(artifactTypes.map((t) => [t.id, t]))
  const errors: string[] = []

  for (const target of targets) {
    const artifact = change.getArtifact(target.artifactId)
    if (artifact === null) {
      errors.push(`Unknown artifact '${target.artifactId}'`)
      continue
    }

    const artType = artifactTypeMap.get(target.artifactId)
    if (target.specId !== undefined && artType?.scope === 'change') {
      errors.push(
        `Cannot use '${target.artifactId}@${target.specId}' — artifact '${target.artifactId}' is scope:change`,
      )
      continue
    }

    if (target.specId !== undefined) {
      const file = artifact.getFile(target.specId)
      if (file === undefined) {
        errors.push(`Unknown file '${target.specId}' in artifact '${target.artifactId}'`)
        continue
      }
      results.push({
        artifactId: target.artifactId,
        key: target.specId,
        filename: file.filename,
      })
    } else {
      for (const [, file] of artifact.files) {
        results.push({
          artifactId: target.artifactId,
          key: file.key,
          filename: file.filename,
        })
      }
    }
  }

  if (errors.length > 0) {
    throw new InvalidInvalidateTargetError(errors)
  }

  const seen = new Set<string>()
  return results.filter((r) => {
    const key = `${r.artifactId}::${r.key}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Expands direct targets into the full affected set according to the policy.
 *
 * @param directTargets - The resolved direct targets
 * @param change - The change for DAG traversal
 * @param policy - The effective policy controlling expansion
 * @param artifactDag - Schema-derived DAG for `downstream` expansion
 * @returns Affected files labelled with their expansion origin
 */
function expandAffectedSet(
  directTargets: Array<{ artifactId: string; key: string; filename: string }>,
  change: Change,
  policy: InvalidationPolicy,
  artifactDag: ArtifactDag,
): AffectedArtifactFile[] {
  const results: AffectedArtifactFile[] = []
  const directArtifactOrder = uniqueArtifactIds(directTargets.map((target) => target.artifactId))

  for (const target of directTargets) {
    results.push({
      artifactId: target.artifactId,
      key: target.key,
      filename: target.filename,
      expansion: 'direct',
    })
  }

  if (policy === 'surgical') return results

  const directTypeIds = new Set(directArtifactOrder)

  if (policy === 'global') {
    const artifactTraversalOrder = artifactDag.topologicalOrder()
    for (const typeId of artifactTraversalOrder) {
      if (directTypeIds.has(typeId)) continue
      const artifact = change.getArtifact(typeId)
      if (artifact === null) continue
      for (const [, file] of artifact.files) {
        results.push({
          artifactId: typeId,
          key: file.key,
          filename: file.filename,
          expansion: 'global',
        })
      }
    }
    return results
  }
  const expandedTypeIds = new Set([
    ...directArtifactOrder,
    ...artifactDag.descendantsOf(directArtifactOrder),
  ])
  const artifactTraversalOrder = artifactDag
    .topologicalOrder()
    .filter((typeId) => expandedTypeIds.has(typeId))
  for (const typeId of artifactTraversalOrder) {
    if (directTypeIds.has(typeId)) continue
    const artifact = change.getArtifact(typeId)
    if (artifact === null) continue
    for (const [, file] of artifact.files) {
      results.push({
        artifactId: typeId,
        key: file.key,
        filename: file.filename,
        expansion: 'downstream',
      })
    }
  }

  return results
}

/**
 * Returns artifact ids in first-seen order without duplicates.
 *
 * @param artifactIds - Artifact ids gathered from direct target resolution
 * @returns Stable artifact ids preserving the first occurrence
 */
function uniqueArtifactIds(artifactIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const artifactId of artifactIds) {
    if (seen.has(artifactId)) continue
    seen.add(artifactId)
    ordered.push(artifactId)
  }
  return ordered
}
