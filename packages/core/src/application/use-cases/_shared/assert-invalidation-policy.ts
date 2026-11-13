import { InvalidInputError } from '../../../domain/errors/invalid-input-error.js'
import {
  isInvalidationPolicy,
  type InvalidationPolicy,
} from '../../../domain/value-objects/invalidation-policy.js'

/** The allowed invalidation policy values, in documentation order. */
const ALLOWED_POLICIES = ['none', 'surgical', 'downstream', 'global'] as const

/**
 * Asserts that a runtime value is a valid invalidation policy.
 *
 * A host's type cast is not validation: JavaScript, MCP and CLI callers can pass any string, so
 * the use cases call this before persisting anything.
 *
 * @param value - The value to check; `undefined` is accepted and means "not provided"
 * @returns The value narrowed to {@link InvalidationPolicy}, or `undefined` when not provided
 * @throws {InvalidInputError} When the value is defined and not one of the allowed policies
 */
export function assertInvalidationPolicy(
  value: string | undefined,
): InvalidationPolicy | undefined {
  if (value === undefined) return undefined
  if (isInvalidationPolicy(value)) return value
  throw new InvalidInputError(
    `invalid invalidation policy '${value}' — allowed values: ${ALLOWED_POLICIES.join(', ')}`,
  )
}
