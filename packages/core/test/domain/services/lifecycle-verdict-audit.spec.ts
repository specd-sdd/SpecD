import { describe, expect, it } from 'vitest'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { evaluateLifecycleVerdict } from '../../../src/domain/services/lifecycle-verdict.js'
import { run as runVerificationCurrent } from '../../../src/domain/checks/verification-current.js'
import {
  approveSpecAction,
  fail,
  pass,
  type CheckResult,
} from '../../../src/domain/services/transition-checks.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import {
  makeArtifactType,
  makeSchema,
  makeWorkflowStep,
  testActor,
} from '../../application/use-cases/helpers.js'

function makeChange(): Change {
  const created: ChangeEvent = {
    type: 'created',
    at: new Date('2024-01-01T00:00:00Z'),
    by: testActor,
    specIds: ['default:auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
  }
  return new Change({
    name: 'my-change',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['default:auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history: [created],
  })
}

function makeArtifact(type: string, status: ArtifactFile['status']): ChangeArtifact {
  return new ChangeArtifact({
    type,
    files: new Map([[type, new ArtifactFile({ key: type, filename: `${type}.md`, status })]]),
  })
}

function validity(overrides: Partial<ChangeValidityVerdict>): ChangeValidityVerdict {
  return {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification: 'not-required',
    fingerprintIssues: [],
    blockers: [],
    recovery: null,
    ...overrides,
  }
}

describe('evaluateLifecycleVerdict (host-neutral actions)', () => {
  it('preserves the CheckAction of a failed approval.spec check on the projected blocker', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    const approvalFail = fail(
      'approval.spec',
      'APPROVAL_REQUIRED',
      'Spec approval is required',
      { gate: 'spec' },
      undefined,
      undefined,
      approveSpecAction(),
    )
    const verdict = evaluateLifecycleVerdict(change, makeSchema(), {
      approvals: { spec: true, signoff: false },
      checksByTarget: { implementing: [pass('protocol.edge'), approvalFail] },
    })
    const blocker = verdict.blockers.find((entry) => entry.code === 'APPROVAL_REQUIRED')
    expect(blocker).toBeDefined()
    expect(blocker?.action).toEqual({ kind: 'approve-spec' })
  })

  describe('verification validity blockers', () => {
    const cases: ReadonlyArray<{
      label: string
      code: string
      validity: ChangeValidityVerdict | undefined
      kind: 'start-verification' | 'refresh-status'
    }> = [
      {
        label: 'stale',
        code: 'VERIFICATION_STALE',
        validity: validity({ verification: 'stale' }),
        kind: 'start-verification',
      },
      {
        label: 'absent',
        code: 'VERIFICATION_REQUIRED',
        validity: validity({ verification: 'absent' }),
        kind: 'start-verification',
      },
      {
        label: 'attempt-active',
        code: 'VERIFICATION_IN_PROGRESS',
        validity: validity({ verification: 'attempt-active' }),
        kind: 'start-verification',
      },
      {
        label: 'unavailable',
        code: 'VERIFICATION_VALIDITY_UNAVAILABLE',
        validity: undefined,
        kind: 'refresh-status',
      },
    ]

    it.each(cases)(
      'projects $code with a host-neutral $kind action and no command',
      ({ code, validity: verdictValidity, kind }) => {
        const change = makeChange()
        change.transition('designing', testActor)
        change.transition('ready', testActor)
        change.transition('implementing', testActor)
        change.transition('verifying', testActor)
        const verification: CheckResult = runVerificationCurrent({
          name: change.name,
          validity: verdictValidity,
        })
        expect(verification.outcome).toBe('fail')

        const verdict = evaluateLifecycleVerdict(change, makeSchema(), {
          approvals: { spec: false, signoff: false },
          checksByTarget: { done: [pass('protocol.edge'), verification] },
          requestedTarget: 'done',
        })
        const blocker = verdict.blockers.find((entry) => entry.code === code)
        expect(blocker).toBeDefined()
        expect(blocker?.action?.kind).toBe(kind)
        expect(blocker?.action?.params).toEqual({ changeName: 'my-change' })
        const details = (blocker as { details?: { command?: unknown } } | undefined)?.details
        expect(details?.command).toBeUndefined()
        expect(JSON.stringify(blocker)).not.toMatch(/specd |\/specd|--/)
      },
    )
  })

  it('orders availableSteps canonically when schema rows are declared out of order', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    const schema = makeSchema({
      workflow: [
        makeWorkflowStep('verifying'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('ready'),
      ],
    })
    const verdict = evaluateLifecycleVerdict(change, schema, {
      approvals: { spec: false, signoff: false },
      checksByTarget: {},
    })
    expect(verdict.availableSteps.map((step) => step.step)).toEqual([
      'ready',
      'implementing',
      'verifying',
    ])
  })

  it('yields an explicit null nextArtifact when every artifact is complete', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.setArtifact(makeArtifact('proposal', 'complete'))
    change.setArtifact(makeArtifact('specs', 'complete'))
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('specs', { requires: ['proposal'] }),
      ],
    })
    const verdict = evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })
    expect(verdict.nextArtifact).toBeNull()
  })
})
