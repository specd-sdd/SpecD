import { describe, expect, it } from 'vitest'
import {
  assertGraphIndexJsonValue,
  isGraphIndexJsonValue,
} from '../../../src/infrastructure/isolated-index-worker/json-value.js'
import {
  GRAPH_INDEX_PROTOCOL,
  isChildMessage,
  isStartMessage,
  serializeTaskError,
} from '../../../src/infrastructure/isolated-index-worker/protocol.js'

describe('isolated graph-index worker protocol', () => {
  it('accepts strict JSON values and rejects values outside the transport model', () => {
    const shared = { value: false }
    const valid = { nested: [null, true, 1, 'ok', shared], alias: shared }
    expect(isGraphIndexJsonValue(valid)).toBe(true)
    expect(() => assertGraphIndexJsonValue(valid)).not.toThrow()

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    class Value {}
    const invalid = [
      undefined,
      () => undefined,
      Symbol('x'),
      1n,
      NaN,
      Infinity,
      cyclic,
      new Value(),
      { [Symbol('x')]: 1 },
    ]
    for (const value of invalid) {
      expect(isGraphIndexJsonValue(value)).toBe(false)
      expect(() => assertGraphIndexJsonValue(value)).toThrow(TypeError)
    }
  })

  it('validates exact start and child envelope shapes', () => {
    const start = {
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'start',
      taskModuleHref: 'file:///task.js',
      taskInput: { ok: true },
    }
    expect(isStartMessage(start)).toBe(true)
    expect(isStartMessage({ ...start, extra: true })).toBe(false)
    expect(isStartMessage({ ...start, protocol: 'other' })).toBe(false)
    expect(isStartMessage({ ...start, taskInput: undefined })).toBe(false)

    expect(isChildMessage({ protocol: GRAPH_INDEX_PROTOCOL, type: 'progress', value: 'A' })).toBe(
      true,
    )
    expect(
      isChildMessage({ protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: { done: true } }),
    ).toBe(true)
    expect(
      isChildMessage({
        protocol: GRAPH_INDEX_PROTOCOL,
        type: 'failure',
        category: 'task-execution',
        error: { name: 'Error', message: 'failed', code: null, stack: null },
      }),
    ).toBe(true)
    expect(isChildMessage({ protocol: GRAPH_INDEX_PROTOCOL, type: 'unknown', value: null })).toBe(
      false,
    )
    expect(
      isChildMessage({ protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null, extra: true }),
    ).toBe(false)
    expect(isChildMessage({ protocol: 'old', type: 'result', value: null })).toBe(false)
    expect(
      isChildMessage({
        protocol: GRAPH_INDEX_PROTOCOL,
        type: 'failure',
        category: 'nope',
        error: {},
      }),
    ).toBe(false)
  })

  it('bounds serialized task errors', () => {
    const error = new Error('x'.repeat(70_000))
    error.stack = 's'.repeat(70_000)
    const serialized = serializeTaskError(error)
    expect(serialized.message).toHaveLength(64 * 1024)
    expect(serialized.stack).toHaveLength(64 * 1024)
    expect(serializeTaskError('failure')).toMatchObject({
      name: 'Error',
      message: 'failure',
      code: null,
    })
  })

  it('preserves the failure envelope when a non-Error value cannot be coerced', () => {
    const uncoercible = {
      [Symbol.toPrimitive](): never {
        throw new Error('coercion failed')
      },
    }

    expect(serializeTaskError(uncoercible)).toEqual({
      name: 'Error',
      message: 'Unknown task failure',
      code: null,
      stack: null,
    })
  })
})
