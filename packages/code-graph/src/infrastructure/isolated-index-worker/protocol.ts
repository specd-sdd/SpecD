import { type GraphIndexJsonValue } from '../../application/ports/isolated-graph-index-runner.js'
import { isGraphIndexJsonValue } from './json-value.js'

/** Versioned, internal IPC protocol identifier. */
export const GRAPH_INDEX_PROTOCOL = 'specd.graph-index.v1'

/** Initial parent-to-child task invocation envelope. */
export interface StartMessage {
  readonly protocol: typeof GRAPH_INDEX_PROTOCOL
  readonly type: 'start'
  readonly taskModuleHref: string
  readonly taskInput: GraphIndexJsonValue
}

/** Bounded task failure details carried in a terminal IPC envelope. */
export interface SerializedTaskError {
  readonly name: string
  readonly message: string
  readonly code: string | null
  readonly stack: string | null
}

/** Child-to-parent progress or terminal IPC envelope. */
export type ChildMessage =
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'progress'
      readonly value: GraphIndexJsonValue
    }
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'result'
      readonly value: GraphIndexJsonValue
    }
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'failure'
      readonly category: 'task-contract' | 'task-execution' | 'protocol'
      readonly error: SerializedTaskError
    }

/**
 * Checks a candidate record.
 * @param value - Candidate record.
 * @returns Whether it is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks an exact own-key set.
 * @param value - Candidate record.
 * @param keys - Required exact keys.
 * @returns Whether keys match exactly.
 */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

/**
 * Checks a start envelope including its exact field set and JSON task input.
 * @param value - Candidate envelope.
 * @returns Whether valid.
 */
export function isStartMessage(value: unknown): value is StartMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['protocol', 'type', 'taskModuleHref', 'taskInput']) &&
    value.protocol === GRAPH_INDEX_PROTOCOL &&
    value.type === 'start' &&
    typeof value.taskModuleHref === 'string' &&
    isGraphIndexJsonValue(value.taskInput)
  )
}

/**
 * Checks a bounded serialized task error.
 * @param value - Candidate error.
 * @returns Whether valid.
 */
export function isSerializedTaskError(value: unknown): value is SerializedTaskError {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['name', 'message', 'code', 'stack']) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (typeof value.code === 'string' || value.code === null) &&
    (typeof value.stack === 'string' || value.stack === null)
  )
}

/**
 * Checks a child envelope including its tag, exact fields, and JSON payload.
 * @param value - Candidate envelope.
 * @returns Whether valid.
 */
export function isChildMessage(value: unknown): value is ChildMessage {
  if (!isRecord(value) || value.protocol !== GRAPH_INDEX_PROTOCOL || typeof value.type !== 'string')
    return false
  if (
    (value.type === 'progress' || value.type === 'result') &&
    hasExactKeys(value, ['protocol', 'type', 'value'])
  ) {
    return isGraphIndexJsonValue(value.value)
  }
  return (
    value.type === 'failure' &&
    hasExactKeys(value, ['protocol', 'type', 'category', 'error']) &&
    (value.category === 'task-contract' ||
      value.category === 'task-execution' ||
      value.category === 'protocol') &&
    isSerializedTaskError(value.error)
  )
}

/** Maximum size of any serialized error string field. */
const MAX_ERROR_FIELD_LENGTH = 64 * 1024
const UNCOERCIBLE_TASK_ERROR_MESSAGE = 'Unknown task failure'

/**
 * Bounds a candidate string.
 * @param value - Candidate string.
 * @param fallback - Value used when not a string.
 * @returns Bounded string.
 */
function boundedString(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') return fallback
  return value.slice(0, MAX_ERROR_FIELD_LENGTH)
}

/**
 * Converts an unknown task failure into the bounded, serializable protocol shape.
 * @param error - Unknown thrown value.
 * @returns Serialized failure details.
 */
export function serializeTaskError(error: unknown): SerializedTaskError {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown }
    return {
      name: boundedString(error.name, 'Error') ?? 'Error',
      message: boundedString(error.message, '') ?? '',
      code: boundedString(record.code, null),
      stack: boundedString(error.stack, null),
    }
  }

  let message = UNCOERCIBLE_TASK_ERROR_MESSAGE
  try {
    message = String(error)
  } catch {
    // Preserve the failure envelope when coercing an arbitrary thrown value fails.
  }

  return {
    name: 'Error',
    message:
      boundedString(message, UNCOERCIBLE_TASK_ERROR_MESSAGE) ?? UNCOERCIBLE_TASK_ERROR_MESSAGE,
    code: null,
    stack: null,
  }
}
