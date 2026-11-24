import { describe, expect, expectTypeOf, it } from 'vitest'
import { type ArchiveChangeInput } from '../../../src/application/use-cases/archive-change.js'
import { type TransitionChangeInput } from '../../../src/application/use-cases/transition-change.js'

describe('ArchiveChangeInput contract', () => {
  it('accepts skipChecks and skipHookPhases as the per-call bypass fields', () => {
    expectTypeOf<ArchiveChangeInput>().toHaveProperty('skipChecks')
    expectTypeOf<ArchiveChangeInput>().toHaveProperty('skipHookPhases')
    expectTypeOf<NonNullable<ArchiveChangeInput['skipChecks']>>().toEqualTypeOf<readonly string[]>()
    expect(true).toBe(true)
  })

  it('exposes no ad-hoc bypass booleans, like TransitionChangeInput', () => {
    expectTypeOf<ArchiveChangeInput>().not.toHaveProperty('allowOverlap')
    expectTypeOf<ArchiveChangeInput>().not.toHaveProperty('allowOutOfScope')
    expectTypeOf<TransitionChangeInput>().not.toHaveProperty('allowOverlap')
    expectTypeOf<TransitionChangeInput>().not.toHaveProperty('allowOutOfScope')
    expectTypeOf<TransitionChangeInput>().toHaveProperty('skipChecks')
    expect(true).toBe(true)
  })
})
