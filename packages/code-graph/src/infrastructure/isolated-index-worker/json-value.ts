import { type GraphIndexJsonValue } from '../../application/ports/isolated-graph-index-runner.js'

/**
 * True when a value is a plain object suitable for the JSON transport boundary.
 * @param value - Candidate object.
 * @returns Whether the candidate has a plain-object prototype.
 */
function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: object | null = Reflect.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Checks whether a value belongs to the strict JSON model used by the worker protocol.
 * It rejects cycles, non-finite numbers, non-plain objects and symbol keys.
 * @param value - Candidate transport value.
 * @returns Whether the value is strict JSON data.
 */
export function isGraphIndexJsonValue(value: unknown): value is GraphIndexJsonValue {
  const ancestors = new WeakSet<object>()

  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'string') {
      return true
    }
    if (typeof candidate === 'number') return Number.isFinite(candidate)
    if (typeof candidate !== 'object') return false
    if (ancestors.has(candidate)) return false
    ancestors.add(candidate)

    try {
      if (Array.isArray(candidate)) return candidate.every(visit)
      if (!isPlainObject(candidate) || Object.getOwnPropertySymbols(candidate).length > 0)
        return false
      return Object.values(candidate).every(visit)
    } finally {
      ancestors.delete(candidate)
    }
  }

  return visit(value)
}

/**
 * Asserts that a boundary payload is strict JSON data.
 *
 * @param value - Candidate transport value.
 * @throws TypeError when the value cannot safely cross the child-process boundary.
 */
export function assertGraphIndexJsonValue(value: unknown): asserts value is GraphIndexJsonValue {
  if (!isGraphIndexJsonValue(value)) {
    throw new TypeError('Graph index worker payload must be a JSON-serializable value')
  }
}
