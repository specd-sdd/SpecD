import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Change, type ChangeProps } from '../../../src/domain/entities/change.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'
import {
  approveSignoffAction,
  approveSpecAction,
  fail,
  pass,
  startVerificationAction,
} from '../../../src/domain/services/transition-checks.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { resolveLifecycleIntent } from '../../../src/application/services/lifecycle-guidance.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import { makeChange, makeSchema, makeWorkflowStep, testActor } from '../use-cases/helpers.js'

function makeChangeIn(state: ChangeState): Change {
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  const history: NonNullable<ChangeProps['history']>[number][] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: ['core:change'],
      schemaName: 'test-schema',
      schemaVersion: 1,
    },
  ]
  if (state !== 'drafting') {
    history.push({
      type: 'transitioned',
      at: new Date('2026-01-01T00:01:00.000Z'),
      by: testActor,
      from: 'drafting',
      to: state,
    })
  }
  return makeChange('c1', { createdAt, specIds: ['core:change'], history })
}

function makeFullSchema(verifyingDisabled = false) {
  return makeSchema(
    [],
    [
      makeWorkflowStep('designing'),
      makeWorkflowStep('ready'),
      makeWorkflowStep('implementing'),
      makeWorkflowStep('verifying', verifyingDisabled ? { disabled: true } : {}),
      makeWorkflowStep('done'),
      makeWorkflowStep('archivable'),
    ],
  )
}

describe('lifecycle-guidance', () => {
  it('contains no hardcoded check ids, boundFromStates, or CLI/slash strings in lifecycle-guidance.ts', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(
      join(here, '../../../src/application/services/lifecycle-guidance.ts'),
      'utf8',
    )
    expect(source).not.toContain('approval.')
    expect(source).not.toContain('boundFromStates')
    expect(source).not.toContain('/specd-')
    expect(source).not.toContain('specd changes')
    expect(source).not.toContain('specd change')
  })

  it('resolves phase intents and applies first-failed-action precedence', () => {
    const schema = makeSchema([], [])
    const change = makeChangeIn('ready')
    const hop = {
      targetStep: 'ready' as const,
      actionType: 'mechanical' as const,
      reason: 'blocked',
    }
    const review = {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    }

    const first = fail(
      'approval.spec',
      'APPROVAL_REQUIRED',
      'need spec',
      undefined,
      undefined,
      undefined,
      approveSpecAction(),
    )
    const second = fail('@acme.plugin', 'PLUGIN_FAIL', 'plugin', undefined, undefined, undefined, {
      kind: '@acme.fix',
    })

    const resolved = resolveLifecycleIntent(
      change,
      hop,
      review,
      ['designing'],
      { spec: true, signoff: false },
      schema,
      undefined,
      [first, second],
    )
    expect(resolved).toEqual({ intent: null, action: approveSpecAction() })
  })

  it('keeps verify intent when action declares supersedesIntent: false', () => {
    const schema = makeFullSchema()
    const change = makeChangeIn('verifying')
    const hop = {
      targetStep: 'verifying' as const,
      actionType: 'mechanical' as const,
      reason: 'verify',
    }
    const review = {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    }
    const verifyFail = fail(
      'verification.current',
      'VERIFICATION_REQUIRED',
      'need verify',
      undefined,
      undefined,
      undefined,
      startVerificationAction('c1'),
    )

    const resolved = resolveLifecycleIntent(
      change,
      hop,
      review,
      ['implementing', 'designing'],
      { spec: false, signoff: false },
      schema,
      undefined,
      [verifyFail],
    )
    expect(resolved).toEqual({
      intent: 'verify',
      action: startVerificationAction('c1'),
    })
  })

  it('resolves stale approval to approve-spec action with null intent', () => {
    const schema = makeSchema([], [])
    const change = makeChangeIn('ready')
    const hop = {
      targetStep: 'ready' as const,
      actionType: 'mechanical' as const,
      reason: 'blocked',
    }
    const review = {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    }
    const staleFail = fail(
      'approval.spec',
      'APPROVAL_STALE',
      'stale',
      { gate: 'spec' },
      undefined,
      undefined,
      approveSpecAction(),
    )

    const resolved = resolveLifecycleIntent(
      change,
      hop,
      review,
      ['designing'],
      { spec: true, signoff: false },
      schema,
      undefined,
      [staleFail],
    )
    expect(resolved).toEqual({ intent: null, action: approveSpecAction() })
  })

  it('never returns verify intent when verifying step is disabled', () => {
    const schema = makeFullSchema(true)
    const change = makeChangeIn('done')
    const verdict = evaluateLifecycle(change, schema, {
      approvals: { spec: false, signoff: true },
      checksByTarget: {
        archivable: [
          pass('protocol.edge'),
          fail(
            'approval.signoff',
            'APPROVAL_REQUIRED',
            'Signoff required',
            { gate: 'signoff' },
            undefined,
            undefined,
            approveSignoffAction(),
          ),
        ],
      },
    })
    expect(verdict.nextAction.intent).toBeNull()
    expect(verdict.nextAction.action).toEqual(approveSignoffAction())
  })

  it('ignores failures on non-waiting hops when evaluating lifecycle', () => {
    const schema = makeFullSchema()
    const change = makeChangeIn('implementing')
    const verdict = evaluateLifecycle(change, schema, {
      approvals: { spec: false, signoff: false },
      checksByTarget: {
        verifying: [pass('protocol.edge')],
        designing: [
          fail('@acme.other', 'OTHER', 'other', undefined, undefined, undefined, {
            kind: '@acme.fix',
          }),
        ],
      },
    })
    expect(verdict.nextAction.intent).toBe('verify')
    expect(verdict.nextAction.action).toBeUndefined()
  })

  it('resolves legacy parking states from the bound approval check action', () => {
    const schema = makeFullSchema()
    const change = makeChangeIn('pending-spec-approval')
    const verdict = evaluateLifecycle(change, schema, {
      approvals: { spec: true, signoff: false },
      checksByTarget: {
        implementing: [
          pass('protocol.edge'),
          fail(
            'approval.spec',
            'APPROVAL_REQUIRED',
            'Spec approval required',
            { gate: 'spec' },
            undefined,
            undefined,
            approveSpecAction(),
          ),
        ],
      },
    })
    expect(verdict.nextAction.intent).toBeNull()
    expect(verdict.nextAction.action).toEqual(approveSpecAction())
  })

  it('keeps the phase intent for a blocked legacy parking state without a hop action', () => {
    const schema = makeFullSchema()
    const blocked = (state: ChangeState, target: ChangeState) =>
      evaluateLifecycle(makeChangeIn(state), schema, {
        approvals: { spec: false, signoff: false },
        checksByTarget: {
          [target]: [fail('workflow.requires', 'INCOMPLETE_ARTIFACT', 'incomplete')],
        },
      }).nextAction
    expect(blocked('pending-spec-approval', 'implementing').intent).toBe('implement')
    expect(blocked('spec-approved', 'implementing').intent).toBe('implement')
    expect(blocked('pending-signoff', 'archivable').intent).toBe('archive')
    expect(blocked('signed-off', 'archivable').intent).toBe('archive')
  })

  it('maps states to phases without schema-dependent facts when verifying is disabled', () => {
    const schema = makeFullSchema(true)
    const intentIn = (state: ChangeState) =>
      evaluateLifecycle(makeChangeIn(state), schema, {
        approvals: { spec: false, signoff: false },
        checksByTarget: {},
      }).nextAction.intent
    for (const state of ['drafting', 'designing', 'implementing', 'done', 'archivable'] as const) {
      const intent = intentIn(state)
      expect(['design', 'implement', 'archive', null]).toContain(intent)
      expect(intent).not.toBe('verify')
    }
  })

  it('recommends the delivery edge from a parked state and stays when its exit is blocked', () => {
    const schema = makeFullSchema()
    const parked = makeChangeIn('pending-spec-approval')
    const open = evaluateLifecycle(parked, schema, {
      approvals: { spec: false, signoff: false },
      checksByTarget: { implementing: [pass('protocol.edge')] },
    })
    expect(open.nextHop.targetStep).toBe('implementing')
    expect(open.nextHop.actionType).toBe('mechanical')
    const blocked = evaluateLifecycle(parked, schema, {
      approvals: { spec: true, signoff: false },
      checksByTarget: {
        implementing: [
          pass('protocol.edge'),
          fail(
            'approval.spec',
            'APPROVAL_REQUIRED',
            'needs approval',
            { gate: 'spec' },
            undefined,
            undefined,
            approveSpecAction(),
          ),
        ],
      },
    })
    expect(blocked.nextHop.targetStep).toBe('pending-spec-approval')
    expect(blocked.nextHop.reason).not.toMatch(/approv/i)
    expect(blocked.nextAction.action).toEqual(approveSpecAction())
  })

  describe('validity-driven design intent without recovery', () => {
    const noReview = {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    }
    const hopFor = (target: ChangeState) => ({
      targetStep: target,
      actionType: 'mechanical' as const,
      reason: 'hop',
    })
    const validityWith = (overrides: Partial<ChangeValidityVerdict>): ChangeValidityVerdict => ({
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'not-required',
      blockers: [],
      recovery: null,
      ...overrides,
    })
    const approvals = { spec: false, signoff: false }

    it('implementing with preserved workflow and unresolved non-task drift resolves design', () => {
      const schema = makeFullSchema()
      const review = {
        required: true,
        route: 'designing' as const,
        reason: 'artifact-drift' as const,
        affectedArtifacts: [],
        overlapDetail: [],
      }
      const resolved = resolveLifecycleIntent(
        makeChangeIn('implementing'),
        hopFor('implementing'),
        review,
        [],
        approvals,
        schema,
        validityWith({}),
        [],
      )
      expect(resolved).toEqual({ intent: 'design' })
    })

    it.each(['implementing', 'verifying'] as const)(
      'artifactReviewRequired without review.required or recovery resolves design in %s',
      (state) => {
        const schema = makeFullSchema()
        const resolved = resolveLifecycleIntent(
          makeChangeIn(state),
          hopFor(state),
          noReview,
          [],
          approvals,
          schema,
          validityWith({ artifactReviewRequired: true }),
          [],
        )
        expect(resolved.intent).toBe('design')
      },
    )

    it('a blocked ready without a check action has no intent', () => {
      const schema = makeFullSchema()
      const resolved = resolveLifecycleIntent(
        makeChangeIn('ready'),
        hopFor('ready'),
        noReview,
        [],
        approvals,
        schema,
        validityWith({}),
        [fail('workflow.requires', 'INCOMPLETE_ARTIFACT', 'incomplete')],
      )
      expect(resolved).toEqual({ intent: null })
    })

    it('stale verification at archivable resolves verify', () => {
      const schema = makeFullSchema()
      const resolved = resolveLifecycleIntent(
        makeChangeIn('archivable'),
        hopFor('archivable'),
        noReview,
        [],
        approvals,
        schema,
        validityWith({ verification: 'stale' }),
        [],
      )
      expect(resolved.intent).toBe('verify')
    })

    it('archivable with current verification resolves archive', () => {
      const schema = makeFullSchema()
      const resolved = resolveLifecycleIntent(
        makeChangeIn('archivable'),
        hopFor('archivable'),
        noReview,
        [],
        approvals,
        schema,
        validityWith({ verification: 'valid' }),
        [],
      )
      expect(resolved.intent).toBe('archive')
    })

    it('verifying with stale verification, required review and no recovery resolves verify', () => {
      const schema = makeFullSchema()
      const review = {
        required: true,
        route: 'designing' as const,
        reason: 'artifact-drift' as const,
        affectedArtifacts: [],
        overlapDetail: [],
      }
      const resolved = resolveLifecycleIntent(
        makeChangeIn('verifying'),
        hopFor('verifying'),
        review,
        [],
        approvals,
        schema,
        validityWith({ verification: 'stale', artifactReviewRequired: true, recovery: null }),
        [],
      )
      expect(resolved.intent).toBe('verify')
    })
  })
})
