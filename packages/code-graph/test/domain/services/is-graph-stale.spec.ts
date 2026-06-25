import { describe, expect, it } from 'vitest'
import { isGraphStale } from '../../../src/domain/services/is-graph-stale.js'

describe('isGraphStale', () => {
  it('returns null if lastIndexedRef is null', () => {
    expect(isGraphStale(null, 'abc1234')).toBeNull()
  })

  it('returns null if currentRef is null', () => {
    expect(isGraphStale('abc1234', null)).toBeNull()
  })

  it('returns null if both refs are null', () => {
    expect(isGraphStale(null, null)).toBeNull()
  })

  it('returns false if lastIndexedRef is equal to currentRef', () => {
    expect(isGraphStale('abc1234', 'abc1234')).toBe(false)
  })

  it('returns true if lastIndexedRef is not equal to currentRef', () => {
    expect(isGraphStale('abc1234', 'xyz7890')).toBe(true)
  })
})
