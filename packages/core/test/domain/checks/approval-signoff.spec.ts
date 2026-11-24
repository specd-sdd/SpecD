import { describe, expect, it } from 'vitest'
import { run } from '../../../src/domain/checks/approval-signoff.js'
import { makeChange } from '../../application/use-cases/helpers.js'

describe('approval.signoff check', () => {
  it('returns skip when signoffGateEnabled is false', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: false,
      change,
    })
    expect(result.id).toBe('approval.signoff')
    expect(result.outcome).toBe('skip')
  })

  it('returns fail APPROVAL_REQUIRED when signoffGateEnabled is true and no signoff exists', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: true,
      change,
    })
    expect(result.id).toBe('approval.signoff')
    expect(result.outcome).toBe('fail')
    if (result.outcome === 'fail') {
      expect(result.code).toBe('APPROVAL_REQUIRED')
    }
  })

  it('returns pass when signoffGateEnabled is true and active signoff is valid', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: true,
      change,
      validity: {
        signoff: 'valid',
        verification: 'valid',
      } as any,
    })
    expect(result.id).toBe('approval.signoff')
    expect(result.outcome).toBe('pass')
  })
  it('passes without verification evidence when verification is not-required', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: true,
      change,
      validity: { signoff: 'valid', verification: 'not-required' } as any,
    })
    expect(result.outcome).toBe('pass')
  })

  it('still fails a valid sign-off while verification is required but absent', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: true,
      change,
      validity: { signoff: 'valid', verification: 'absent' } as any,
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome === 'fail') {
      expect(result.code).toBe('VERIFICATION_REQUIRED')
    }
  })

  it('reports a stale sign-off distinctly from a missing one', () => {
    const change = makeChange('test-change')
    const result = run({
      signoffGateEnabled: true,
      change,
      validity: { signoff: 'stale', verification: 'not-required' } as any,
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome === 'fail') {
      expect(result.code).toBe('APPROVAL_STALE')
    }
  })
})
