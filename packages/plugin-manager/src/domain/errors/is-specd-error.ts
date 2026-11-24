import { SpecdError } from '@specd/core'

/**
 * Checks `value instanceof ctor` without ever throwing.
 *
 * A hostile value (for example a Proxy whose `getPrototypeOf` trap throws) makes a plain
 * `instanceof` throw; such a value is reported as not being an instance.
 *
 * @param value - Candidate value
 * @param ctor - Constructor to test against
 * @returns `true` only when the check ran and succeeded
 */
export function isInstanceOf(
  value: unknown,
  ctor: abstract new (...args: never[]) => unknown,
): boolean {
  try {
    return value instanceof ctor
  } catch {
    return false
  }
}

/**
 * Checks whether a value is a `SpecdError`. Never throws.
 *
 * @param value - Candidate thrown value
 * @returns `true` when the value is a `SpecdError`; `false` for anything else, hostile values included
 */
export function isSpecdError(value: unknown): value is SpecdError {
  return isInstanceOf(value, SpecdError)
}
