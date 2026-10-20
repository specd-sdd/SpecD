import { describe, expect, it } from 'vitest'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import {
  evaluateLifecycleVerdict,
  type LifecycleVerdictInput,
} from '../../../src/domain/services/lifecycle-verdict.js'
import { resolveLifecycleCommand } from '../../../src/application/services/lifecycle-guidance.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import { makeSchema, makeWorkflowStep, testActor } from '../../application/use-cases/helpers.js'

describe('LifecycleEngine with disabled verification', () => {
  const disabledVerifyingSchema = makeSchema(
    [],
    [
      makeWorkflowStep('drafting'),
      makeWorkflowStep('designing'),
      makeWorkflowStep('ready'),
      makeWorkflowStep('implementing'),
      makeWorkflowStep('verifying', { disabled: true }),
      makeWorkflowStep('done'),
      makeWorkflowStep('archivable'),
      makeWorkflowStep('archiving'),
    ],
  )

  function makeChange(state: 'implementing' | 'done'): Change {
    const history: ChangeEvent[] = [
      {
        type: 'created' as const,
        at: new Date(),
        by: testActor,
        specIds: ['auth/login'],
        schemaName: 'test',
        schemaVersion: 1,
      },
      {
        type: 'transitioned' as const,
        from: 'drafting' as const,
        to: 'designing' as const,
        at: new Date(),
        by: testActor,
      },
      {
        type: 'transitioned' as const,
        from: 'designing' as const,
        to: 'ready' as const,
        at: new Date(),
        by: testActor,
      },
      {
        type: 'transitioned' as const,
        from: 'ready' as const,
        to: 'implementing' as const,
        at: new Date(),
        by: testActor,
      },
    ]
    if (state === 'done') {
      history.push({
        type: 'transitioned' as const,
        from: 'implementing' as const,
        to: 'done' as const,
        at: new Date(),
        by: testActor,
      })
    }
    return new Change({
      name: 'disabled-verif-change',
      createdAt: new Date(),
      specIds: ['auth/login'],
      schemaName: 'test',
      schemaVersion: 1,
      history,
    })
  }

  function evaluate(
    change: Change,
    schema = disabledVerifyingSchema,
    options: Partial<LifecycleVerdictInput> = {},
  ) {
    return evaluateLifecycleVerdict(change, schema, {
      approvals: { spec: false, signoff: false },
      checksByTarget: {},
      ...options,
    })
  }

  it('excludes verifying from availableSteps in verdict', () => {
    const change = makeChange('implementing')
    const verdict = evaluate(change)

    const stepNames = verdict.availableSteps.map((s) => s.step)
    expect(stepNames).not.toContain('verifying')
    expect(stepNames).toContain('implementing')
    expect(stepNames).toContain('done')
  })

  it('computes legal forward transitions skipping verifying to done', () => {
    const change = makeChange('implementing')
    const verdict = evaluate(change)

    expect(verdict.validTransitions).toContain('done')
    expect(verdict.validTransitions).not.toContain('verifying')
    expect(verdict.validTransitions).toContain('designing')
  })

  it('recommends nextHop targetStep done from implementing without mandating verification evidence', () => {
    const change = makeChange('implementing')
    const validity: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'absent',
      blockers: [],
      recovery: null,
    }

    const verdict = evaluate(change, disabledVerifyingSchema, {
      validity,
      checksByTarget: {
        done: [{ id: 'protocol.edge', kind: 'predicate', outcome: 'pass', label: 'Protocol' }],
      },
    })

    // When verifying is disabled, isAtOrAfterVerificationBoundary returns false so it does not recommend
    // "Renew verification in place". It advances straight to done.
    expect(verdict.nextHop.targetStep).toBe('done')
    expect(verdict.nextHop.reason).not.toContain('verification')
  })

  it('recommends /specd-archive from implementing when verifying is disabled and next hop is done', () => {
    const change = makeChange('implementing')
    const validity: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'absent',
      blockers: [],
      recovery: null,
    }

    const verdict = evaluate(change, disabledVerifyingSchema, {
      validity,
      checksByTarget: {
        done: [{ id: 'protocol.edge', kind: 'predicate', outcome: 'pass', label: 'Protocol' }],
      },
    })
    const command = resolveLifecycleCommand(
      change,
      verdict.nextHop,
      verdict.review,
      ['done', 'designing'],
      { spec: false, signoff: false },
      disabledVerifyingSchema,
      validity,
    )

    expect(command).toBe('/specd-archive')
  })

  it('recommends nextHop targetStep archivable from done when verifying is disabled', () => {
    const change = makeChange('done')
    const validity: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'absent',
      blockers: [],
      recovery: null,
    }

    const verdict = evaluate(change, disabledVerifyingSchema, {
      validity,
      checksByTarget: {
        archivable: [
          { id: 'protocol.edge', kind: 'predicate', outcome: 'pass', label: 'Protocol' },
        ],
      },
    })
    expect(verdict.nextHop.targetStep).toBe('archivable')

    const command = resolveLifecycleCommand(
      change,
      verdict.nextHop,
      verdict.review,
      ['archivable', 'designing', 'implementing'],
      { spec: false, signoff: false },
      disabledVerifyingSchema,
      validity,
    )

    expect(command).toBe('/specd-archive')
  })

  it('never recommends /specd-verify from done when verifying is disabled', () => {
    const change = makeChange('done')
    const validity: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'absent',
      blockers: [],
      recovery: null,
    }
    const hop = {
      targetStep: 'designing' as const,
      actionType: 'cognitive' as const,
      reason: 'Return to design',
    }
    const review = evaluate(change, disabledVerifyingSchema, { validity }).review

    expect(
      resolveLifecycleCommand(
        change,
        hop,
        review,
        [],
        { spec: false, signoff: false },
        disabledVerifyingSchema,
        validity,
      ),
    ).toBe('/specd-design')
    expect(
      resolveLifecycleCommand(
        change,
        { ...hop, targetStep: 'done' },
        review,
        [],
        { spec: false, signoff: false },
        disabledVerifyingSchema,
        validity,
      ),
    ).toBe('/specd-archive')
  })

  it('uses the normalized approvals snapshot for every topology projection', () => {
    const schema = makeSchema([], [makeWorkflowStep('ready', { disabled: true })])
    const change = makeChange('implementing')

    expect(() =>
      evaluate(change, schema, {
        approvals: { spec: true, signoff: false },
      }),
    ).toThrow(SchemaValidationError)
  })
  it('routes blocked done with verifying disabled to the real blocker', () => {
    const change = makeChange('done')
    const gated = { spec: false, signoff: true }
    const validity = (signoff: ChangeValidityVerdict['signoff']): ChangeValidityVerdict => ({
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff,
      verification: 'not-required',
      blockers: [],
      recovery: null,
    })
    const hop = {
      targetStep: 'done' as const,
      actionType: 'mechanical' as const,
      reason: 'blocked',
    }
    const review = evaluate(change, disabledVerifyingSchema, { validity: validity('valid') }).review

    expect(
      resolveLifecycleCommand(
        change,
        hop,
        review,
        [],
        gated,
        disabledVerifyingSchema,
        validity('stale'),
      ),
    ).toBe('specd changes approve signoff')
    expect(
      resolveLifecycleCommand(
        change,
        hop,
        review,
        [],
        { spec: false, signoff: false },
        disabledVerifyingSchema,
        validity('valid'),
      ),
    ).toBe('/specd-archive')
    expect(
      resolveLifecycleCommand(
        change,
        { ...hop, targetStep: 'archivable' },
        review,
        [],
        { spec: false, signoff: false },
        disabledVerifyingSchema,
        validity('valid'),
      ),
    ).toBe('/specd-archive')
  })
  it('derives guidance from the pipeline when workflow rows are in noncanonical order', () => {
    const noncanonical = makeSchema(
      [],
      [
        makeWorkflowStep('done'),
        makeWorkflowStep('verifying', { disabled: true }),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('ready'),
      ],
    )
    const validity: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'absent',
      blockers: [],
      recovery: null,
    }
    const hop = { targetStep: 'done' as const, actionType: 'mechanical' as const, reason: 'next' }
    const approvals = { spec: false, signoff: false }

    for (const state of ['implementing', 'done'] as const) {
      const change = makeChange(state)
      const review = evaluate(change, noncanonical, { validity }).review
      expect(
        resolveLifecycleCommand(change, hop, review, [], approvals, noncanonical, validity),
      ).not.toBe('/specd-verify')
    }
    // Canonical order comes from the pipeline, not from the declared row order.
    expect(
      evaluate(makeChange('implementing'), noncanonical).availableSteps.map((entry) => entry.step),
    ).toEqual(['ready', 'implementing', 'done'])
  })
})
