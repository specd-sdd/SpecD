import { describe, it, expect } from 'vitest'
import { run } from '../../../src/domain/checks/approval-spec.js'
import { makeChange as makeBaseChange } from '../../application/use-cases/helpers.js'

const makeChange = () => makeBaseChange('test-change')

describe('approval.spec check', () => {
  it('skips when the gate is disabled', () => {
    expect(run({ specGateEnabled: false, change: makeChange() }).outcome).toBe('skip')
  })

  it('passes for a valid approval', () => {
    const result = run({
      specGateEnabled: true,
      change: makeChange(),
      validity: { specApproval: 'valid' } as never,
    })
    expect(result.outcome).toBe('pass')
  })

  it('fails with APPROVAL_STALE for a stale approval', () => {
    const result = run({
      specGateEnabled: true,
      change: makeChange(),
      validity: { specApproval: 'stale' } as never,
    })
    expect(result).toMatchObject({
      outcome: 'fail',
      code: 'APPROVAL_STALE',
      message: 'Spec approval is stale',
    })
  })

  it('fails with a distinct APPROVAL_REVOKED for a revoked approval', () => {
    const result = run({
      specGateEnabled: true,
      change: makeChange(),
      validity: { specApproval: 'revoked' } as never,
    })
    expect(result).toMatchObject({
      outcome: 'fail',
      code: 'APPROVAL_REVOKED',
      message: 'Spec approval is revoked',
    })
    expect(result.action).toBeDefined()
  })

  it('fails with APPROVAL_REQUIRED when no approval exists', () => {
    const result = run({
      specGateEnabled: true,
      change: makeChange(),
      validity: { specApproval: 'missing' } as never,
    })
    expect(result).toMatchObject({ outcome: 'fail', code: 'APPROVAL_REQUIRED' })
  })
})
