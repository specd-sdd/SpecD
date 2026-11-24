import { InvalidInputError } from '../../../domain/errors/invalid-input-error.js'
import {
  isArtifactInvalidationPolicy,
  isWorkflowInvalidationPolicy,
  type InvalidationPolicy,
  type InvalidationPolicyOverride,
} from '../../../domain/value-objects/invalidation-policy.js'

/** The allowed artifact invalidation policy values, in documentation order. */
const ALLOWED_ARTIFACT_POLICIES = ['none', 'surgical', 'downstream', 'global'] as const

/** The allowed workflow invalidation policy values, in documentation order. */
const ALLOWED_WORKFLOW_POLICIES = ['preserve', 'redesign'] as const

/**
 * Asserts that a runtime value is a valid structured invalidation policy override.
 *
 * A host's type cast is not validation: JavaScript, MCP and CLI callers can pass any string, so
 * the use cases call this before persisting anything.
 *
 * @param value - The value to check; `undefined` is accepted and means "not provided"
 * @returns The value narrowed to {@link InvalidationPolicyOverride}, or `undefined` when not provided
 * @throws {InvalidInputError} When either dimension is defined and not one of the allowed values
 */
export function assertInvalidationPolicyOverride(
  value: InvalidationPolicyOverride | undefined,
): InvalidationPolicyOverride | undefined {
  if (value === undefined) return undefined
  if (value.artifacts !== undefined && !isArtifactInvalidationPolicy(value.artifacts)) {
    throw new InvalidInputError(
      `invalid artifact invalidation policy '${String(value.artifacts)}' — allowed values: ${ALLOWED_ARTIFACT_POLICIES.join(', ')}`,
    )
  }
  if (value.workflow !== undefined && !isWorkflowInvalidationPolicy(value.workflow)) {
    throw new InvalidInputError(
      `invalid workflow invalidation policy '${String(value.workflow)}' — allowed values: ${ALLOWED_WORKFLOW_POLICIES.join(', ')}`,
    )
  }
  return value
}

/**
 * Asserts that a runtime value is a valid complete structured invalidation policy.
 *
 * @param value - The value to check; `undefined` is accepted and means "not provided"
 * @returns The value narrowed to {@link InvalidationPolicy}, or `undefined` when not provided
 * @throws {InvalidInputError} When the value is defined and either dimension is missing or invalid
 */
export function assertInvalidationPolicy(
  value: InvalidationPolicy | undefined,
): InvalidationPolicy | undefined {
  if (value === undefined) return undefined
  assertInvalidationPolicyOverride(value)
  if (!isArtifactInvalidationPolicy(value.artifacts)) {
    throw new InvalidInputError(
      `invalid artifact invalidation policy '${String(value.artifacts)}' — allowed values: ${ALLOWED_ARTIFACT_POLICIES.join(', ')}`,
    )
  }
  if (!isWorkflowInvalidationPolicy(value.workflow)) {
    throw new InvalidInputError(
      `invalid workflow invalidation policy '${String(value.workflow)}' — allowed values: ${ALLOWED_WORKFLOW_POLICIES.join(', ')}`,
    )
  }
  return value
}
