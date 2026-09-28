import { describe, expect, it } from 'vitest'
import { createVerificationCurrent } from '../../../src/application/checks/verification-current.js'
import { buildCheckExecutionContext } from '../../../src/application/services/execute-matching-predicates.js'
import { TRANSITION_BINDING_SPECS } from '../../../src/domain/services/check-bindings.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { Change } from '../../../src/domain/entities/change.js'
import { makeSchema, testActor } from '../use-cases/helpers.js'

function verdict(verification: ChangeValidityVerdict['verification']): ChangeValidityVerdict {
  return {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification,
    blockers: [],
    recovery: null,
  }
}

function change(): Change {
  return new Change({
    name: 'c1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    specIds: ['core:change'],
    history: [
      {
        type: 'created',
        at: new Date('2026-01-01T00:00:00.000Z'),
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'test-schema',
        schemaVersion: 1,
      },
    ],
  })
}

async function run(verification?: ChangeValidityVerdict['verification']) {
  const ctx = buildCheckExecutionContext({
    change: change(),
    schema: makeSchema(),
    attempt: { scope: 'transition', from: 'verifying', to: 'done', along: 'forward' },
    approvals: { spec: false, signoff: false },
    ...(verification !== undefined ? { validity: verdict(verification) } : {}),
  })
  return createVerificationCurrent().execute(ctx)
}

describe('verification.current', () => {
  it('binds only to the verifying exit', () => {
    const binding = TRANSITION_BINDING_SPECS.find((spec) => spec.id === 'verification.current')
    expect(binding?.applicability).toEqual([
      { scope: 'transition', from: 'verifying', to: 'done', along: 'forward' },
    ])
  })

  it('passes valid evidence, skips explicit not-required, and fails closed without a verdict', async () => {
    expect((await run('valid')).outcome).toBe('pass')
    expect((await run('not-required')).outcome).toBe('skip')
    const unavailable = await run()
    expect(unavailable.outcome).toBe('fail')
    expect(unavailable.code).toBe('VERIFICATION_VALIDITY_UNAVAILABLE')
  })

  it('fails absent, in-progress, and stale evidence with the start command', async () => {
    const absent = await run('absent')
    const active = await run('attempt-active')
    const stale = await run('stale')
    expect(absent.code).toBe('VERIFICATION_REQUIRED')
    expect(active.code).toBe('VERIFICATION_IN_PROGRESS')
    expect(stale.code).toBe('VERIFICATION_STALE')
    expect(absent.details?.command).toBe('specd changes verification start c1')
  })
})
