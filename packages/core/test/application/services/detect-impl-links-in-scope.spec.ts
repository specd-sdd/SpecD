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
    for (const forbidden of [
      '--allow-out-of-scope',
      'allowOutOfScope',
      '--skip-checks',
      'Re-run with',
    ]) {
      expect(result.message).not.toContain(forbidden)
    }
  })

  it('lists every out-of-scope spec when there are at most three', () => {
    const change = {
      name: 'my-change',
      specIds: ['core:a'],
      implementationLinks: ['core:x', 'core:y', 'core:z'].map((specId) => ({ specId })),
    } as unknown as Change

    const result = detectImplLinksInScope(change)
    expect(result.message).toContain('3 specs')
    expect(result.message).toContain('(core:x, core:y, core:z)')
    expect(result.message).not.toContain('examples:')
  })

  it('compacts to three examples when more than three specs are out of scope', () => {
    const change = {
      name: 'my-change',
      specIds: ['core:a'],
      implementationLinks: ['core:w', 'core:x', 'core:y', 'core:z'].map((specId) => ({ specId })),
    } as unknown as Change

    const result = detectImplLinksInScope(change)
    expect(result.outOfScopeSpecIds).toEqual(['core:w', 'core:x', 'core:y', 'core:z'])
    expect(result.message).toContain('4 specs')
    expect(result.message).toContain('(examples: core:w, core:x, core:y)')
    expect(result.message).not.toContain('core:z')
  })
})
