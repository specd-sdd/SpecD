import { describe, it, expect } from 'vitest'
import { detectSpecOverlap } from '../../../src/domain/services/detect-spec-overlap.js'
import { Change } from '../../../src/domain/entities/change.js'
import type { ChangeState } from '../../../src/domain/value-objects/change-state.js'

function makeChange(name: string, specIds: string[], state?: string): Change {
  const history =
    state !== undefined && state !== 'drafting'
      ? [
          {
            type: 'created' as const,
            at: new Date(),
            by: { name: 'test', email: 'test@test.com' },
            specIds,
            schemaName: 'std',
            schemaVersion: 1,
          },
          {
            type: 'transitioned' as const,
            at: new Date(),
            by: { name: 'test', email: 'test@test.com' },
            from: 'drafting' as const,
            to: state as ChangeState,
          },
        ]
      : [
          {
            type: 'created' as const,
            at: new Date(),
            by: { name: 'test', email: 'test@test.com' },
            specIds,
            schemaName: 'std',
            schemaVersion: 1,
          },
        ]

  return new Change({
    name,
    createdAt: new Date(),
    specIds,
    history,
  })
}

describe('detectSpecOverlap', () => {
  it('returns empty report for empty input', () => {
    const result = detectSpecOverlap([])
    expect(result.hasOverlap).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('returns empty report for single change', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/config', 'core:core/kernel']),
    ])
    expect(result.hasOverlap).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('detects two changes sharing one spec', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/config', 'core:core/change']),
      makeChange('beta', ['core:core/config']),
    ])
    expect(result.hasOverlap).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.specId).toBe('core:core/config')
    expect(result.entries[0]!.changes).toHaveLength(2)
    expect(result.entries[0]!.changes[0]!.name).toBe('alpha')
    expect(result.entries[0]!.changes[1]!.name).toBe('beta')
  })

  it('does not report non-overlapping specs', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/config']),
      makeChange('beta', ['core:core/kernel']),
    ])
    expect(result.hasOverlap).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('detects three changes sharing two specs', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/config', 'core:core/kernel']),
      makeChange('beta', ['core:core/config']),
      makeChange('gamma', ['core:core/kernel']),
    ])
    expect(result.hasOverlap).toBe(true)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!.specId).toBe('core:core/config')
    expect(result.entries[0]!.changes.map((c) => c.name)).toEqual(['alpha', 'beta'])
    expect(result.entries[1]!.specId).toBe('core:core/kernel')
    expect(result.entries[1]!.changes.map((c) => c.name)).toEqual(['alpha', 'gamma'])
  })

  it('sorts entries by specId', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/kernel', 'core:core/config']),
      makeChange('beta', ['core:core/kernel', 'core:core/config']),
    ])
    expect(result.entries[0]!.specId).toBe('core:core/config')
    expect(result.entries[1]!.specId).toBe('core:core/kernel')
  })

  it('sorts changes within entries by name', () => {
    const result = detectSpecOverlap([
      makeChange('gamma', ['core:core/config']),
      makeChange('alpha', ['core:core/config']),
      makeChange('beta', ['core:core/config']),
    ])
    expect(result.entries[0]!.changes.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('captures change state in entries', () => {
    const result = detectSpecOverlap([
      makeChange('alpha', ['core:core/config'], 'designing'),
      makeChange('beta', ['core:core/config'], 'implementing'),
    ])
    expect(result.entries[0]!.changes[0]!.state).toBe('designing')
    expect(result.entries[0]!.changes[1]!.state).toBe('implementing')
  })
})
