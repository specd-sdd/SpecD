/**
 * Policy controlling how artifact invalidation propagates across the artifact DAG.
 *
 * - `none` — no artifacts are reopened; drift is informational only
 * - `surgical` — only the explicitly targeted files are reopened
 * - `downstream` — targets plus all DAG descendants are reopened (default)
 * - `global` — every artifact in the change is reopened
 */
export type ArtifactInvalidationPolicy = 'none' | 'surgical' | 'downstream' | 'global'

/**
 * Policy controlling workflow recovery when invalidation occurs.
 *
 * - `preserve` — change stays in its current lifecycle state (default)
 * - `redesign` — change moves back to designing when artifacts are invalidated
 */
export type WorkflowInvalidationPolicy = 'preserve' | 'redesign'

/**
 * Structured invalidation policy with independent artifact and workflow dimensions.
 */
export interface InvalidationPolicy {
  readonly artifacts: ArtifactInvalidationPolicy
  readonly workflow: WorkflowInvalidationPolicy
}

/**
 * Partial override for an invalidation policy.
 */
export interface InvalidationPolicyOverride {
  readonly artifacts?: ArtifactInvalidationPolicy
  readonly workflow?: WorkflowInvalidationPolicy
}

/** Default invalidation policy applied to new changes when no explicit policy is configured. */
export const DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = Object.freeze({
  artifacts: 'downstream',
  workflow: 'preserve',
})

/** Legacy default invalidation policy applied when interpreting absent legacy scalar configuration. */
export const LEGACY_DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = Object.freeze({
  artifacts: 'downstream',
  workflow: 'redesign',
})

const VALID_ARTIFACT_POLICIES: ReadonlySet<string> = new Set<ArtifactInvalidationPolicy>([
  'none',
  'surgical',
  'downstream',
  'global',
])

const VALID_WORKFLOW_POLICIES: ReadonlySet<string> = new Set<WorkflowInvalidationPolicy>([
  'preserve',
  'redesign',
])

/**
 * Narrows an unknown value to {@link ArtifactInvalidationPolicy}.
 *
 * @param value - The value to test
 * @returns `true` when the value is a valid artifact policy
 */
export function isArtifactInvalidationPolicy(value: unknown): value is ArtifactInvalidationPolicy {
  return typeof value === 'string' && VALID_ARTIFACT_POLICIES.has(value)
}

/**
 * Narrows an unknown value to {@link WorkflowInvalidationPolicy}.
 *
 * @param value - The value to test
 * @returns `true` when the value is a valid workflow policy
 */
export function isWorkflowInvalidationPolicy(value: unknown): value is WorkflowInvalidationPolicy {
  return typeof value === 'string' && VALID_WORKFLOW_POLICIES.has(value)
}

/**
 * Narrows an unknown value to {@link InvalidationPolicy}.
 *
 * @param value - The value to test
 * @returns `true` when the value is a valid structured invalidation policy
 */
export function isInvalidationPolicy(value: unknown): value is InvalidationPolicy {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const p = value as Record<string, unknown>
  return isArtifactInvalidationPolicy(p['artifacts']) && isWorkflowInvalidationPolicy(p['workflow'])
}

/**
 * Resolves an effective invalidation policy by overlaying only supplied dimensions from an override.
 *
 * @param base - The base invalidation policy
 * @param override - Optional partial override to apply
 * @returns A new immutable invalidation policy
 */
export function resolveInvalidationPolicy(
  base: InvalidationPolicy,
  override?: InvalidationPolicyOverride,
): InvalidationPolicy {
  if (!override) {
    return Object.freeze({ ...base })
  }
  return Object.freeze({
    artifacts: override.artifacts ?? base.artifacts,
    workflow: override.workflow ?? base.workflow,
  })
}

/**
 * Maps a legacy scalar policy to structured format.
 *
 * @param scalar - Legacy artifact policy or undefined/null
 * @returns Structured invalidation policy with redesign workflow semantics
 */
export function fromLegacyInvalidationPolicy(scalar?: string | null): InvalidationPolicy {
  if (!scalar || !isArtifactInvalidationPolicy(scalar)) {
    return LEGACY_DEFAULT_INVALIDATION_POLICY
  }
  return Object.freeze({
    artifacts: scalar,
    workflow: 'redesign',
  })
}
