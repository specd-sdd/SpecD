import { describe, it, expect } from 'vitest'
import { type Change } from '../../../src/domain/entities/change.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'

describe('detectImplLinksInScope', () => {
  it('returns blocked: false when all implementation links are in scope', () => {
    const change = {
      name: 'my-change',
      specIds: ['core:a'],
      implementationLinks: [{ specId: 'core:a' }],
    } as unknown as Change

    const result = detectImplLinksInScope(change)
    expect(result).toEqual({ blocked: false, outOfScopeSpecIds: [] })
  })

  it('returns blocked: true with host-neutral message omitting --allow-out-of-scope', () => {
    const change = {
      name: 'my-change',
      specIds: ['core:a'],
      implementationLinks: [{ specId: 'core:a' }, { specId: 'core:out-of-scope' }],
    } as unknown as Change

    const result = detectImplLinksInScope(change)
    expect(result.blocked).toBe(true)
    expect(result.outOfScopeSpecIds).toEqual(['core:out-of-scope'])
    expect(result.message).toContain('core:out-of-scope')
    expect(result.message).not.toContain('--allow-out-of-scope')
  })
})
