import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryParserResourceScope } from '../../../src/application/use-cases/in-memory-parser-resource-scope.js'
import { closeParserResourceEpoch } from '../../../src/application/services/close-parser-resource-epoch.js'
import { type ParserResourceDisposalFailure } from '../../../src/domain/value-objects/parser-resource-scope.js'

describe('closeParserResourceEpoch', () => {
  const originalGc = globalThis.gc

  afterEach(() => {
    if (originalGc !== undefined) {
      globalThis.gc = originalGc
    } else {
      delete (globalThis as { gc?: unknown }).gc
    }
  })

  it('requests garbage collection after disposals when resources were registered', () => {
    const gcMock = vi.fn()
    ;(globalThis as { gc?: () => void }).gc = gcMock

    const scope = new InMemoryParserResourceScope()
    let disposed = false
    scope.register({ item: 1 }, () => {
      disposed = true
      expect(gcMock).not.toHaveBeenCalled()
    })

    const result = closeParserResourceEpoch(scope)

    expect(disposed).toBe(true)
    expect(gcMock).toHaveBeenCalledTimes(1)
    expect(result.registered).toBe(1)
  })

  it('does not request garbage collection for an empty scope', () => {
    const gcMock = vi.fn()
    ;(globalThis as { gc?: () => void }).gc = gcMock

    const scope = new InMemoryParserResourceScope()
    const result = closeParserResourceEpoch(scope)

    expect(gcMock).not.toHaveBeenCalled()
    expect(result.registered).toBe(0)
  })

  it('completes harmlessly when globalThis.gc is absent', () => {
    delete (globalThis as { gc?: unknown }).gc

    const scope = new InMemoryParserResourceScope()
    let disposed = false
    scope.register({ item: 1 }, () => {
      disposed = true
    })

    const result = closeParserResourceEpoch(scope)

    expect(disposed).toBe(true)
    expect(result.registered).toBe(1)
  })

  it('invokes onFailure callback for each failure with failure details', () => {
    const scope = new InMemoryParserResourceScope()
    scope.register({ id: 1 }, () => {
      throw new Error('fail-1')
    })
    scope.register({ id: 2 }, () => {
      throw new Error('fail-2')
    })

    const collectedFailures: ParserResourceDisposalFailure[] = []
    const result = closeParserResourceEpoch(scope, (failure) => {
      collectedFailures.push(failure)
    })

    expect(result.failures).toHaveLength(2)
    expect(collectedFailures).toHaveLength(2)
    expect(collectedFailures[0]?.message).toBe('fail-2') // LIFO
    expect(collectedFailures[1]?.message).toBe('fail-1')
  })
})
