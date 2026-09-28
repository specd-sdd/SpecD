import { describe, expect, it } from 'vitest'
import {
  makeChange,
  makeSpecApprovalFingerprint,
  testActor,
} from '../../application/use-cases/helpers.js'
import { type Change } from '../../../src/domain/entities/change.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'
import {
  evaluateChangeValidity,
  type ChangeValidityFacts,
} from '../../../src/domain/services/change-validity.js'
import {
  type ArtifactFingerprint,
  type ValidityFingerprint,
} from '../../../src/domain/value-objects/validity-fingerprint.js'
import { DEFAULT_INVALIDATION_POLICY } from '../../../src/domain/value-objects/invalidation-policy.js'

const artifactFingerprint: ArtifactFingerprint = {
  version: 1,
  algorithm: 'artifact-pre-hash-v1',
  files: { 'proposal:proposal': 'sha256:aaa' },
}

const currentFingerprint: ValidityFingerprint = {
  version: 1,
  artifacts: artifactFingerprint,
  implementation: {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {},
  },
}

const driftedFingerprint: ValidityFingerprint = {
  ...currentFingerprint,
  artifacts: {
    ...artifactFingerprint,
    files: { 'proposal:proposal': 'sha256:bbb' },
  },
}

function facts(overrides: Partial<ChangeValidityFacts> = {}): ChangeValidityFacts {
  return {
    currentFingerprint,
    fingerprintFailures: [],
    driftedArtifacts: [],
    pendingReviewArtifacts: [],
    taskArtifacts: new Set(),
    approvalsRequired: { spec: false, signoff: false },
    verificationRequired: false,
    ...overrides,
  }
}

function changeIn(state: ChangeState): Change {
  const change = makeChange('c1')
  const path: ChangeState[] = [
    'designing',
    'ready',
    'implementing',
    'verifying',
    'done',
    'archivable',
  ]
  for (const next of path) {
    change.transition(next, testActor)
    if (next === state) break
  }
  return change
}

describe('evaluateChangeValidity', () => {
  it('keeps lifecycle state when preserve has non-task drift', () => {
    const verdict = evaluateChangeValidity(
      changeIn('implementing'),
      facts({
        driftedArtifacts: [
          { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'drift' },
        ],
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.artifactReviewRequired).toBe(true)
    expect(verdict.recovery).toBeNull()
    expect(verdict.blockers.map((blocker) => blocker.code)).toContain('ARTIFACT_DRIFT')
  })

  it('returns to designing for workflow redesign', () => {
    const verdict = evaluateChangeValidity(
      changeIn('implementing'),
      facts({
        driftedArtifacts: [
          { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'drift' },
        ],
      }),
      { artifacts: 'downstream', workflow: 'redesign' },
    )
    expect(verdict.recovery).toEqual({
      cause: 'workflow-redesign',
      from: 'implementing',
      to: 'designing',
    })
  })

  it('lets required stale spec approval outrank workflow preservation', () => {
    const change = changeIn('implementing')
    change.recordSpecApproval(
      'approved',
      makeSpecApprovalFingerprint(change.specIds, artifactFingerprint),
      testActor,
    )
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: driftedFingerprint,
        approvalsRequired: { spec: true, signoff: false },
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.specApproval).toBe('stale')
    expect(verdict.recovery).toEqual({
      cause: 'spec-approval',
      from: 'implementing',
      to: 'designing',
    })
    expect(verdict.projectionChanges).toEqual([
      expect.objectContaining({ projection: 'specApproval', from: 'valid', to: 'stale' }),
    ])
  })

  it('does not move an already-designing change for stale spec approval', () => {
    const change = changeIn('designing')
    change.recordSpecApproval(
      'approved',
      makeSpecApprovalFingerprint(change.specIds, artifactFingerprint),
      testActor,
    )
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: driftedFingerprint,
        approvalsRequired: { spec: true, signoff: false },
      }),
      { artifacts: 'downstream', workflow: 'redesign' },
    )
    expect(verdict.recovery).toBeNull()
  })

  it('returns a later change to done for required stale sign-off', () => {
    const change = changeIn('archivable')
    change.recordSignoff(
      'signed',
      {
        version: 1,
        artifacts: artifactFingerprint,
        implementation: currentFingerprint.implementation,
      },
      'verification-1',
      testActor,
    )
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: driftedFingerprint,
        approvalsRequired: { spec: false, signoff: true },
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.recovery).toEqual({ cause: 'signoff', from: 'archivable', to: 'done' })
  })

  it('does not advance to done when stale sign-off is observed before done', () => {
    const change = changeIn('implementing')
    change.recordSignoff(
      'signed',
      {
        version: 1,
        artifacts: artifactFingerprint,
        implementation: currentFingerprint.implementation,
      },
      'verification-1',
      testActor,
    )
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: driftedFingerprint,
        approvalsRequired: { spec: false, signoff: true },
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.recovery).toBeNull()
    expect(verdict.signoff).toBe('stale')
  })

  it('reports stale verification without a lifecycle return', () => {
    const change = changeIn('verifying')
    const started = change.startVerification(currentFingerprint, testActor)
    change.completeVerification(testActor)
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: driftedFingerprint,
        verificationRequired: true,
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(started.attempt.id).toEqual(expect.any(String))
    expect(verdict.verification).toBe('stale')
    expect(verdict.recovery).toBeNull()
    expect(verdict.blockers.map((blocker) => blocker.code)).toContain('VERIFICATION_STALE')
  })

  it('treats verification staleness before verifying as context', () => {
    const change = changeIn('implementing')
    change.startVerification(currentFingerprint, testActor)
    change.completeVerification(testActor)
    const verdict = evaluateChangeValidity(
      change,
      facts({ currentFingerprint: driftedFingerprint, verificationRequired: false }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.verification).toBe('stale')
    expect(verdict.blockers.map((blocker) => blocker.code)).not.toContain('VERIFICATION_STALE')
    expect(verdict.recovery).toBeNull()
  })

  it('returns the same recovery for identical facts', () => {
    const change = changeIn('implementing')
    const input = facts({
      driftedArtifacts: [
        { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'drift' },
      ],
    })
    const policy = { artifacts: 'global' as const, workflow: 'redesign' as const }
    expect(evaluateChangeValidity(change, input, policy)).toEqual(
      evaluateChangeValidity(change, input, policy),
    )
  })

  it('waives reopening under artifact policy none without waiving review', () => {
    const verdict = evaluateChangeValidity(
      changeIn('implementing'),
      facts({
        pendingReviewArtifacts: [
          {
            artifactId: 'proposal',
            fileKey: 'proposal',
            filename: 'proposal.md',
            origin: 'direct',
          },
        ],
      }),
      { artifacts: 'none', workflow: 'preserve' },
    )
    expect(verdict.artifactReviewRequired).toBe(true)
    expect(verdict.affectedArtifacts).toEqual([])
    expect(verdict.recovery).toBeNull()
  })
})
