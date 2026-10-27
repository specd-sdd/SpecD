import { describe, expect, it, vi } from 'vitest'
import { InMemoryParserResourceScope } from '../../../src/application/use-cases/in-memory-parser-resource-scope.js'

describe('InMemoryParserResourceScope', () => {
  it('disposes registered resources in reverse (LIFO) order', () => {
    const scope = new InMemoryParserResourceScope()
    const callOrder: string[] = []

    const r1 = { id: 1 }
    const r2 = { id: 2 }
    const r3 = { id: 3 }

    scope.register(r1, () => {
      callOrder.push('r1')
    })
    scope.register(r2, () => {
      callOrder.push('r2')
    })
    scope.register(r3, () => {
      callOrder.push('r3')
    })

    expect(scope.size).toBe(3)

    const result = scope.close()

    expect(callOrder).toEqual(['r3', 'r2', 'r1'])
    expect(result.registered).toBe(3)
    expect(result.failures).toHaveLength(0)
    expect(scope.size).toBe(0)
  })

  it('attempts all disposals even when some throw and records failures with registration indices', () => {
    const scope = new InMemoryParserResourceScope()
    const disposed: string[] = []

    const r0 = { id: 0 }
    const r1 = { id: 1 }
    const r2 = { id: 2 }

    scope.register(r0, () => {
      disposed.push('r0')
    })
    scope.register(r1, () => {
      throw new Error('disposal failure on r1')
    })
    scope.register(r2, () => {
      disposed.push('r2')
    })

    const result = scope.close()

    expect(disposed).toEqual(['r2', 'r0'])
    expect(result.registered).toBe(3)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toEqual({
      index: 1,
      message: 'disposal failure on r1',
    })
    expect(scope.size).toBe(0)
  })

  it('drops references and resets size to 0 after close even if disposals throw', () => {
    const scope = new InMemoryParserResourceScope()
    scope.register({ item: 1 }, () => {
      throw new Error('boom')
    })
    expect(scope.size).toBe(1)
    scope.close()
    expect(scope.size).toBe(0)
  })

  it('allows reuse after close', () => {
    const scope = new InMemoryParserResourceScope()
    const calls: number[] = []

    scope.register({ id: 1 }, () => calls.push(1))
    scope.close()

    scope.register({ id: 2 }, () => calls.push(2))
    expect(scope.size).toBe(1)
    const result2 = scope.close()

    expect(calls).toEqual([1, 2])
    expect(result2.registered).toBe(1)
    expect(scope.size).toBe(0)
  })

  it('handles re-entrant register during close without infinite loop', () => {
    const scope = new InMemoryParserResourceScope()
    const r1 = { id: 1 }
    const r2 = { id: 2 }

    scope.register(r1, () => {
      scope.register(r2, () => {})
    })

    const result = scope.close()
    expect(result.registered).toBe(1)
    // The re-entrant registration is now in the refreshed scope
    expect(scope.size).toBe(1)
    const result2 = scope.close()
    expect(result2.registered).toBe(1)
    expect(scope.size).toBe(0)
  })

  it('returns registered 0 and empty failures on an empty scope', () => {
    const scope = new InMemoryParserResourceScope()
    expect(scope.size).toBe(0)
    const result = scope.close()
    expect(result.registered).toBe(0)
    expect(result.failures).toHaveLength(0)
    expect(scope.size).toBe(0)
  })

  it('safely closes resources registered without a disposer callback', () => {
    const scope = new InMemoryParserResourceScope()
    scope.register({ data: 'plain object' })
    expect(scope.size).toBe(1)
    const result = scope.close()
    expect(result.registered).toBe(1)
    expect(result.failures).toHaveLength(0)
    expect(scope.size).toBe(0)
  })
})
