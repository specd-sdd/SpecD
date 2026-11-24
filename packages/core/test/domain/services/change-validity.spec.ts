import { describe, expect, it } from 'vitest'
import {
  makeChange,
  makeSpecApprovalFingerprint,
  testActor,
} from '../../application/use-cases/helpers.js'
import { Change } from '../../../src/domain/entities/change.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'
import {
  collectChangeReviewTargets,
  evaluateChangeValidity,
  selectAutomaticRecovery,
  type ChangeValidityFacts,
} from '../../../src/domain/services/change-validity.js'
import { RECOVERY_ONLY_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
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

  it('attaches a start-verification action to every verification blocker without CLI strings', () => {
    const required = evaluateChangeValidity(
      changeIn('verifying'),
      facts({ verificationRequired: true }),
      DEFAULT_INVALIDATION_POLICY,
    )
    const inProgress = changeIn('verifying')
    inProgress.startVerification(currentFingerprint, testActor)
    const active = evaluateChangeValidity(
      inProgress,
      facts({ verificationRequired: true }),
      DEFAULT_INVALIDATION_POLICY,
    )
    const stale = changeIn('verifying')
    stale.startVerification(currentFingerprint, testActor)
    stale.completeVerification(testActor)
    const staleVerdict = evaluateChangeValidity(
      stale,
      facts({ currentFingerprint: driftedFingerprint, verificationRequired: true }),
      DEFAULT_INVALIDATION_POLICY,
    )
    const cases = [
      ['VERIFICATION_REQUIRED', required, 'c1'],
      ['VERIFICATION_IN_PROGRESS', active, inProgress.name],
      ['VERIFICATION_STALE', staleVerdict, stale.name],
    ] as const
    for (const [code, verdict, name] of cases) {
      const blocker = verdict.blockers.find((entry) => entry.code === code)
      expect(blocker, code).toBeDefined()
      expect(blocker?.action?.kind).toBe('start-verification')
      expect(blocker?.action?.params).toEqual({ changeName: name })
      expect(JSON.stringify(blocker)).not.toMatch(/specd |--|\/specd-/)
    }
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

  it('surfaces fingerprint input failures as non-blocking fingerprintIssues', () => {
    const failure = {
      scope: 'artifact' as const,
      key: 'proposal.md',
      reason: 'missing' as const,
      message: "Artifact file 'proposal.md' does not exist",
    }
    const verdict = evaluateChangeValidity(
      changeIn('designing'),
      facts({
        currentFingerprint: null,
        fingerprintFailures: [failure],
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.fingerprintIssues).toEqual([failure])
    expect(verdict.blockers.map((b) => b.code)).not.toContain('FINGERPRINT_INPUT_ERROR')
  })

  it('invalidates stored evidence when fingerprint failures occur without adding FINGERPRINT_INPUT_ERROR blocker', () => {
    const change = changeIn('implementing')
    change.recordSpecApproval(
      'approved',
      makeSpecApprovalFingerprint(change.specIds, artifactFingerprint),
      testActor,
    )
    const failure = {
      scope: 'artifact' as const,
      key: 'proposal.md',
      reason: 'unreadable' as const,
      message: 'Permission denied',
    }
    const verdict = evaluateChangeValidity(
      change,
      facts({
        currentFingerprint: null,
        fingerprintFailures: [failure],
        approvalsRequired: { spec: true, signoff: false },
      }),
      DEFAULT_INVALIDATION_POLICY,
    )
    expect(verdict.fingerprintIssues).toEqual([failure])
    expect(verdict.specApproval).toBe('stale')
    expect(verdict.blockers.map((b) => b.code)).not.toContain('FINGERPRINT_INPUT_ERROR')
    expect(verdict.recovery).toEqual({
      cause: 'spec-approval',
      from: 'implementing',
      to: 'designing',
    })
  })
})

describe('recovery topology coverage', () => {
  const states: readonly ChangeState[] = [
    'drafting',
    'designing',
    'ready',
    'pending-spec-approval',
    'spec-approved',
    'implementing',
    'verifying',
    'done',
    'pending-signoff',
    'signed-off',
    'archivable',
    'archiving',
  ]
  const selections = [
    (state: ChangeState) =>
      selectAutomaticRecovery(state, DEFAULT_INVALIDATION_POLICY, 'stale', 'not-required', false),
    (state: ChangeState) =>
      selectAutomaticRecovery(state, DEFAULT_INVALIDATION_POLICY, 'revoked', 'not-required', false),
    (state: ChangeState) =>
      selectAutomaticRecovery(state, DEFAULT_INVALIDATION_POLICY, 'not-required', 'stale', false),
    (state: ChangeState) =>
      selectAutomaticRecovery(state, DEFAULT_INVALIDATION_POLICY, 'not-required', 'revoked', false),
    (state: ChangeState) =>
      selectAutomaticRecovery(
        state,
        { artifacts: 'downstream', workflow: 'redesign' },
        'not-required',
        'not-required',
        true,
      ),
  ]

  it('has a RECOVERY_ONLY_TRANSITIONS entry for every recovery selectAutomaticRecovery can return', () => {
    let selected = 0
    for (const state of states) {
      for (const select of selections) {
        const recovery = select(state)
        if (recovery === null) continue
        selected += 1
        expect(
          RECOVERY_ONLY_TRANSITIONS[recovery.cause][state],
          `${recovery.cause} from ${state}`,
        ).toBe(recovery.to)
      }
    }
    expect(selected).toBeGreaterThan(0)
  })
})

describe('collectChangeReviewTargets', () => {
  function changeWith(files: Record<string, ArtifactFile[]>): Change {
    const at = new Date('2026-01-01T00:00:00.000Z')
    return new Change({
      name: 'c1',
      createdAt: at,
      specIds: ['core:change'],
      schemaName: 'test-schema',
      schemaVersion: 1,
      history: [
        {
          type: 'created',
          at,
          by: testActor,
          specIds: ['core:change'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
      ],
      artifacts: new Map(
        Object.entries(files).map(([type, list]) => [
          type,
          new ChangeArtifact({
            type,
            requires: [],
            files: new Map(list.map((f) => [f.key, f])),
          }),
        ]),
      ),
    })
  }
  const file = (
    key: string,
    status: ArtifactFile['status'],
    validatedHash?: string,
  ): ArtifactFile =>
    new ArtifactFile({
      key,
      filename: `${key}.md`,
      status,
      ...(validatedHash !== undefined ? { validatedHash } : {}),
    })

  it('reports hash-only drift without the drift flag', () => {
    const change = changeWith({ proposal: [file('proposal', 'complete', 'sha256:aaa')] })
    const result = collectChangeReviewTargets(change, driftedFingerprint, new Set())
    expect(result.drifted).toEqual([
      { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'drift' },
    ])
    expect(result.pending).toEqual([])
  })

  it('reports pending-review files as direct targets', () => {
    const change = changeWith({ proposal: [file('proposal', 'pending-review')] })
    const result = collectChangeReviewTargets(change, currentFingerprint, new Set())
    expect(result.drifted).toEqual([])
    expect(result.pending).toEqual([
      { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'direct' },
    ])
  })

  it('reports a drifted pending-review file once, as drift only', () => {
    const change = changeWith({ proposal: [file('proposal', 'pending-review', 'sha256:aaa')] })
    const result = collectChangeReviewTargets(change, driftedFingerprint, new Set())
    expect(result.drifted).toEqual([
      { artifactId: 'proposal', fileKey: 'proposal', filename: 'proposal.md', origin: 'drift' },
    ])
    expect(result.pending).toEqual([])
  })

  it('ignores task artifacts and skipped files', () => {
    const change = changeWith({
      tasks: [file('tasks', 'pending-review', 'sha256:aaa')],
      proposal: [file('proposal', 'skipped', 'sha256:aaa')],
    })
    const result = collectChangeReviewTargets(change, driftedFingerprint, new Set(['tasks']))
    expect(result).toEqual({ drifted: [], pending: [] })
  })

  it('returns nothing for clean files and when no fingerprint is available', () => {
    const clean = changeWith({ proposal: [file('proposal', 'complete', 'sha256:aaa')] })
    expect(collectChangeReviewTargets(clean, currentFingerprint, new Set())).toEqual({
      drifted: [],
      pending: [],
    })
    expect(collectChangeReviewTargets(clean, null, new Set())).toEqual({
      drifted: [],
      pending: [],
    })
  })
})
