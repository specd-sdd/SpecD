import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import {
  fail,
  startVerificationAction,
  type Check,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import {
  makeChangeRepository,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeObservingReconcile,
  testActor,
} from './helpers.js'

function makeStdSchema(): Schema {
  return makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('specs', { scope: 'spec' }),
    makeArtifactType('verify', { scope: 'spec', requires: ['specs'] }),
  ])
}

function makeRefresh(): RefreshImplementationTracking {
  return {
    execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
}

function makeGetStatus(
  changes: ReturnType<typeof makeChangeRepository>,
  opts: {
    approvals?: { spec: boolean; signoff: boolean }
    archiveBindings?: CheckBinding[]
    reconcile?: ReconcileChangeValidity
    runStepHooks?: ReturnType<typeof makeRunStepHooks>
  } = {},
) {
  const schemaProvider = makeSchemaProvider(makeStdSchema())
  const refresh = makeRefresh()
  const registry = createWorkflowCheckRegistry({
    countTasks: new CountTasks(changes, schemaProvider),
    runStepHooks: opts.runStepHooks ?? makeRunStepHooks(),
    readyFacts: {
      changes,
      listWorkspaces: makeListWorkspaces(),
      parsers: makeNoopParsers(),
      extractorTransforms: new Map(),
      workspaceRoutes: [],
    },
    detectImplLinksInScope,
  })
  return new GetStatus(
    changes,
    schemaProvider,
    opts.approvals ?? { spec: false, signoff: false },
    refresh,
    registry.transitionBindings,
    opts.archiveBindings ?? registry.archiveBindings,
    opts.reconcile ?? makeObservingReconcile(changes, undefined, refresh),
  )
}

function advance(change: Change, states: readonly Parameters<Change['transition']>[0][]): Change {
  for (const state of states) {
    change.transition(state, testActor)
  }
  return change
}

function reconcileAs(change: Change, verdict: ChangeValidityVerdict): ReconcileChangeValidity {
  return {
    execute: async () => ({
      change,
      verdict,
      projectionChanges: [],
      affectedArtifacts: [],
      automaticReturn: verdict.recovery,
      changed: false,
    }),
  } as unknown as ReconcileChangeValidity
}

describe('GetStatus (decoupled guidance audit)', () => {
  it('projects the approve-spec action on both the blocker and nextAction', async () => {
    const change = advance(makeChange('gate'), ['designing', 'ready'])
    const uc = makeGetStatus(makeChangeRepository([change]), {
      approvals: { spec: true, signoff: false },
    })

    const result = await uc.execute({ name: 'gate' })

    const required = result.blockers.filter((entry) => entry.code === 'APPROVAL_REQUIRED')
    expect(required).toHaveLength(1)
    const blocker = required[0]
    expect(blocker?.checkId).toBe('approval.spec')
    expect(blocker?.label).toBeDefined()
    expect(blocker?.action).toEqual({ kind: 'approve-spec' })
    expect(result.nextAction.action).toEqual({ kind: 'approve-spec' })
    expect(result.nextAction.intent).toBeNull()
  })

  it('carries start-verification on the verification blocker without details.command', async () => {
    const change = advance(makeChange('stale-verif'), [
      'designing',
      'ready',
      'implementing',
      'verifying',
      'done',
    ])
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'stale',
      fingerprintIssues: [],
      blockers: [
        {
          code: 'VERIFICATION_STALE',
          message: 'Verification is stale',
          action: startVerificationAction('stale-verif'),
        },
      ],
      recovery: null,
    }
    const uc = makeGetStatus(makeChangeRepository([change]), {
      reconcile: reconcileAs(change, verdict),
    })

    const result = await uc.execute({ name: 'stale-verif' })

    const staleBlockers = result.blockers.filter((entry) => entry.code === 'VERIFICATION_STALE')
    expect(staleBlockers).toHaveLength(1)
    const blocker = staleBlockers[0]
    expect(blocker?.checkId).toBe('verification.current')
    expect(blocker?.label).toBeDefined()
    expect(blocker?.action?.kind).toBe('start-verification')
    expect(blocker?.action?.params).toEqual({ changeName: 'stale-verif' })
    const details = (blocker as { details?: { command?: unknown } } | undefined)?.details
    expect(details?.command).toBeUndefined()
  })

  it('merges the real in-progress verification blocker and check failure into one blocker', async () => {
    const change = advance(makeChange('in-progress'), [
      'designing',
      'ready',
      'implementing',
      'verifying',
    ])
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'attempt-active',
      fingerprintIssues: [],
      blockers: [
        {
          code: 'VERIFICATION_IN_PROGRESS',
          message: 'Verification is in progress',
          action: startVerificationAction('in-progress'),
        },
      ],
      recovery: null,
    }
    const uc = makeGetStatus(makeChangeRepository([change]), {
      reconcile: reconcileAs(change, verdict),
    })

    const result = await uc.execute({ name: 'in-progress' })

    const matches = result.blockers.filter((entry) => entry.code === 'VERIFICATION_IN_PROGRESS')
    expect(matches).toHaveLength(1)
    expect(matches[0]?.checkId).toBe('verification.current')
    expect(matches[0]?.label).toBeDefined()
  })

  describe('blocker merge pairs by code and gate', () => {
    function doneChange(name: string): Change {
      return advance(makeChange(name), ['designing', 'ready', 'implementing', 'verifying', 'done'])
    }

    function consentVerdict(
      specApproval: ChangeValidityVerdict['specApproval'],
      signoff: ChangeValidityVerdict['signoff'],
      blockers: ChangeValidityVerdict['blockers'],
    ): ChangeValidityVerdict {
      return {
        artifactReviewRequired: false,
        affectedArtifacts: [],
        projectionChanges: [],
        specApproval,
        signoff,
        verification: 'valid',
        fingerprintIssues: [],
        blockers,
        recovery: null,
      }
    }

    it('keeps stale spec consent and a stale sign-off failure as two blockers at done', async () => {
      const change = doneChange('both-stale')
      const verdict = consentVerdict('stale', 'stale', [
        { code: 'APPROVAL_STALE', message: 'Spec approval is stale' },
        { code: 'SIGNOFF_STALE', message: 'Sign-off is stale' },
      ])
      const uc = makeGetStatus(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: true },
        reconcile: reconcileAs(change, verdict),
      })

      const result = await uc.execute({ name: 'both-stale' })

      const stale = result.blockers.filter((b) => b.code === 'APPROVAL_STALE')
      expect(stale).toHaveLength(2)
      const spec = stale.find((b) => b.message === 'Spec approval is stale')
      expect(spec).toBeDefined()
      expect(spec?.checkId).toBeUndefined()
      expect(spec?.action).toBeUndefined()
      const signoff = stale.find((b) => b.checkId === 'approval.signoff')
      expect(signoff?.message).toBe('Signoff is stale')
      expect(signoff?.action?.kind).toBe('approve-signoff')
      expect(result.blockers.some((b) => b.code === 'SIGNOFF_STALE')).toBe(false)
    })

    it('reports a missing sign-off once, with the approve-signoff action', async () => {
      const change = doneChange('no-signoff')
      const verdict = consentVerdict('valid', 'absent', [
        { code: 'SIGNOFF_REQUIRED', message: 'Sign-off is required' },
      ])
      const uc = makeGetStatus(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: true },
        reconcile: reconcileAs(change, verdict),
      })

      const result = await uc.execute({ name: 'no-signoff' })

      const consent = result.blockers.filter(
        (b) => b.code === 'SIGNOFF_REQUIRED' || b.checkId === 'approval.signoff',
      )
      expect(consent).toHaveLength(1)
      expect(consent[0]?.checkId).toBe('approval.signoff')
      expect(consent[0]?.action?.kind).toBe('approve-signoff')
      expect(consent[0]?.message).toBe('Signoff is required before entering archivable')
    })
  })

  it('under preserve, pending non-task review without recovery keeps state and routes guidance to design', async () => {
    const change = new Change({
      name: 'preserved',
      createdAt: new Date(),
      specIds: [],
      schemaName: 'test-schema',
      schemaVersion: 1,
      history: [],
      invalidationPolicy: { artifacts: 'downstream', workflow: 'preserve' },
    })
    advance(change, ['designing', 'ready', 'implementing'])
    change.setArtifact(
      new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({
              key: 'proposal',
              filename: 'proposal.md',
              status: 'pending-review',
            }),
          ],
        ]),
      }),
    )
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: true,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'not-required',
      fingerprintIssues: [],
      blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Artifact files require review' }],
      recovery: null,
    }
    const uc = makeGetStatus(makeChangeRepository([change]), {
      reconcile: reconcileAs(change, verdict),
    })

    const result = await uc.execute({ name: 'preserved' })

    expect(change.state).toBe('implementing')
    expect(result.change?.state).toBe('implementing')
    expect(result.validity?.automaticReturn).toBeNull()
    expect(result.nextAction.intent).toBe('design')
    expect(result.nextAction.targetStep).toBe('designing')
  })

  it('does not find a discarded-only change and never reads getDiscarded', async () => {
    const change = makeChange('gone')
    change.discard('no longer needed', testActor)
    const repo = makeChangeRepository()
    repo.store.set(change.name, change)
    const getDiscarded = vi.spyOn(repo, 'getDiscarded')
    const uc = makeGetStatus(repo)

    await expect(uc.execute({ name: 'gone' })).rejects.toThrow(ChangeNotFoundError)
    expect(getDiscarded).not.toHaveBeenCalled()
  })

  it('evaluates archive predicates with no user bypass and reports a skippable failure', async () => {
    const change = advance(makeChange('arch'), [
      'designing',
      'ready',
      'implementing',
      'verifying',
      'done',
      'archivable',
    ])
    const execute = vi.fn(async () =>
      fail('spec.overlap', 'OVERLAP_CONFLICT', 'Specs overlap with other active changes'),
    )
    const check: Check = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      execute,
    }
    const archiveBindings: CheckBinding[] = [
      {
        check,
        applicability: [{ scope: 'archive' }],
        skippable: true,
        allowBindingOverride: true,
        allowConfigOverride: true,
      },
    ]
    const uc = makeGetStatus(makeChangeRepository([change]), { archiveBindings })

    const result = await uc.execute({ name: 'arch' })

    expect(execute).toHaveBeenCalled()
    const blocker = result.blockers.find((entry) => entry.code === 'OVERLAP_CONFLICT')
    expect(blocker?.isSkippable).toBe(true)
    expect('bypassFlag' in (blocker ?? {})).toBe(false)
  })

  it('keeps the verify next action when live overlap meets stale verification', async () => {
    const change = advance(makeChange('overlap-stale'), [
      'designing',
      'ready',
      'implementing',
      'verifying',
      'done',
      'archivable',
    ])
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'not-required',
      verification: 'stale',
      fingerprintIssues: [],
      blockers: [
        {
          code: 'VERIFICATION_STALE',
          message: 'Verification is stale',
          action: startVerificationAction('overlap-stale'),
        },
      ],
      recovery: null,
    }
    const check: Check = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      execute: async () =>
        fail('spec.overlap', 'OVERLAP_CONFLICT', 'Specs overlap with other active changes'),
    }
    const archiveBindings: CheckBinding[] = [
      {
        check,
        applicability: [{ scope: 'archive' }],
        skippable: true,
        allowBindingOverride: true,
        allowConfigOverride: true,
      },
    ]
    const uc = makeGetStatus(makeChangeRepository([change]), {
      archiveBindings,
      reconcile: reconcileAs(change, verdict),
    })

    const result = await uc.execute({ name: 'overlap-stale' })

    expect(result.blockers.some((entry) => entry.code === 'OVERLAP_CONFLICT')).toBe(true)
    expect(result.blockers.some((entry) => entry.code === 'VERIFICATION_STALE')).toBe(true)
    expect(result.nextAction.intent).toBe('verify')
    expect(result.nextAction.reason).not.toMatch(/overlap/i)
    // Finding: the spec also wants the `start-verification` action here, but nextAction.action
    // only comes from the failed predicates of the selected hop (archivable -> archiving carries
    // none), so the action stays on the verification blocker. Pinned as-is, not faked.
    expect(result.nextAction.action).toBeUndefined()
    const verification = result.blockers.find((entry) => entry.code === 'VERIFICATION_STALE')
    expect(verification?.action?.kind).toBe('start-verification')
  })

  it('has no transition effects: no hooks, history mutation or persistence', async () => {
    const change = advance(makeChange('pure'), ['designing', 'ready', 'implementing'])
    const repo = makeChangeRepository([change])
    const mutate = vi.spyOn(repo, 'mutate')
    const create = vi.spyOn(repo, 'create')
    const hooks = makeRunStepHooks()
    const hooksExecute = vi.spyOn(hooks, 'execute')
    const historyBefore = change.history.length
    const stateBefore = change.state
    const uc = makeGetStatus(repo, { runStepHooks: hooks })

    await uc.execute({ name: 'pure' })

    expect(hooksExecute).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(change.history.length).toBe(historyBefore)
    expect(change.state).toBe(stateBefore)
  })

  it('leaves nextAction.action undefined for a drafted change', async () => {
    const change = makeChange('drafted')
    change.transition('designing', testActor)
    change.draft(testActor)
    const repo = makeChangeRepository()
    repo.store.set(change.name, change)
    const uc = makeGetStatus(repo)

    const result = await uc.execute({ name: 'drafted' })

    expect(result.draftView).toBeDefined()
    expect(result.nextAction.action).toBeUndefined()
  })

  it('fails explicitly when the mandatory reconciler is missing', () => {
    const changes = makeChangeRepository()
    const schemaProvider = makeSchemaProvider(makeStdSchema())
    expect(
      () =>
        new GetStatus(
          changes,
          schemaProvider,
          { spec: false, signoff: false },
          makeRefresh(),
          [],
          [],
        ),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})
