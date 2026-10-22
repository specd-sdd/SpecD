import { describe, expect, it } from 'vitest'
import { SpecOverlapError } from '../../../src/domain/errors/spec-overlap-error.js'
import { OverlapEntry } from '../../../src/domain/value-objects/overlap-entry.js'

const entries: readonly OverlapEntry[] = [
  new OverlapEntry('core:config', [{ name: 'beta', state: 'designing' }]),
]

describe('SpecOverlapError', () => {
  it('defaults to skippable and keeps the message free of delivery-specific flags', () => {
    const err = new SpecOverlapError(entries)
    expect(err.skippable).toBe(true)
    expect(err.message).not.toContain('--skip-checks')
    expect(err.message).not.toContain('--allow-overlap')
  })

  it('exposes skippable false without changing the neutral message', () => {
    const skippable = new SpecOverlapError(entries)
    const hardened = new SpecOverlapError(entries, { skippable: false })
    expect(hardened.skippable).toBe(false)
    expect(hardened.message).toBe(skippable.message)
    expect(hardened.message).toContain('core:config')
    expect(hardened.message).toContain('beta')
  })

  it('names each overlapping spec and the peer changes in the message', () => {
    const err = new SpecOverlapError([
      new OverlapEntry('core:config', [
        { name: 'beta', state: 'designing' },
        { name: 'gamma', state: 'ready' },
      ]),
    ])
    expect(err.message).toContain('core:config')
    expect(err.message).toContain('beta')
    expect(err.message).toContain('gamma')
  })

  it('exposes the overlap entries and a stable code', () => {
    const err = new SpecOverlapError(entries)
    expect(err.entries).toEqual(entries)
    expect(err.code).toBe('SPEC_OVERLAP')
  })
})
