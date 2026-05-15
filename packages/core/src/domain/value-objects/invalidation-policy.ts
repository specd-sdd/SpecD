/**
 * Policy controlling how artifact invalidation propagates across the artifact DAG.
 *
 * - `none` — no artifacts are reopened; drift is informational only
 * - `surgical` — only the explicitly targeted files are reopened
 * - `downstream` — targets plus all DAG descendants are reopened (default)
 * - `global` — every artifact in the change is reopened
 */
export type InvalidationPolicy = 'none' | 'surgical' | 'downstream' | 'global'

/** Default invalidation policy applied when no explicit policy is configured. */
export const DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = 'downstream'

const VALID_POLICIES: ReadonlySet<string> = new Set<string>([
  'none',
  'surgical',
  'downstream',
  'global',
])

/**
 * Narrows a `string` to {@link InvalidationPolicy}.
 *
 * @param value - The string to test
 * @returns `true` when the value is a valid policy
 */
export function isInvalidationPolicy(value: string): value is InvalidationPolicy {
  return VALID_POLICIES.has(value)
}
