import { describe, expect, it } from 'vitest'
import {
  buildScopeChangeConfirmMessage,
  computeSpecScopeDelta,
  hasSpecScopeDelta,
} from '../src/hooks/use-change-scope-patch.js'

describe('computeSpecScopeDelta', () => {
  it('detects add and remove', () => {
    const delta = computeSpecScopeDelta(['a:one', 'a:two'], ['a:two', 'b:three'])
    expect(delta.addSpecIds).toEqual(['b:three'])
    expect(delta.removeSpecIds).toEqual(['a:one'])
    expect(hasSpecScopeDelta(['a:one', 'a:two'], ['a:two', 'b:three'])).toBe(true)
  })

  it('returns empty when unchanged', () => {
    const ids = ['x:a', 'x:b']
    expect(computeSpecScopeDelta(ids, ids)).toEqual({ addSpecIds: [], removeSpecIds: [] })
    expect(hasSpecScopeDelta(ids, ids)).toBe(false)
  })
})

describe('buildScopeChangeConfirmMessage', () => {
  it('mentions invalidate and lists deltas', () => {
    const msg = buildScopeChangeConfirmMessage('demo', {
      addSpecIds: ['ui:new'],
      removeSpecIds: ['core:old'],
    })
    expect(msg).toContain('demo')
    expect(msg.toLowerCase()).toContain('invalidate')
    expect(msg).toContain('+ ui:new')
    expect(msg).toContain('− core:old')
  })

  it('lists add and remove spec ids in ascending order', () => {
    const msg = buildScopeChangeConfirmMessage('demo', {
      addSpecIds: ['ui:z', 'api:a'],
      removeSpecIds: ['core:m', 'client:b'],
    })
    const addSection = msg.slice(msg.indexOf('Add:'))
    expect(addSection.indexOf('api:a')).toBeLessThan(addSection.indexOf('ui:z'))
    const removeSection = msg.slice(msg.indexOf('Remove:'))
    expect(removeSection.indexOf('client:b')).toBeLessThan(removeSection.indexOf('core:m'))
  })
})
