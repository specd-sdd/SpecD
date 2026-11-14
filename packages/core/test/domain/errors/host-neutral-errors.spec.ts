import { describe, it, expect } from 'vitest'
import { DependsOnOverwriteError } from '../../../src/domain/errors/depends-on-overwrite-error.js'
import { HistoricalImplementationGuardError } from '../../../src/domain/errors/historical-implementation-guard-error.js'
import { HappyPathNextUnavailableError } from '../../../src/domain/errors/happy-path-next-unavailable-error.js'
import { InvalidateRequiresForceError } from '../../../src/application/errors/invalidate-requires-force-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'

describe('Host-neutral core error messages and metadata getters', () => {
  it('DependsOnOverwriteError omits CLI flags', () => {
    const err = new DependsOnOverwriteError(['core:a'], ['core:b'])
    expect(err.code).toBe('DEPENDS_ON_OVERWRITE')
    expect(err.message).not.toContain('--force')
    expect(err.existingDeps).toEqual(['core:a'])
    expect(err.incomingDeps).toEqual(['core:b'])
  })

  it('HistoricalImplementationGuardError omits CLI flags', () => {
    const draftErr = new HistoricalImplementationGuardError('draft', 'my-change')
    expect(draftErr.code).toBe('IMPLEMENTATION_DETECTED')
    expect(draftErr.message).not.toContain('--force')
    expect(draftErr.operation).toBe('draft')
    expect(draftErr.changeName).toBe('my-change')

    const discardErr = new HistoricalImplementationGuardError('discard', 'my-change')
    expect(discardErr.code).toBe('IMPLEMENTATION_DETECTED')
    expect(discardErr.message).not.toContain('--force')
    expect(discardErr.operation).toBe('discard')
    expect(discardErr.changeName).toBe('my-change')
  })

  it('HappyPathNextUnavailableError omits --next and exposes state', () => {
    const err = new HappyPathNextUnavailableError('pending-spec-approval')
    expect(err.code).toBe('HAPPY_PATH_NEXT_UNAVAILABLE')
    expect(err.state).toBe('pending-spec-approval')
    expect(err.message).not.toContain('--next')
  })

  it('InvalidateRequiresForceError omits --force and exposes gates and recoveries', () => {
    const recoveries = [{ gate: 'spec' as const, target: 'designing' as const }]
    const err = new InvalidateRequiresForceError(recoveries)
    expect(err.code).toBe('INVALIDATE_REQUIRES_FORCE')
    expect(err.message).not.toContain('--force')
    expect(err.gates).toEqual(['spec'])
    expect(err.recoveries).toEqual(recoveries)
  })

  it('SpecNotInChangeError omits CLI commands and exposes specId and changeName', () => {
    const err = new SpecNotInChangeError('core:auth', 'my-change')
    expect(err.code).toBe('SPEC_NOT_IN_CHANGE')
    expect(err.specId).toBe('core:auth')
    expect(err.changeName).toBe('my-change')
    expect(err.message).toBe(
      "Spec 'core:auth' is not in the current specIds of change 'my-change'.",
    )
    expect(err.message).not.toContain('specd specs show')
  })
})
