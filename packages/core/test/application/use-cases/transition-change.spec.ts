import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type TransitionProgressEvent } from '../../../src/application/use-cases/transition-change.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { ReconciledOperationBlockedError } from '../../../src/application/errors/reconciled-operation-blocked-error.js'
import { HappyPathNextUnavailableError } from '../../../src/domain/errors/happy-path-next-unavailable-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import { ArchiveImplementationStateError } from '../../../src/domain/errors/archive-implementation-state-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { CheckPredicateFailedError } from '../../../src/domain/errors/check-predicate-failed-error.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import {
  UnknownCheckError,
  CheckNotSkippableError,
} from '../../../src/domain/errors/check-registry-errors.js'
import {
  type CustomCheckDefinition,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { Logger } from '../../../src/application/logger.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { type ValidityFingerprint } from '../../../src/domain/value-objects/validity-fingerprint.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeRunStepHooks,
  makeWorkflowStep,
  makeListWorkspaces,
  makeNoopParsers,
  makeObservingReconcile,
  makeSpecApprovalFingerprint,
  testActor,
} from './helpers.js'

function makeChangeInState(
  name: string,
  events: ChangeEvent[],
  schemaName: string = 'test-schema',
): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    schemaName,
    schemaVersion: 1,
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: actor,
        specIds: ['auth/login'],
        schemaName,
        schemaVersion: 1,
      },
      ...events,
    ],
  })
}

const actor = testActor

function makeRefreshImplementationTracking(
  execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
): RefreshImplementationTracking {
  return { execute } as unknown as RefreshImplementationTracking
}

/** Creates a TransitionChange with all required deps (schema + hooks are no-ops by default). */
function makeUseCase(
  repo: ReturnType<typeof makeChangeRepository>,
  overrides?: {
    schema?: ReturnType<typeof makeSchema> | null
    schemaProvider?: SchemaProvider
    runStepHooks?: ReturnType<typeof makeRunStepHooks>
    refresh?: RefreshImplementationTracking
    refreshExecute?: ReturnType<typeof vi.fn>
    approvals?: { spec: boolean; signoff: boolean }
    countTasks?: CountTasks
    reconcile?: ReconcileChangeValidity
    transitionBindings?: readonly CheckBinding[]
    checkRegistry?: CheckRegistry
  },
): TransitionChange {
  const refresh =
    overrides?.refresh ??
    makeRefreshImplementationTracking(
      overrides?.refreshExecute ?? vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    )
  const schemaProvider =
    overrides?.schemaProvider ??
    makeSchemaProvider(overrides?.schema !== undefined ? overrides.schema : makeSchema())
  const runStepHooks = overrides?.runStepHooks ?? makeRunStepHooks()
  const countTasks = overrides?.countTasks ?? new CountTasks(repo, schemaProvider)
  const registry = createWorkflowCheckRegistry({
    countTasks,
    runStepHooks,
    readyFacts: {
      changes: repo,
      listWorkspaces: makeListWorkspaces(),
      parsers: makeNoopParsers(),
      extractorTransforms: new Map(),
      workspaceRoutes: [],
    },
    detectImplLinksInScope,
  })
  return new TransitionChange(
    repo,
    makeActorResolver(),
    schemaProvider,
    refresh,
    overrides?.approvals ?? { spec: false, signoff: false },
    overrides?.transitionBindings ?? registry.transitionBindings,
    overrides?.reconcile ?? makeObservingReconcile(repo, undefined, refresh),
    overrides?.checkRegistry,
  )
}

describe('TransitionChange', () => {
  it('reports a committed automatic recovery instead of a context-free transition failure', async () => {
    const change = makeChangeInState('recovered-change', [
      { type: 'transitioned', from: 'drafting', to: 'archivable', at: new Date(), by: actor },
    ])
    const repo = makeChangeRepository([change])
    const recovery = { cause: 'signoff' as const, from: 'archivable' as const, to: 'done' as const }
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'stale',
      verification: 'valid',
      blockers: [{ code: 'SIGNOFF_STALE', message: 'Sign-off is stale' }],
      recovery,
    }
    const reconcile = {
      execute: async () => {
        change.recover(recovery, actor)
        return {
          change,
          verdict,
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: recovery,
          changed: true,
        }
      },
    } as unknown as ReconcileChangeValidity
    const useCase = makeUseCase(repo, { reconcile })

    await expect(useCase.execute({ name: change.name, to: 'archiving' })).rejects.toMatchObject({
      name: ReconciledOperationBlockedError.name,
      code: 'RECONCILED_OPERATION_BLOCKED',
      operation: 'transition',
      changeName: change.name,
      state: 'done',
      automaticReturn: recovery,
      blockers: verdict.blockers,
      nextAction: { targetStep: 'done', command: '/specd-verify' },
    })
  })

  it('never recommends /specd-verify for a committed recovery when verifying is disabled', async () => {
    const change = makeChangeInState('recovered-no-verify', [
      { type: 'transitioned', from: 'drafting', to: 'archivable', at: new Date(), by: actor },
    ])
    const repo = makeChangeRepository([change])
    const recovery = { cause: 'signoff' as const, from: 'archivable' as const, to: 'done' as const }
    const verdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'stale',
      verification: 'not-required',
      blockers: [{ code: 'SIGNOFF_STALE', message: 'Sign-off is stale' }],
      recovery,
    }
    const reconcile = {
      execute: async () => {
        change.recover(recovery, actor)
        return {
          change,
          verdict,
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: recovery,
          changed: true,
        }
      },
    } as unknown as ReconcileChangeValidity
    const schema = makeSchema({
      workflow: [
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying', { disabled: true }),
      ],
    })
    const useCase = makeUseCase(repo, { reconcile, schema })

    const error = await useCase
      .execute({ name: change.name, to: 'archiving' })
      .then(() => undefined)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ReconciledOperationBlockedError)
    const nextAction = (error as ReconciledOperationBlockedError).nextAction
    expect(nextAction.command).not.toBe('/specd-verify')
    expect(nextAction.reason).toContain('returned the change to done')
  })

  it.each(['signed-off', 'archivable', 'archiving'] as const)(
    'rejects a manual %s to done recovery-only edge',
    async (from) => {
      const change = makeChangeInState('manual-recovery', [
        { type: 'transitioned', from: 'drafting', to: from, at: new Date(), by: actor },
      ])
      const useCase = makeUseCase(makeChangeRepository([change]))

      await expect(useCase.execute({ name: change.name, to: 'done' })).rejects.toThrow(
        InvalidStateTransitionError,
      )
    },
  )

  describe('given a drafted change only', () => {
    it('throws ChangeNotFoundError because get returns null for drafted storage', async () => {
      const change = makeChangeInState('parked', [
        {
          type: 'created',
          at: new Date('2024-01-01T00:00:00Z'),
          by: actor,
          specIds: ['auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
      ])
      change.draft(actor)
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({
          name: 'parked',
          to: 'designing',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = makeUseCase(makeChangeRepository())

      await expect(
        uc.execute({
          name: 'missing',
          to: 'designing',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given schema cannot be resolved', () => {
    it('throws SchemaNotFoundError instead of skipping checks', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]), { schema: null })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'designing',
        }),
      ).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('to next happy-path', () => {
    it('resolves implementing to verifying', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, { schema: implementingSchema })

      const result = await uc.execute({ name: 'my-change', to: 'next' })

      expect(result.change.state).toBe('verifying')
    })

    it('rejects from archivable', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
        { type: 'transitioned', from: 'done', to: 'archivable', at: new Date(), by: actor },
      ])
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'next' })).rejects.toThrow(
        HappyPathNextUnavailableError,
      )
    })

    it('rejects from pending-spec-approval', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        {
          type: 'transitioned',
          from: 'ready',
          to: 'pending-spec-approval',
          at: new Date(),
          by: actor,
        },
      ])
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'next' })).rejects.toThrow(
        HappyPathNextUnavailableError,
      )
    })

    it('rejects from pending-signoff', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
        { type: 'transitioned', from: 'done', to: 'pending-signoff', at: new Date(), by: actor },
      ])
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'next' })).rejects.toThrow(
        HappyPathNextUnavailableError,
      )
    })

    it('rejects from archiving', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
        { type: 'transitioned', from: 'done', to: 'archivable', at: new Date(), by: actor },
        { type: 'transitioned', from: 'archivable', to: 'archiving', at: new Date(), by: actor },
      ])
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'next' })).rejects.toThrow(
        HappyPathNextUnavailableError,
      )
    })
  })

  describe('implementation tracking refresh', () => {
    it('refreshes active changes by default', async () => {
      const change = makeChangeInState('my-change', [])
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(refreshExecute).toHaveBeenCalledWith({ name: 'my-change' })
    })

    it('skips only the initial refresh when explicitly disabled but keeps the post-hook refresh', async () => {
      const change = makeChangeInState('my-change', [])
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({
        name: 'my-change',
        to: 'designing',
        refreshImplementationTrackingBefore: false,
      })

      expect(refreshExecute).toHaveBeenCalledOnce()
      expect(refreshExecute).toHaveBeenCalledWith({ name: 'my-change' })
    })
  })

  describe('given a change in drafting state', () => {
    it('transitions to designing', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('saves the updated change', async () => {
      const change = makeChangeInState('my-change', [])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      const saved = repo.store.get('my-change')
      expect(saved?.state).toBe('designing')
    })

    it('persists the final lifecycle change through ChangeRepository.mutate', async () => {
      const change = makeChangeInState('my-change', [])
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = makeUseCase(repo)

      await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })

    it('returns the updated change on success', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('throws InvalidStateTransitionError for invalid transition', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given a change in ready state — approval gate routing', () => {
    function makeReadyChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
    }

    it('routes ready → implementing when approvalsSpec is false', async () => {
      const change = makeReadyChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: false },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
    })

    it('stays in ready and throws approval-required when spec gate is on without consent', async () => {
      const change = makeReadyChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: false },
      })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'spec' },
      })
      expect(change.state).toBe('ready')
    })

    it('transitions ready → implementing when spec gate is on and consent is recorded', async () => {
      const change = makeReadyChange('my-change')
      change.recordSpecApproval('ok', makeSpecApprovalFingerprint(change.specIds), actor)
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: false },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
    })
  })

  describe('given a change in done state — signoff gate routing', () => {
    function makeDoneChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
      ])
    }

    it('routes done → archivable when approvalsSignoff is false', async () => {
      const change = makeDoneChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: false },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
      })

      expect(result.change.state).toBe('archivable')
    })

    it('stays in done and throws approval-required when signoff gate is on without consent', async () => {
      const change = makeDoneChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: true },
      })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'archivable',
        }),
      ).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'signoff' },
      })
      expect(change.state).toBe('done')
    })

    it('transitions done → archivable when signoff gate is on and consent is recorded', async () => {
      const change = makeDoneChange('my-change')
      change.recordSignoff('ok', {}, actor)
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: true },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
      })

      expect(result.change.state).toBe('archivable')
    })
  })

  describe('given a change at a human approval boundary', () => {
    function makePendingSpecApprovalChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        {
          type: 'transitioned',
          from: 'ready',
          to: 'pending-spec-approval',
          at: new Date(),
          by: actor,
        },
      ])
    }

    function makePendingSignoffChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
        { type: 'transitioned', from: 'done', to: 'pending-signoff', at: new Date(), by: actor },
      ])
    }

    it('drains pending-spec-approval → spec-approved', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: false },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'spec-approved',
      })

      expect(result.change.state).toBe('spec-approved')
    })

    it('drains pending-signoff → signed-off', async () => {
      const change = makePendingSignoffChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: true },
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'signed-off',
      })

      expect(result.change.state).toBe('signed-off')
    })

    it('still allows redesign from pending spec approval', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('reports spec approval guidance for a non-drain pending spec transition', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'implementing' })).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'spec' },
      })
      expect(change.state).toBe('pending-spec-approval')
    })

    it('reports signoff guidance for a non-drain pending signoff transition', async () => {
      const change = makePendingSignoffChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'archivable' })).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'signoff' },
      })
      expect(change.state).toBe('pending-signoff')
    })
  })

  describe('given a verifying → implementing transition', () => {
    function makeVerifyingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
      ])
    }

    it('preserves artifact validation state for artifacts in the implementing step requires from schema', async () => {
      const change = makeVerifyingChange('my-change')
      const specFile = new ArtifactFile({ key: 'spec', filename: 'spec.md', status: 'in-progress' })
      const spec = new ChangeArtifact({ type: 'spec', files: new Map([['spec', specFile]]) })
      spec.markComplete('spec', 'sha256:abc')
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:def')
      change.setArtifact(spec)
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['spec'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, { schema })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      const saved = repo.store.get('my-change')
      const savedSpec = saved?.getArtifact('spec')
      const savedTasks = saved?.getArtifact('tasks')
      expect(savedSpec?.getFile('spec')?.validatedHash).toBe('sha256:abc')
      expect(savedSpec?.status).toBe('complete')
      expect(savedTasks?.getFile('tasks')?.validatedHash).toBe('sha256:def')
      expect(savedTasks?.status).toBe('complete')
    })

    it('does not clear hashes when no implementing step exists in schema', async () => {
      const change = makeVerifyingChange('my-change')
      const specFile = new ArtifactFile({ key: 'spec', filename: 'spec.md', status: 'in-progress' })
      const spec = new ChangeArtifact({ type: 'spec', files: new Map([['spec', specFile]]) })
      spec.markComplete('spec', 'sha256:abc')
      change.setArtifact(spec)

      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(spec.getFile('spec')?.validatedHash).toBe('sha256:abc')
    })
  })

  describe('task completion gating during requires enforcement', () => {
    function makeImplementingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
    }

    function setupTaskCheckSchema(stepName = 'verifying'): ReturnType<typeof makeSchema> {
      return makeSchema({
        artifacts: [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
          }),
          makeArtifactType('verify'),
        ],
        workflow: [
          {
            step: stepName,
            requires: ['verify', 'tasks'],
            requiresTaskCompletion: ['tasks'],
            hooks: { pre: [], post: [] },
          },
        ],
      })
    }

    function setupChangeWithTaskArtifact(change: Change): void {
      const tasksFile = new ArtifactFile({ key: 'tasks', filename: 'tasks.md' })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      const verifyFile = new ArtifactFile({ key: 'verify', filename: 'verify.md' })
      const verify = new ChangeArtifact({
        type: 'verify',
        files: new Map([['verify', verifyFile]]),
      })
      verify.markComplete('verify', 'sha256:def')
      change.setArtifact(tasks)
      change.setArtifact(verify)
    }

    it('blocks transition when a required artifact has incomplete task items', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] unfinished task\n- [x] done task')
        }
        return null
      }
      const uc = makeUseCase(repo, { schema: setupTaskCheckSchema() })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })

    it('allows transition when all tasks are complete', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [x] done task\n- [x] another done')
        }
        return null
      }
      const uc = makeUseCase(repo, { schema: setupTaskCheckSchema() })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(result.change.state).toBe('verifying')
    })

    it('allows transition when artifact file is absent', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async () => null
      const uc = makeUseCase(repo, { schema: setupTaskCheckSchema() })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(result.change.state).toBe('verifying')
    })

    it('allows transition when required artifact has no taskCompletionCheck', async () => {
      const change = makeImplementingChange('my-change')
      const verifyFile = new ArtifactFile({ key: 'verify', filename: 'verify.md' })
      const verify = new ChangeArtifact({
        type: 'verify',
        files: new Map([['verify', verifyFile]]),
      })
      verify.markComplete('verify', 'sha256:def')
      change.setArtifact(verify)

      const schema = makeSchema({
        artifacts: [makeArtifactType('verify')],
        workflow: [
          {
            step: 'verifying',
            requires: ['verify'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const repo = makeChangeRepository([change])
      const artifactSpy = vi.fn().mockResolvedValue(null)
      repo.artifact = artifactSpy
      const uc = makeUseCase(repo, { schema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(result.change.state).toBe('verifying')
      expect(artifactSpy).not.toHaveBeenCalled()
    })

    it('rejects a completion-gated artifact without taskCompletionCheck', async () => {
      const change = makeImplementingChange('missing-task-configuration')
      setupChangeWithTaskArtifact(change)
      const schema = makeSchema({
        artifacts: [makeArtifactType('tasks', { hasTasks: true }), makeArtifactType('verify')],
        workflow: [
          {
            step: 'verifying',
            requires: ['verify', 'tasks'],
            requiresTaskCompletion: ['tasks'],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      await expect(
        uc.execute({ name: 'missing-task-configuration', to: 'verifying' }),
      ).rejects.toMatchObject({
        reason: { type: 'missing-task-capability', artifactId: 'tasks' },
      })
    })

    it('blocks transition on any step with taskCompletionCheck requires', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
      ])
      const tasksFile = new ArtifactFile({ key: 'tasks', filename: 'tasks.md' })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        artifacts: [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
          }),
        ],
        workflow: [
          {
            step: 'archivable',
            requires: ['tasks'],
            requiresTaskCompletion: ['tasks'],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] still incomplete')
        }
        return null
      }
      const uc = makeUseCase(repo, { schema })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'archivable',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })

    it('does not gate when requiresTaskCompletion is absent', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] unfinished task')
        }
        return null
      }
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
          }),
          makeArtifactType('verify'),
        ],
        workflow: [
          {
            step: 'verifying',
            requires: ['verify', 'tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(repo, { schema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(result.change.state).toBe('verifying')
    })

    it('throws with incomplete-tasks reason including counts', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] task1\n- [x] task2\n- [ ] task3\n- [x] task4')
        }
        return null
      }
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: {
              incompletePattern: '^\\s*-\\s+\\[ \\]',
              completePattern: '^\\s*-\\s+\\[x\\]',
            },
          }),
          makeArtifactType('verify'),
        ],
        workflow: [
          {
            step: 'verifying',
            requires: ['verify', 'tasks'],
            requiresTaskCompletion: ['tasks'],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(repo, { schema })

      try {
        await uc.execute({
          name: 'my-change',
          to: 'verifying',
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStateTransitionError)
        const error = err as InstanceType<typeof InvalidStateTransitionError>
        expect(error.reason).toEqual({
          type: 'incomplete-tasks',
          artifactId: 'tasks',
          incomplete: 2,
          complete: 2,
          total: 4,
        })
        expect(error.message).toContain('2/4 tasks complete')
      }
    })

    it('emits task-completion-failed progress event before throwing', async () => {
      const change = makeImplementingChange('my-change')
      setupChangeWithTaskArtifact(change)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] unfinished\n- [x] done')
        }
        return null
      }
      const uc = makeUseCase(repo, { schema: setupTaskCheckSchema() })

      const events: TransitionProgressEvent[] = []
      await expect(
        uc.execute({ name: 'my-change', to: 'verifying' }, (evt) => events.push(evt)),
      ).rejects.toThrow(InvalidStateTransitionError)

      const failedEvent = events.find((e) => e.type === 'task-completion-failed')
      expect(failedEvent).toBeDefined()
      expect(failedEvent).toMatchObject({
        type: 'task-completion-failed',
        artifactId: 'tasks',
        incomplete: 1,
      })
    })
  })

  describe('workflow requires enforcement', () => {
    function makeReadyChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
    }

    it('blocks transition when a required artifact is not complete', async () => {
      const change = makeReadyChange('my-change')
      // No artifacts set → effectiveStatus('tasks') is 'missing'
      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })

    it('throws with incomplete-artifact reason when requires unsatisfied', async () => {
      const change = makeReadyChange('my-change')
      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      try {
        await uc.execute({
          name: 'my-change',
          to: 'implementing',
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStateTransitionError)
        const error = err as InstanceType<typeof InvalidStateTransitionError>
        expect(error.reason).toEqual({
          type: 'incomplete-artifact',
          artifactId: 'tasks',
          status: 'missing',
        })
        expect(error.message).toContain("artifact 'tasks' is missing")
      }
    })

    it('allows transition when all required artifacts are complete', async () => {
      const change = makeReadyChange('my-change')
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
    })

    it('allows transition when required artifact is skipped', async () => {
      const change = makeReadyChange('my-change')
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({
        type: 'tasks',
        optional: true,
        files: new Map([['tasks', tasksFile]]),
      })
      tasks.markSkipped()
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
    })

    it('skips requires check when no workflow step exists for the target', async () => {
      const change = makeReadyChange('my-change')
      // Schema with no workflow steps at all
      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
    })

    it('emits requires-check progress events', async () => {
      const change = makeReadyChange('my-change')
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'implementing',
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'requires-check',
        artifactId: 'tasks',
        satisfied: true,
      })
    })

    it('blocks transition on first unsatisfied artifact when multiple required', async () => {
      const change = makeReadyChange('my-change')
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      change.setArtifact(tasks)
      // 'spec' artifact is NOT set → effectiveStatus('spec') is 'missing'

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks', 'spec'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })

    it('emits requires-check event with satisfied:false for unsatisfied artifact', async () => {
      const change = makeReadyChange('my-change')
      // No artifacts set → effectiveStatus('tasks') is 'missing'

      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: ['tasks'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const events: TransitionProgressEvent[] = []
      await uc
        .execute(
          {
            name: 'my-change',
            to: 'implementing',
          },
          (evt) => events.push(evt),
        )
        .catch(() => {})

      expect(events).toContainEqual({
        type: 'requires-check',
        artifactId: 'tasks',
        satisfied: false,
      })
    })
  })

  describe('hook execution', () => {
    /** Schema with a workflow step for 'implementing' so hooks are triggered. */
    const hookSchema = makeSchema({
      workflow: [
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    function makeReadyChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
    }

    it('delegates to RunStepHooks with correct name, step, and phase', async () => {
      const change = makeReadyChange('my-change')
      const calls: Array<{ name: string; step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ name: input.name, step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      // ready has no workflow step → no source.post hooks, only target.pre
      expect(calls).toEqual([{ name: 'my-change', step: 'implementing', phase: 'pre' }])
    })

    it('throws HookFailedError when a pre-hook fails', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              success: false,
              failedHooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              warnings: [],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow(HookFailedError)
    })

    it('does not transition state when pre-hook fails', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              success: false,
              failedHooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              warnings: [],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(repo, { schema: hookSchema, runStepHooks })

      await uc
        .execute({
          name: 'my-change',
          to: 'implementing',
        })
        .catch(() => {})

      expect(repo.store.get('my-change')?.state).toBe('ready')
    })

    it('allows transition to proceed when a pre-hook fails but has onFailure: "warn"', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'non-blocking-lint',
                  command: 'npm run lint:warn',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'Warning: lint issues found',
                  success: false,
                },
              ],
              success: true, // onFailure: 'warn' preserves success: true
              failedHooks: [],
              warnings: [
                {
                  id: 'non-blocking-lint',
                  command: 'npm run lint:warn',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'Warning: lint issues found',
                  success: false,
                },
              ],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(repo, { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
      expect(repo.store.get('my-change')?.state).toBe('implementing')
    })

    it('allows transition to proceed when a post-hook fails but has onFailure: "warn"', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'implementing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'telemetry',
                  command: 'send-telemetry',
                  exitCode: 2,
                  stdout: '',
                  stderr: 'Network unreachable',
                  success: false,
                },
              ],
              success: true,
              failedHooks: [],
              warnings: [
                {
                  id: 'telemetry',
                  command: 'send-telemetry',
                  exitCode: 2,
                  stdout: '',
                  stderr: 'Network unreachable',
                  success: false,
                },
              ],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(repo, { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(result.change.state).toBe('verifying')
      expect(repo.store.get('my-change')?.state).toBe('verifying')
    })

    it('aborts transition when a hook phase contains both a warn failure and an abort failure', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'warn-check',
                  command: 'check-warn',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'warn',
                  success: false,
                },
                {
                  id: 'critical-build',
                  command: 'pnpm build',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'build failed',
                  success: false,
                },
              ],
              success: false,
              failedHooks: [
                {
                  id: 'critical-build',
                  command: 'pnpm build',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'build failed',
                  success: false,
                },
              ],
              warnings: [
                {
                  id: 'warn-check',
                  command: 'check-warn',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'warn',
                  success: false,
                },
              ],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(repo, { schema: hookSchema, runStepHooks })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow(HookFailedError)

      expect(repo.store.get('my-change')?.state).toBe('ready')
    })

    it('does not call post-hooks when pre-hook fails', async () => {
      const change = makeReadyChange('my-change')
      const calls: string[] = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push(input.phase)
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              success: false,
              failedHooks: [
                {
                  id: 'lint',
                  command: 'pnpm lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'err',
                  success: false,
                },
              ],
              warnings: [],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc
        .execute({
          name: 'my-change',
          to: 'implementing',
        })
        .catch(() => {})

      expect(calls).toEqual(['pre'])
    })

    it('skips all hooks when skipHookPhases contains all', async () => {
      const change = makeReadyChange('my-change')
      const executeSpy = vi.fn()
      const runStepHooks = makeRunStepHooks({ execute: executeSpy })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        skipHookPhases: new Set(['all']),
      })

      expect(executeSpy).not.toHaveBeenCalled()
      expect(result.change.state).toBe('implementing')
    })

    it('runs post hooks for source state, not target', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(calls).toEqual([
        { step: 'implementing', phase: 'post' },
        { step: 'verifying', phase: 'pre' },
      ])
    })

    it('does not run post hooks for target state on entry', async () => {
      const change = makeReadyChange('my-change')
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      // ready has no workflow step, so no source.post hooks
      // implementing has a workflow step, so target.pre hooks run
      const postCalls = calls.filter((c) => c.phase === 'post')
      expect(postCalls).toEqual([])
    })

    it('skips post hooks when source has no workflow step', async () => {
      const change = makeChangeInState('my-change', [])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const designingSchema = makeSchema({
        workflow: [
          {
            step: 'designing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: designingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      // drafting has no workflow step → no source.post hooks
      const postCalls = calls.filter((c) => c.phase === 'post')
      expect(postCalls).toEqual([])
    })

    it('source.post runs before target.pre', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const order: string[] = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          order.push(`${input.step}.${input.phase}`)
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
      })

      expect(order).toEqual(['implementing.post', 'verifying.pre'])
    })

    it('throws HookFailedError when source.post hook fails', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.step === 'implementing' && input.phase === 'post') {
            return {
              hooks: [],
              success: false,
              failedHooks: [
                {
                  id: 'test',
                  command: 'pnpm test',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'fail',
                  success: false,
                },
              ],
              warnings: [],
            }
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, {
        schema: implementingSchema,
        runStepHooks,
      })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
        }),
      ).rejects.toThrow(HookFailedError)
      expect(repo.store.get('my-change')?.state).toBe('implementing')
    })

    it('skipHookPhases target.pre skips only pre hooks', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        skipHookPhases: new Set(['target.pre']),
      })

      expect(calls).toEqual([{ step: 'implementing', phase: 'post' }])
    })

    it('skipHookPhases source.pre does not skip hook.pre or hook.post', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        skipHookPhases: new Set(['source.pre']),
      })

      expect(calls).toEqual([
        { step: 'implementing', phase: 'post' },
        { step: 'verifying', phase: 'pre' },
      ])
    })

    it('skipHookPhases target.post does not skip hook.pre or hook.post', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        skipHookPhases: new Set(['target.post']),
      })

      expect(calls).toEqual([
        { step: 'implementing', phase: 'post' },
        { step: 'verifying', phase: 'pre' },
      ])
    })

    it('skipHookPhases source.post skips only post hooks', async () => {
      const implementingSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const calls: Array<{ step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          calls.push({ step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        skipHookPhases: new Set(['source.post']),
      })

      expect(calls).toEqual([{ step: 'verifying', phase: 'pre' }])
    })

    it('emits transitioned progress event', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'designing',
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'transitioned',
        from: 'drafting',
        to: 'designing',
      })
    })

    it('emits check-start/progress/done for hook.pre on the generic bus', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'pre') {
            onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
            onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'implementing',
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'check-start',
        id: 'hook.pre',
        label: 'Running pre hooks',
      })
      expect(events).toContainEqual({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-start',
        hookId: 'lint',
        command: 'pnpm lint',
        message: 'pnpm lint',
      })
      expect(events).toContainEqual({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'pass',
      })
    })

    it('emits hook output/heartbeat as check-progress under hook.pre', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'pre') {
            onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
            onProgress?.({
              type: 'hook-output',
              hookId: 'lint',
              stream: 'stdout',
              line: 'running lint',
            })
            onProgress?.({ type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 })
            onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute({ name: 'my-change', to: 'implementing' }, (event) => events.push(event))

      expect(events).toContainEqual({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'running lint',
      })
      expect(events).toContainEqual({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-heartbeat',
        hookId: 'lint',
        elapsedMs: 5000,
        message: '5s',
      })
    })

    it('emits check-start/done for hook.post on the generic bus', async () => {
      const postSchema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'post') {
            onProgress?.({ type: 'hook-start', hookId: 'notify', command: 'notify-slack' })
            onProgress?.({ type: 'hook-done', hookId: 'notify', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: postSchema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'verifying',
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'check-start',
        id: 'hook.post',
        label: 'Running post hooks',
      })
      expect(events).toContainEqual({
        type: 'check-done',
        id: 'hook.post',
        label: 'Running post hooks',
        outcome: 'pass',
      })
    })

    it('emits all events in correct order: source.post → target.pre → transitioned', async () => {
      const schema = makeSchema({
        workflow: [
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'post') {
            onProgress?.({ type: 'hook-start', hookId: 'test', command: 'pnpm test' })
            onProgress?.({ type: 'hook-done', hookId: 'test', success: true, exitCode: 0 })
          }
          if (input.phase === 'pre') {
            onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
            onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'verifying',
        },
        (evt) => events.push(evt),
      )

      const types = events
        .filter(
          (e): e is Extract<TransitionProgressEvent, { type: 'check-start' | 'check-done' }> =>
            (e.type === 'check-start' || e.type === 'check-done') &&
            (e.id === 'hook.pre' || e.id === 'hook.post'),
        )
        .map((e) => `${e.type}(${e.id})`)
        .concat(events.filter((e) => e.type === 'transitioned').map((e) => e.type))
      expect(types).toEqual([
        'check-start(hook.post)',
        'check-done(hook.post)',
        'check-start(hook.pre)',
        'check-done(hook.pre)',
        'transitioned',
      ])
    })

    it('emits check-start/done for deps.consistent predicate on the generic bus', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'sha256:abc',
              }),
            ],
          ]),
        }),
      )
      const schema = makeSchema({
        artifacts: [makeArtifactType('proposal')],
        workflow: [
          {
            step: 'ready',
            requires: ['proposal'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const events: TransitionProgressEvent[] = []
      await uc.execute({ name: 'my-change', to: 'ready' }, (evt) => events.push(evt))

      expect(events).toContainEqual({
        type: 'check-start',
        id: 'deps.consistent',
        label: 'Checking spec dependencies',
      })
      expect(events).toContainEqual({
        type: 'check-done',
        id: 'deps.consistent',
        label: 'Checking spec dependencies',
        outcome: 'pass',
      })
      const labeled = events.filter(
        (e): e is Extract<TransitionProgressEvent, { type: 'check-start' | 'check-done' }> =>
          e.type === 'check-start' || e.type === 'check-done',
      )
      expect(labeled.every((e) => !e.label.startsWith('Executing:'))).toBe(true)
    })
  })

  describe('schema resolution edge cases', () => {
    it('throws when schema cannot be resolved', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const uc = makeUseCase(makeChangeRepository([change]), { schema: null })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
        }),
      ).rejects.toThrow()
    })

    it('skips requires and hooks when schema has no workflow step for target', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const executeSpy = vi
        .fn()
        .mockResolvedValue({ hooks: [], success: true, failedHooks: [], warnings: [] })
      const runStepHooks = makeRunStepHooks({ execute: executeSpy })
      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { schema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
      // No workflow step → hooks are NOT called
      expect(executeSpy).not.toHaveBeenCalled()
      expect(result.change).toBeDefined()
    })
  })

  describe('transition to designing', () => {
    function makeArchivableChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
        { type: 'transitioned', from: 'done', to: 'archivable', at: new Date(), by: actor },
      ])
    }

    function makeImplementingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
    }

    function makeImplementingChangeWithApproval(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        {
          type: 'transitioned',
          from: 'ready',
          to: 'pending-spec-approval',
          at: new Date(),
          by: actor,
        },
        {
          type: 'spec-approved',
          reason: 'lgtm',
          at: new Date(),
          by: actor,
          artifactHashes: {},
        },
        {
          type: 'transitioned',
          from: 'pending-spec-approval',
          to: 'spec-approved',
          at: new Date(),
          by: actor,
        },
        {
          type: 'transitioned',
          from: 'spec-approved',
          to: 'implementing',
          at: new Date(),
          by: actor,
        },
      ])
    }

    it('transitions from archivable to designing', async () => {
      const change = makeArchivableChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('transitions from implementing to designing', async () => {
      const change = makeImplementingChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('preserves approvals when lifecycle movement alone returns to designing', async () => {
      const change = makeImplementingChangeWithApproval('my-change')
      expect(change.activeSpecApproval).toBeDefined()

      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.activeSpecApproval).toBeDefined()
    })

    it('does not fabricate artifact review when transitioning to designing', async () => {
      const change = makeImplementingChange('my-change')
      expect(change.activeSpecApproval).toBeUndefined()
      expect(change.activeSignoff).toBeUndefined()

      const invalidateSpy = vi.spyOn(change, 'invalidate')
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('transitions after invalidate when returning to designing', async () => {
      const change = makeImplementingChange('my-change')
      const transitionSpy = vi.spyOn(change, 'transition')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(transitionSpy).toHaveBeenCalled()
    })

    it('does not trigger invalidation for drafting to designing', async () => {
      const change = makeChangeInState('my-change', [])
      expect(change.state).toBe('drafting')

      const invalidateSpy = vi.spyOn(change, 'invalidate')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('does not invalidate when transitioning from designing to designing', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      expect(change.state).toBe('designing')

      const invalidateSpy = vi.spyOn(change, 'invalidate')
      const historyLength = change.history.length
      const updatedAt = change.updatedAt
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(invalidateSpy).not.toHaveBeenCalled()
      expect(result.change.history).toHaveLength(historyLength)
      expect(result.change.updatedAt).toEqual(updatedAt)
    })

    it('rejects verifying self-entry instead of treating it as a neutral request', async () => {
      const at = new Date('2024-01-01T00:00:00Z')
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at, by: actor },
      ])
      const historyLength = change.history.length
      const updatedAt = change.updatedAt
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'my-change', to: 'verifying' })).rejects.toThrow(
        InvalidStateTransitionError,
      )
      expect(change.history).toHaveLength(historyLength)
      expect(change.updatedAt).toEqual(updatedAt)
    })

    it('does not downgrade artifacts when transitioning from designing to designing', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      expect(change.state).toBe('designing')

      const proposalFile = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
      })
      const proposal = new ChangeArtifact({
        type: 'proposal',
        optional: false,
        files: new Map([['proposal', proposalFile]]),
      })
      proposal.markComplete('proposal', 'sha256:abc')
      change.setArtifact(proposal)

      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      const proposalAfter = result.change.getArtifact('proposal')
      expect(proposalAfter).not.toBeNull()
      const file = proposalAfter!.files.get('proposal')!
      expect(file.status).toBe('complete')
      expect(file.validatedHash).toBe('sha256:abc')
      expect(result.change.history.filter((e) => e.type === 'invalidated')).toHaveLength(0)
    })

    it('preserves active spec approval when transitioning from designing to designing', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'spec-approved', reason: 'lgtm', at: new Date(), by: actor, artifactHashes: {} },
      ])
      expect(change.state).toBe('designing')
      expect(change.activeSpecApproval).toBeDefined()

      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.activeSpecApproval).toBeDefined()
    })
  })

  describe('given a change in archiving state', () => {
    it('transitions to archivable without running archive hooks', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const change = makeChangeInState('my-change', [
        {
          type: 'created',
          at: createdAt,
          by: actor,
          specIds: ['auth/login'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'archivable', to: 'archiving', at: createdAt, by: actor },
      ])
      const hooks = makeRunStepHooks({
        execute: vi
          .fn()
          .mockResolvedValue({ hooks: [], success: true, failedHooks: [], warnings: [] }),
      })
      const uc = makeUseCase(makeChangeRepository([change]), { runStepHooks: hooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
      })

      expect(result.change.state).toBe('archivable')
      expect(hooks.execute).not.toHaveBeenCalled()
    })

    it('transitions from archiving to designing without fabricating drift', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const change = makeChangeInState('my-change', [
        {
          type: 'created',
          at: createdAt,
          by: actor,
          specIds: ['auth/login'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'archivable', to: 'archiving', at: createdAt, by: actor },
      ])
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
              }),
            ],
          ]),
        }),
      )
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.getArtifact('proposal')?.files.get('proposal')?.status).toBe('complete')
    })
  })

  describe('given shared predicate evaluation', () => {
    it('rechecks CountTasks after mutation-capable hooks', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(
        makeSchema({
          workflow: [
            {
              step: 'verifying',
              requires: [],
              requiresTaskCompletion: ['tasks'],
              hooks: { pre: [], post: [] },
            },
          ],
          artifacts: [
            makeArtifactType('tasks', {
              hasTasks: true,
              taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
            }),
          ],
        }),
      )
      const countTasks = new CountTasks(repo, schemaProvider)
      const executeSpy = vi.spyOn(countTasks, 'execute')
      const runStepHooks = makeRunStepHooks()
      const registry = createWorkflowCheckRegistry({
        countTasks,
        runStepHooks,
        readyFacts: {
          changes: repo,
          listWorkspaces: makeListWorkspaces(),
          parsers: makeNoopParsers(),
          extractorTransforms: new Map(),
          workspaceRoutes: [],
        },
        detectImplLinksInScope,
      })
      const uc = new TransitionChange(
        repo,
        makeActorResolver(),
        schemaProvider,
        makeRefreshImplementationTracking(),
        { spec: false, signoff: false },
        registry.transitionBindings,
        makeObservingReconcile(repo),
      )

      await uc.execute({ name: 'my-change', to: 'verifying' })

      expect(executeSpy).toHaveBeenCalledTimes(2)
    })

    it('still fails incomplete tasks when skipHookPhases is all', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const tasksFile = new ArtifactFile({
        key: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
      })
      const tasks = new ChangeArtifact({ type: 'tasks', files: new Map([['tasks', tasksFile]]) })
      tasks.markComplete('tasks', 'sha256:abc')
      change.setArtifact(tasks)
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] unfinished')
        }
        return null
      }
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
          }),
          makeArtifactType('verify'),
        ],
        workflow: [
          {
            step: 'verifying',
            requires: ['tasks'],
            requiresTaskCompletion: ['tasks'],
            hooks: { pre: [], post: [] },
          },
        ],
      })
      const uc = makeUseCase(repo, { schema })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
          skipHookPhases: new Set(['all']),
        }),
      ).rejects.toMatchObject({ reason: { type: 'incomplete-tasks' } })
    })

    it('skips source.post on redesign into designing', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const executeSpy = vi
        .fn()
        .mockResolvedValue({ hooks: [], success: true, failedHooks: [], warnings: [] })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: makeSchema({
          workflow: [
            {
              step: 'implementing',
              requires: [],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
            },
            {
              step: 'designing',
              requires: [],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
            },
          ],
        }),
        runStepHooks: makeRunStepHooks({ execute: executeSpy }),
      })

      await uc.execute({ name: 'my-change', to: 'designing' })

      expect(executeSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ step: 'implementing', phase: 'post' }),
        expect.anything(),
      )
    })

    it('clears signoff on done → implementing without downgrading artifacts', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
      ])
      change.recordSpecApproval('spec ok', makeSpecApprovalFingerprint(change.specIds), actor)
      change.recordSignoff('ship it', {}, actor)
      const proposal = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({
              key: 'proposal',
              filename: 'proposal.md',
              status: 'complete',
              validatedHash: 'sha256:abc',
            }),
          ],
        ]),
      })
      change.setArtifact(proposal)
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change', to: 'implementing' })

      expect(result.change.state).toBe('implementing')
      expect(result.change.activeSignoff).toBeUndefined()
      expect(result.change.activeSpecApproval).toBeDefined()
      expect(result.change.getArtifact('proposal')?.files.get('proposal')?.status).toBe('complete')
    })

    it('throws ReadOnlyWorkspaceError on designing → ready', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(makeSchema())
      const countTasks = new CountTasks(repo, schemaProvider)
      const runStepHooks = makeRunStepHooks()
      const registry = createWorkflowCheckRegistry({
        countTasks,
        runStepHooks,
        readyFacts: {
          changes: repo,
          listWorkspaces: makeListWorkspaces(),
          parsers: makeNoopParsers(),
          extractorTransforms: new Map(),
          workspaceRoutes: [],
        },
        detectImplLinksInScope,
      })
      const readOnlyFail: (typeof registry.transitionBindings)[number]['check'] = {
        id: 'workspace.readOnly',
        label: 'Checking workspace ownership',
        kind: 'predicate',
        execute: async () => ({
          id: 'workspace.readOnly',
          label: 'Checking workspace ownership',
          kind: 'predicate',
          outcome: 'fail',
          code: 'READ_ONLY_WORKSPACE',
          message: 'read-only',
        }),
      }
      const transitionBindings = registry.transitionBindings.map((binding) =>
        binding.check.id === 'workspace.readOnly' ? { ...binding, check: readOnlyFail } : binding,
      )
      const uc = new TransitionChange(
        repo,
        makeActorResolver(),
        schemaProvider,
        makeRefreshImplementationTracking(),
        { spec: false, signoff: false },
        transitionBindings,
        makeObservingReconcile(repo),
      )

      await expect(uc.execute({ name: 'my-change', to: 'ready' })).rejects.toThrow(
        CheckPredicateFailedError,
      )
    })
  })

  describe('implementation tracking after refresh', () => {
    function makeImplementingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
    }

    const verifyingSchema = makeSchema({
      workflow: [makeWorkflowStep('implementing'), makeWorkflowStep('verifying')],
    })

    it('evaluates impl.filesResolved against post-refresh tracked files', async () => {
      const change = makeImplementingChange('my-change')
      const repo = makeChangeRepository([change])
      const refreshExecute = vi.fn().mockImplementation(async () => {
        const fresh = makeImplementingChange('my-change')
        fresh.trackImplementationFile('packages/core/src/foo.ts', 'open')
        repo.store.set('my-change', fresh)
        return {
          trackedFiles: [{ file: 'packages/core/src/foo.ts', state: 'open' }],
          links: [],
        }
      })
      const uc = makeUseCase(repo, { schema: verifyingSchema, refreshExecute })

      await expect(uc.execute({ name: 'my-change', to: 'verifying' })).rejects.toThrow(
        CheckPredicateFailedError,
      )
    })

    it('blocks verifying when a hook creates an open tracked file, even with the pre-refresh disabled', async () => {
      const change = makeImplementingChange('my-change')
      const repo = makeChangeRepository([change])
      // With the pre-evaluation refresh disabled, the only refresh is the post-hook one.
      const refreshExecute = vi.fn().mockImplementation(async () => {
        const fresh = makeImplementingChange('my-change')
        fresh.trackImplementationFile('packages/core/src/from-hook.ts', 'open')
        repo.store.set('my-change', fresh)
        return {
          trackedFiles: [{ file: 'packages/core/src/from-hook.ts', state: 'open' }],
          links: [],
        }
      })
      const uc = makeUseCase(repo, { schema: verifyingSchema, refreshExecute })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
          refreshImplementationTrackingBefore: false,
        }),
      ).rejects.toThrow(CheckPredicateFailedError)
      expect(refreshExecute).toHaveBeenCalled()
    })

    it('skips impl.linksInScope through the uniform skipChecks contract', async () => {
      const change = makeImplementingChange('my-change')
      change.addImplementationLink({
        specId: 'auth/shared',
        file: 'src/shared.ts',
        fileLinkExplicit: true,
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: verifyingSchema })

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
        skipChecks: ['impl.linksInScope'],
      })

      expect(result.change.state).toBe('verifying')
    })

    it('still fails open tracked files when only impl.linksInScope is skipped', async () => {
      const change = makeImplementingChange('my-change')
      change.trackImplementationFile('packages/core/src/foo.ts', 'open')
      const uc = makeUseCase(makeChangeRepository([change]), { schema: verifyingSchema })

      await expect(
        uc.execute({ name: 'my-change', to: 'verifying', skipChecks: ['impl.linksInScope'] }),
      ).rejects.toThrow(CheckPredicateFailedError)
    })

    describe('policy from resolved bindings', () => {
      const skippableFilesSchema = makeSchema({
        workflow: [
          makeWorkflowStep('implementing'),
          makeWorkflowStep('verifying', {
            checks: [{ id: 'impl.filesResolved', skippable: true }],
          }),
        ],
      })

      const withOpenFile = () => {
        const change = makeImplementingChange('my-change')
        change.trackImplementationFile('packages/core/src/foo.ts', 'open')
        return change
      }

      it('rejects skipping a non-skippable default binding when the schema does not declare it', async () => {
        const uc = makeUseCase(makeChangeRepository([withOpenFile()]), { schema: verifyingSchema })

        await expect(
          uc.execute({ name: 'my-change', to: 'verifying', skipChecks: ['impl.filesResolved'] }),
        ).rejects.toThrow(CheckNotSkippableError)
      })

      it('honors schema-declared skippable in skip validation', async () => {
        const uc = makeUseCase(makeChangeRepository([withOpenFile()]), {
          schema: skippableFilesSchema,
        })

        const result = await uc.execute({
          name: 'my-change',
          to: 'verifying',
          skipChecks: ['impl.filesResolved'],
        })

        expect(result.change.state).toBe('verifying')
      })

      it('marks the failure skippable from the resolved binding', async () => {
        const uc = makeUseCase(makeChangeRepository([withOpenFile()]), {
          schema: skippableFilesSchema,
        })

        const failure = await uc
          .execute({ name: 'my-change', to: 'verifying' })
          .then(() => undefined)
          .catch((error: unknown) => error)

        expect(failure).toBeInstanceOf(CheckPredicateFailedError)
        expect((failure as CheckPredicateFailedError).skippable).toBe(true)
      })
    })

    describe('schema-embedded Category C check uses the executable registry instance', () => {
      const embeddedSchema = makeSchema({
        workflow: [
          makeWorkflowStep('implementing', { disabled: true }),
          makeWorkflowStep('verifying', { disabled: true }),
          makeWorkflowStep('done', { checks: [{ id: 'impl.linksInScope' }] }),
        ],
      })

      const makeReadyChangeWithOutOfScopeLink = (): Change => {
        const change = makeChangeInState('my-change', [
          { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        ])
        change.addImplementationLink({
          specId: 'auth/shared',
          file: 'src/shared.ts',
          fileLinkExplicit: true,
        })
        return change
      }

      const executableRegistry = (repo: ReturnType<typeof makeChangeRepository>) => {
        const schemaProvider = makeSchemaProvider(embeddedSchema)
        const built = createWorkflowCheckRegistry({
          countTasks: new CountTasks(repo, schemaProvider),
          runStepHooks: makeRunStepHooks(),
          readyFacts: {
            changes: repo,
            listWorkspaces: makeListWorkspaces(),
            parsers: makeNoopParsers(),
            extractorTransforms: new Map(),
            workspaceRoutes: [],
          },
          detectImplLinksInScope,
        })
        return new CheckRegistry().withExecutableBuiltins(built.checks)
      }

      it('fails the hop when the embedded check finds out-of-scope links', async () => {
        const repo = makeChangeRepository([makeReadyChangeWithOutOfScopeLink()])
        const uc = makeUseCase(repo, {
          schema: embeddedSchema,
          checkRegistry: executableRegistry(repo),
        })

        const failure = await uc
          .execute({ name: 'my-change', to: 'done' })
          .then(() => undefined)
          .catch((error: unknown) => error)

        expect(failure).toBeInstanceOf(CheckPredicateFailedError)
        expect((failure as CheckPredicateFailedError).checkId).toBe('impl.linksInScope')
      })

      it('would not fail with the domain stub registry, proving the executable swap matters', async () => {
        const repo = makeChangeRepository([makeReadyChangeWithOutOfScopeLink()])
        const uc = makeUseCase(repo, { schema: embeddedSchema, checkRegistry: new CheckRegistry() })

        const result = await uc.execute({ name: 'my-change', to: 'done' }).catch((e: unknown) => e)

        expect(result).not.toBeInstanceOf(CheckPredicateFailedError)
      })
    })

    it('fails impl.linksInScope without its skipChecks entry', async () => {
      const change = makeImplementingChange('my-change')
      change.addImplementationLink({
        specId: 'auth/shared',
        file: 'src/shared.ts',
        fileLinkExplicit: true,
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: verifyingSchema })

      await expect(uc.execute({ name: 'my-change', to: 'verifying' })).rejects.toThrow(
        CheckPredicateFailedError,
      )
    })
  })

  describe('Input contract', () => {
    it('Input accepts transition controls without approval flags', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: makeSchema({
          workflow: [makeWorkflowStep('implementing'), makeWorkflowStep('verifying')],
        }),
      })

      const result = await uc.execute({
        name: 'my-change',
        to: 'next',
        skipChecks: ['impl.linksInScope'],
        refreshImplementationTrackingBefore: false,
      })

      expect(result.change.state).toBe('verifying')
    })
  })

  describe('implementation tracking auto-activation', () => {
    it('activates implementation tracking when transitioning to implementing for the first time', async () => {
      const change = makeChangeInState('auto-track', [
        {
          type: 'transitioned',
          from: 'drafting',
          to: 'designing',
          at: new Date('2024-01-01T00:00:00Z'),
          by: actor,
        },
        {
          type: 'transitioned',
          from: 'designing',
          to: 'ready',
          at: new Date('2024-01-01T00:00:00Z'),
          by: actor,
        },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      expect(change.isImplementationTrackingActive).toBe(false)

      const result = await uc.execute({
        name: 'auto-track',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
      expect(result.change.isImplementationTrackingActive).toBe(true)
      expect(result.change.implementationTrackingStartedAt).not.toBeNull()
    })

    it('preserves pre-existing implementationTrackingStartedAt when transitioning to implementing', async () => {
      const explicitStart = new Date('2024-05-01T12:00:00Z')
      const change = makeChangeInState('preserve-track', [
        {
          type: 'transitioned',
          from: 'drafting',
          to: 'designing',
          at: new Date('2024-01-01T00:00:00Z'),
          by: actor,
        },
        {
          type: 'transitioned',
          from: 'designing',
          to: 'ready',
          at: new Date('2024-01-01T00:00:00Z'),
          by: actor,
        },
      ])
      change.startImplementationTracking(explicitStart)

      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      const result = await uc.execute({
        name: 'preserve-track',
        to: 'implementing',
      })

      expect(result.change.state).toBe('implementing')
      expect(result.change.isImplementationTrackingActive).toBe(true)
      expect(result.change.implementationTrackingStartedAt).toEqual(explicitStart)
    })
  })

  describe('reconciled verification evidence', () => {
    const evidenceSchema = makeSchema({
      workflow: [
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
        {
          step: 'verifying',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
        {
          step: 'done',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })
    const baseline: ValidityFingerprint = {
      version: 1,
      artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
      implementation: {
        version: 1,
        hashAlgorithm: 'sha256',
        textNormalization: 'text-v1',
        binaryNormalization: 'bytes-v1',
        files: {},
      },
    }
    const openVerdict: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'valid',
      signoff: 'valid',
      verification: 'valid',
      blockers: [],
      recovery: null,
    }

    function observingReconcile(change: Change): ReconcileChangeValidity {
      return {
        execute: async () => ({
          change,
          verdict: openVerdict,
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: null,
          changed: false,
        }),
      } as unknown as ReconcileChangeValidity
    }

    it('does not manufacture verification evidence when entering verifying', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, {
        schema: evidenceSchema,
        reconcile: observingReconcile(change),
      })

      const result = await uc.execute({ name: 'my-change', to: 'verifying' })

      expect(result.change.state).toBe('verifying')
      expect(result.change.verification.activeAttempt).toBeUndefined()
      expect(result.change.verification.completed).toBeUndefined()
      expect(
        result.change.history.some((event) => event.type === 'verification-attempt-started'),
      ).toBe(false)
      expect(result.change.history.some((event) => event.type === 'verification-completed')).toBe(
        false,
      )
    })

    it('preserves spec approval and completed verification on a backward hop', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
      ])
      change.recordSpecApproval(
        'approved',
        makeSpecApprovalFingerprint(change.specIds, baseline.artifacts),
        actor,
      )
      change.startVerification(baseline, actor)
      const completed = change.completeVerification(actor)
      change.recordSignoff('signed', baseline, completed.id, actor)
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, {
        schema: evidenceSchema,
        reconcile: observingReconcile(change),
      })

      const result = await uc.execute({ name: 'my-change', to: 'implementing' })

      expect(result.change.state).toBe('implementing')
      expect(result.change.specApproval?.status).toBe('valid')
      expect(result.change.verification.completed?.id).toBe(completed.id)
      expect(result.change.verification.completed?.status).toBe('valid')
      expect(result.change.verification.activeAttempt).toBeUndefined()
      expect(result.change.signoff?.status).toBe('revoked')
      expect(
        result.change.history.filter((event) => event.type === 'verification-completed'),
      ).toHaveLength(1)
    })

    it('does not complete verification when leaving verifying', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
      ])
      const { attempt } = change.startVerification(baseline, actor)
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo, {
        schema: evidenceSchema,
        reconcile: observingReconcile(change),
      })

      const backward = await uc.execute({ name: 'my-change', to: 'implementing' })
      expect(backward.change.state).toBe('implementing')
      expect(backward.change.verification.activeAttempt?.id).toBe(attempt.id)
      expect(backward.change.verification.completed).toBeUndefined()

      backward.change.transition('verifying', actor)
      const forward = await uc.execute({ name: 'my-change', to: 'done' })
      expect(forward.change.state).toBe('done')
      expect(forward.change.verification.activeAttempt?.id).toBe(attempt.id)
      expect(forward.change.verification.completed).toBeUndefined()
      expect(forward.change.history.some((event) => event.type === 'verification-completed')).toBe(
        false,
      )
    })
  })

  describe('Custom checks, skipChecks validation, and edge cases', () => {
    it('throws UnknownCheckError when an unregistered check is passed to skipChecks', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
          skipChecks: ['@security.nonexistent'],
        }),
      ).rejects.toThrow(UnknownCheckError)
    })

    it('throws CheckNotSkippableError when a non-skippable check is passed to skipChecks', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
          skipChecks: ['protocol.edge'],
        }),
      ).rejects.toThrow(CheckNotSkippableError)
    })

    it('throws CheckNotSkippableError when an effect check (hook) is passed to skipChecks', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
          skipChecks: ['hook.pre'],
        }),
      ).rejects.toThrow(CheckNotSkippableError)
    })

    it('executes a custom registered check and allows transition when it passes', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      const customCheck: CustomCheckDefinition = {
        id: 'code-audit',
        label: 'Code Audit',
        execute: async () => ({
          id: '@security.code-audit',
          label: 'Code Audit',
          kind: 'predicate',
          outcome: 'pass',
        }),
      }
      registry.register('security', customCheck, [
        { scope: 'transition', from: 'designing', to: 'ready', skippable: true },
      ])

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
      })

      expect(result.change.state).toBe('ready')
    })

    it('executes a custom registered check and aborts transition with CheckPredicateFailedError when it fails', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      const customCheck: CustomCheckDefinition = {
        id: 'code-audit',
        label: 'Code Audit',
        execute: async () => ({
          id: '@security.code-audit',
          label: 'Code Audit',
          kind: 'predicate',
          outcome: 'fail',
          code: 'AUDIT_VULNERABILITY_FOUND',
          message: 'Found high severity vulnerability',
          command: 'npm audit fix',
        }),
      }
      registry.register('security', customCheck, [
        { scope: 'transition', from: 'designing', to: 'ready', skippable: true },
      ])

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
        }),
      ).rejects.toThrow(CheckPredicateFailedError)

      try {
        await uc.execute({ name: 'my-change', to: 'ready' })
      } catch (err) {
        expect(err).toBeInstanceOf(CheckPredicateFailedError)
        const checkErr = err as CheckPredicateFailedError
        expect(checkErr.checkId).toBe('@security.code-audit')
        expect(checkErr.label).toBe('Code Audit')
        expect(checkErr.code).toBe('AUDIT_VULNERABILITY_FOUND')
        expect(checkErr.message).toContain('Found high severity vulnerability')
        expect(checkErr.command).toBe('npm audit fix')
      }
    })

    it('bypasses a failing custom check when explicitly supplied in skipChecks', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      const customCheck: CustomCheckDefinition = {
        id: 'code-audit',
        label: 'Code Audit',
        execute: async () => ({
          id: '@security.code-audit',
          label: 'Code Audit',
          kind: 'predicate',
          outcome: 'fail',
          code: 'AUDIT_VULNERABILITY_FOUND',
          message: 'Found high severity vulnerability',
        }),
      }
      registry.register('security', customCheck, [
        { scope: 'transition', from: 'designing', to: 'ready', skippable: true },
      ])

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
        skipChecks: ['@security.code-audit'],
      })

      expect(result.change.state).toBe('ready')
    })

    it('rejects skipping any non-skippable built-in check in skipChecks with CheckNotSkippableError', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      const nonSkippableBuiltinChecks = [
        'protocol.edge',
        'workflow.requires',
        'workflow.taskCompletion',
        'deps.consistent',
        'workspace.readOnly',
        'impl.filesResolved',
        'approval.spec',
        'approval.signoff',
        'verification.current',
        'hook.pre',
        'hook.post',
      ]

      for (const checkId of nonSkippableBuiltinChecks) {
        await expect(
          uc.execute({
            name: 'my-change',
            to: 'ready',
            skipChecks: [checkId],
          }),
        ).rejects.toThrow(CheckNotSkippableError)
      }
    })

    it('rejects skipping a custom check registered with skippable: false', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      registry.register(
        'security',
        {
          id: 'mandatory-audit',
          label: 'Mandatory Security Audit',
          execute: async () => ({
            id: '@security.mandatory-audit',
            label: 'Audit',
            kind: 'predicate',
            outcome: 'pass',
          }),
        },
        [{ scope: 'transition', from: 'designing', to: 'ready', skippable: false }],
      )

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
          skipChecks: ['@security.mandatory-audit'],
        }),
      ).rejects.toThrow(CheckNotSkippableError)
    })

    it('propagates unexpected errors thrown by a custom check and prevents transition', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      registry.register(
        'db',
        {
          id: 'health',
          label: 'Database Health',
          execute: async () => {
            throw new Error('Database connection crashed unexpectedly')
          },
        },
        [{ scope: 'transition', from: 'designing', to: 'ready', skippable: true }],
      )

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
        }),
      ).rejects.toThrow('Database connection crashed unexpectedly')

      // Ensure change remains in 'designing' state, not mutated
      const reloaded = await repo.get('my-change')
      expect(reloaded?.state).toBe('designing')
    })

    it('aborts transition when multiple custom checks run and the second fails', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      registry.register(
        'check',
        {
          id: 'first',
          label: 'First Check',
          execute: async () => ({
            id: '@check.first',
            label: 'First Check',
            kind: 'predicate',
            outcome: 'pass',
          }),
        },
        [{ scope: 'transition', from: 'designing', to: 'ready', skippable: true }],
      )

      registry.register(
        'check',
        {
          id: 'second',
          label: 'Second Check',
          execute: async () => ({
            id: '@check.second',
            label: 'Second Check',
            kind: 'predicate',
            outcome: 'fail',
            code: 'SECOND_CHECK_FAILED',
            message: 'Second check blocked the transition',
          }),
        },
        [{ scope: 'transition', from: 'designing', to: 'ready', skippable: true }],
      )

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'ready',
        }),
      ).rejects.toThrow(CheckPredicateFailedError)

      try {
        await uc.execute({ name: 'my-change', to: 'ready' })
      } catch (err) {
        expect(err).toBeInstanceOf(CheckPredicateFailedError)
        const checkErr = err as CheckPredicateFailedError
        expect(checkErr.checkId).toBe('@check.second')
        expect(checkErr.code).toBe('SECOND_CHECK_FAILED')
      }

      const reloaded = await repo.get('my-change')
      expect(reloaded?.state).toBe('designing')
    })

    it('handles duplicate check IDs in skipChecks cleanly without duplicate execution or errors', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      registry.register(
        'qa',
        {
          id: 'flake',
          label: 'Flaky QA Check',
          execute: async () => ({
            id: '@qa.flake',
            label: 'Flaky QA Check',
            kind: 'predicate',
            outcome: 'fail',
            code: 'FLAKE',
          }),
        },
        [{ scope: 'transition', from: 'designing', to: 'ready', skippable: true }],
      )

      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(repo, { checkRegistry: registry, transitionBindings })

      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
        skipChecks: ['@qa.flake', '@qa.flake', '@qa.flake'],
      })

      expect(result.change.state).toBe('ready')
    })
  })

  describe('shortcut transitions, step-skip checks, and hook suppression', () => {
    it('evaluates step-skip checks when shortcutting over optional implementing', async () => {
      const optionalImplSchema = makeSchema({
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])

      // When incomplete tasks exist, shortcut transition fails fast
      const countTasksWithIncomplete = {
        execute: vi.fn().mockResolvedValue({
          byArtifact: {},
          total: { complete: 1, incomplete: 2, total: 3 },
        }),
      } as unknown as CountTasks

      const ucFailing = makeUseCase(repo, {
        schema: optionalImplSchema,
        countTasks: countTasksWithIncomplete,
      })

      await expect(ucFailing.execute({ name: 'my-change', to: 'verifying' })).rejects.toThrow(
        CheckPredicateFailedError,
      )

      // When tasks are completed, shortcut transition succeeds
      const countTasksEmpty = {
        execute: vi.fn().mockResolvedValue({
          byArtifact: {},
          total: { complete: 3, incomplete: 0, total: 3 },
        }),
      } as unknown as CountTasks

      const ucPassing = makeUseCase(repo, {
        schema: optionalImplSchema,
        countTasks: countTasksEmpty,
      })

      const result = await ucPassing.execute({ name: 'my-change', to: 'verifying' })
      expect(result.change.state).toBe('verifying')
    })

    it('rejects a shortcut when a plugin step-skip default binding fails end to end', async () => {
      const optionalImplSchema = makeSchema({
        workflow: [
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying'),
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(optionalImplSchema)
      const builtins = createWorkflowCheckRegistry({
        countTasks: {
          execute: vi.fn().mockResolvedValue({
            byArtifact: {},
            total: { complete: 1, incomplete: 0, total: 1 },
          }),
        } as unknown as CountTasks,
        runStepHooks: makeRunStepHooks(),
        readyFacts: {
          changes: repo,
          listWorkspaces: makeListWorkspaces(),
          parsers: makeNoopParsers(),
          extractorTransforms: new Map(),
          workspaceRoutes: [],
        },
        detectImplLinksInScope,
      })
      const build = (outcome: 'pass' | 'fail') => {
        const registry = new CheckRegistry()
        registry.register(
          'qa',
          {
            id: 'freeze',
            label: 'Checking code freeze',
            execute: async () => ({
              id: '@qa.freeze',
              label: 'Checking code freeze',
              kind: 'predicate' as const,
              outcome,
              ...(outcome === 'fail' ? { code: 'CODE_FREEZE', message: 'freeze active' } : {}),
            }),
          },
          [{ scope: 'step-skip', step: 'implementing' }],
        )
        return makeUseCase(repo, {
          schema: optionalImplSchema,
          schemaProvider,
          checkRegistry: registry,
          transitionBindings: [
            ...builtins.transitionBindings,
            ...registry.bindings().filter((binding) => binding.check.id.startsWith('@')),
          ],
        })
      }

      const failure = await build('fail')
        .execute({ name: 'my-change', to: 'verifying' })
        .then(() => undefined)
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(CheckPredicateFailedError)
      expect((failure as CheckPredicateFailedError).checkId).toBe('@qa.freeze')
      expect(repo.store.get('my-change')?.state).toBe('ready')

      const result = await build('pass').execute({ name: 'my-change', to: 'verifying' })
      expect(result.change.state).toBe('verifying')
    })

    it('suppresses hook execution for bypassed intermediate steps', async () => {
      const optionalImplSchema = makeSchema({
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', {
            optional: true,
            hooks: {
              pre: [{ id: 'impl-pre', type: 'run', command: 'echo impl-pre' }],
              post: [{ id: 'impl-post', type: 'run', command: 'echo impl-post' }],
            },
          }),
          makeWorkflowStep('verifying', {
            hooks: {
              pre: [{ id: 'verif-pre', type: 'run', command: 'echo verif-pre' }],
              post: [{ id: 'verif-post', type: 'run', command: 'echo verif-post' }],
            },
          }),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const hookExecuteSpy = vi.fn().mockResolvedValue({
        success: true,
        hooks: [],
        failedHooks: [],
        warnings: [],
      })
      const runStepHooks = makeRunStepHooks({ execute: hookExecuteSpy })
      const countTasks = {
        execute: vi.fn().mockResolvedValue({
          byArtifact: {},
          total: { complete: 0, incomplete: 0, total: 0 },
        }),
      } as unknown as CountTasks

      const uc = makeUseCase(repo, {
        schema: optionalImplSchema,
        runStepHooks,
        countTasks,
      })

      const result = await uc.execute({ name: 'my-change', to: 'verifying' })
      expect(result.change.state).toBe('verifying')

      // Verify that hooks for implementing were NEVER executed
      const executedSteps = hookExecuteSpy.mock.calls.map(
        (call) => (call[0] as { step: string }).step,
      )
      expect(executedSteps).not.toContain('implementing')
      // Only verifying hooks were executed
      expect(executedSteps).toContain('verifying')
    })

    it('resolves sovereign schema by change.schemaName', async () => {
      const customSchema = makeSchema({
        name: 'custom-sovereign-schema',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying', { disabled: true }),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })
      const change = new Change({
        name: 'sovereign-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        schemaName: 'custom-sovereign-schema',
        schemaVersion: 1,
        history: [
          {
            type: 'created',
            at: new Date('2024-01-01T00:00:00Z'),
            by: actor,
            specIds: ['auth/login'],
            schemaName: 'custom-sovereign-schema',
            schemaVersion: 1,
          },
          {
            type: 'transitioned',
            from: 'drafting',
            to: 'designing',
            at: new Date(),
            by: actor,
          },
          {
            type: 'transitioned',
            from: 'designing',
            to: 'ready',
            at: new Date(),
            by: actor,
          },
          {
            type: 'transitioned',
            from: 'ready',
            to: 'implementing',
            at: new Date(),
            by: actor,
          },
        ],
      })
      const repo = makeChangeRepository([change])
      const schemaProvider: SchemaProvider = {
        get: vi.fn().mockImplementation(async (ref?: string) => {
          if (ref === 'custom-sovereign-schema') {
            return customSchema
          }
          return makeSchema()
        }),
      }
      const countTasks = {
        execute: vi.fn().mockResolvedValue({
          byArtifact: {},
          total: { complete: 0, incomplete: 0, total: 0 },
        }),
      } as unknown as CountTasks

      const uc = makeUseCase(repo, {
        schemaProvider,
        countTasks,
      })

      // In customSchema, verifying is disabled.
      // Transitioning with to: 'next' from 'implementing' resolves to 'done' directly
      const result = await uc.execute({ name: 'sovereign-change', to: 'next' })
      expect(result.change.state).toBe('done')
      expect(schemaProvider.get).toHaveBeenCalledWith('custom-sovereign-schema')
    })

    it('passes configured approvals to next-step topology resolution', async () => {
      const schema = makeSchema({
        workflow: [makeWorkflowStep('ready', { disabled: true })],
      })
      const change = makeChangeInState('approval-aware-change', [
        {
          type: 'transitioned',
          from: 'drafting',
          to: 'designing',
          at: new Date(),
          by: actor,
        },
      ])
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema,
        approvals: { spec: true, signoff: false },
      })

      await expect(uc.execute({ name: 'approval-aware-change', to: 'next' })).rejects.toThrow(
        SchemaValidationError,
      )
    })
  })

  describe('Declarative schema checks and skipChecks integration', () => {
    it('evaluates custom transition check declared dynamically in schema step.checks', async () => {
      const change = makeChangeInState(
        'my-change',
        [{ type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor }],
        'gate-schema',
      )
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      let executeCount = 0
      registry.register(
        'custom',
        {
          id: 'schema-gate',
          label: 'Schema Gate Check',
          execute: async () => {
            executeCount++
            return {
              id: '@custom.schema-gate',
              label: 'Schema Gate Check',
              kind: 'predicate',
              outcome: 'fail',
              code: 'GATE_FAILED',
              message: 'Custom schema gate failed',
            }
          },
        },
        [],
      )

      const schemaWithGate = makeSchema({
        name: 'gate-schema',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready', {
            checks: [
              {
                id: '@custom.schema-gate',
                onFailure: 'abort',
                skippable: true,
              },
            ],
          }),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })

      const schemaProvider: SchemaProvider = {
        get: vi.fn().mockResolvedValue(schemaWithGate),
      }

      const uc = makeUseCase(repo, {
        schemaProvider,
        checkRegistry: registry,
        transitionBindings: registry.bindings(),
      })

      // When transitioning to ready without skipChecks, fails with CheckPredicateFailedError
      await expect(uc.execute({ name: 'my-change', to: 'ready' })).rejects.toThrow(
        CheckPredicateFailedError,
      )
      expect(executeCount).toBe(1)

      // When transitioning with skipChecks: ['@custom.schema-gate'], succeeds because skippable: true
      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
        skipChecks: ['@custom.schema-gate'],
      })
      expect(result.change.state).toBe('ready')
    })

    it('evaluates custom skipChecks declared in schema when bypassing optional step', async () => {
      const change = makeChangeInState(
        'my-change',
        [
          { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        ],
        'skip-gate-schema',
      )
      const repo = makeChangeRepository([change])
      const registry = new CheckRegistry()
      let skipCheckCalled = false
      registry.register(
        'qa',
        {
          id: 'bypass-gate',
          label: 'Bypass Gate Check',
          execute: async () => {
            skipCheckCalled = true
            return {
              id: '@qa.bypass-gate',
              label: 'Bypass Gate Check',
              kind: 'predicate',
              outcome: 'pass',
              details: {},
            }
          },
        },
        [],
      )

      const runStepHooks = makeRunStepHooks({
        execute: vi.fn().mockResolvedValue({
          hooks: [],
          success: true,
          failedHooks: [],
          warnings: [],
        }),
      })

      const schemaWithSkipGate = makeSchema({
        name: 'skip-gate-schema',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', {
            optional: true,
            skipChecks: [
              {
                id: '@qa.bypass-gate',
                onFailure: 'abort',
              },
            ],
            hooks: {
              pre: [{ id: 'impl-pre', type: 'instruction', text: 'implement' }],
              post: [],
            },
          }),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })

      const countTasks = {
        execute: vi.fn().mockResolvedValue({
          byArtifact: {},
          total: { complete: 0, incomplete: 0, total: 0 },
        }),
      } as unknown as CountTasks

      const uc = makeUseCase(repo, {
        schemaProvider: { get: vi.fn().mockResolvedValue(schemaWithSkipGate) },
        checkRegistry: registry,
        transitionBindings: registry.bindings(),
        countTasks,
        runStepHooks,
      })

      // Shortcut ready -> verifying (bypassing implementing)
      const result = await uc.execute({ name: 'my-change', to: 'verifying' })
      expect(result.change.state).toBe('verifying')
      expect(skipCheckCalled).toBe(true)
      // implementing hooks were suppressed
      expect(runStepHooks.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ step: 'implementing' }),
      )
    })

    it('isolates sovereign schema checks from workspace default schema', async () => {
      const changeCustom = new Change({
        name: 'custom-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth'],
        schemaName: 'schema-custom',
        schemaVersion: 1,
        history: [
          {
            type: 'created',
            at: new Date('2024-01-01T00:00:00Z'),
            by: actor,
            specIds: ['auth'],
            schemaName: 'schema-custom',
            schemaVersion: 1,
          },
          { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        ],
      })

      const changeDefault = new Change({
        name: 'default-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth'],
        schemaName: 'default',
        schemaVersion: 1,
        history: [
          {
            type: 'created',
            at: new Date('2024-01-01T00:00:00Z'),
            by: actor,
            specIds: ['auth'],
            schemaName: 'default',
            schemaVersion: 1,
          },
          { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        ],
      })

      const repo = makeChangeRepository([changeCustom, changeDefault])
      const registry = new CheckRegistry()
      registry.register(
        'custom',
        {
          id: 'strict-audit',
          label: 'Strict Audit',
          execute: async () => ({
            id: '@custom.strict-audit',
            label: 'Strict Audit',
            kind: 'predicate',
            outcome: 'fail',
            code: 'AUDIT_FAILED',
            message: 'Strict audit failed',
          }),
        },
        [],
      )

      const customSchema = makeSchema({
        name: 'schema-custom',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready', {
            checks: [{ id: '@custom.strict-audit', onFailure: 'abort' }],
          }),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })

      const defaultSchema = makeSchema({
        name: 'default',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })

      const schemaProvider: SchemaProvider = {
        get: vi.fn().mockImplementation(async (ref?: string) => {
          if (ref === 'schema-custom') return customSchema
          return defaultSchema
        }),
      }

      const uc = makeUseCase(repo, {
        schemaProvider,
        checkRegistry: registry,
        transitionBindings: registry.bindings(),
      })

      // custom change must evaluate custom schema checks and fail
      await expect(uc.execute({ name: 'custom-change', to: 'ready' })).rejects.toThrow(
        CheckPredicateFailedError,
      )

      // default change does not declare custom checks and must succeed
      const result = await uc.execute({ name: 'default-change', to: 'ready' })
      expect(result.change.state).toBe('ready')
    })
  })

  describe('collect failure aggregation', () => {
    function auditCheck(name: string, code: string) {
      return {
        id: name,
        label: `Auditing ${name}`,
        execute: async () => ({
          id: `@custom.${name}`,
          label: `Auditing ${name}`,
          kind: 'predicate' as const,
          outcome: 'fail' as const,
          code,
          message: `${name} failed`,
        }),
      }
    }

    function setup(onFailure: 'abort' | 'collect') {
      const change = new Change({
        name: 'collect-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth'],
        schemaName: 'schema-custom',
        schemaVersion: 1,
        history: [
          {
            type: 'created',
            at: new Date('2024-01-01T00:00:00Z'),
            by: actor,
            specIds: ['auth'],
            schemaName: 'schema-custom',
            schemaVersion: 1,
          },
          { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        ],
      })
      const registry = new CheckRegistry()
      registry.register('custom', auditCheck('first', 'FIRST_FAILED'), [])
      registry.register('custom', auditCheck('second', 'SECOND_FAILED'), [])
      const schema = makeSchema({
        name: 'schema-custom',
        workflow: [
          makeWorkflowStep('drafting'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('ready', {
            checks: [
              { id: '@custom.first', onFailure },
              { id: '@custom.second', onFailure },
            ],
          }),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
          makeWorkflowStep('archivable'),
          makeWorkflowStep('archiving'),
        ],
      })
      const schemaProvider: SchemaProvider = { get: vi.fn().mockResolvedValue(schema) }
      return makeUseCase(makeChangeRepository([change]), {
        schemaProvider,
        checkRegistry: registry,
        transitionBindings: registry.bindings(),
      })
    }

    it('throws one error for the first collected failure listing every collected failure', async () => {
      const error = await setup('collect')
        .execute({ name: 'collect-change', to: 'ready' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('@custom.first')
      expect(failure.details?.failures).toEqual([
        expect.objectContaining({ checkId: '@custom.first', code: 'FIRST_FAILED' }),
        expect.objectContaining({ checkId: '@custom.second', code: 'SECOND_FAILED' }),
      ])
    })

    it('keeps abort failures mapped to the first failing check', async () => {
      const error = await setup('abort')
        .execute({ name: 'collect-change', to: 'ready' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      expect((error as CheckPredicateFailedError).checkId).toBe('@custom.first')
      expect((error as CheckPredicateFailedError).details?.failures).toBeUndefined()
    })
  })

  describe('freshness and effects ownership', () => {
    it('reevaluates shared candidate and rejects transition when facts change to fail after status projection', async () => {
      const at = new Date('2024-01-01T00:00:00Z')
      const change = makeChangeInState('stale-candidate-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
      ])
      const repo = makeChangeRepository([change])

      const schema = makeSchema(
        [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: {
              incompletePattern: '^\\s*-\\s*\\[ \\]\\s+',
              completePattern: '^\\s*-\\s*\\[x\\]\\s+',
            },
          }),
        ],
        [
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying'),
          makeWorkflowStep('done'),
        ],
      )

      const tasksArtifact = new ChangeArtifact({ type: 'tasks' })
      tasksArtifact.setFile(
        new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'complete' }),
      )
      change.setArtifact(tasksArtifact)
      vi.spyOn(repo, 'artifact').mockResolvedValue(
        new SpecArtifact('tasks.md', '# Tasks\n- [ ] 1.1 Incomplete Task'),
      )

      const runHooksSpy = vi.fn().mockResolvedValue({
        success: true,
        hooks: [],
        failedHooks: [],
        warnings: [],
      })
      const runStepHooks = makeRunStepHooks({ execute: runHooksSpy })
      const mutateSpy = vi.spyOn(repo, 'mutate')

      const uc = makeUseCase(repo, {
        schema,
        runStepHooks,
      })

      await expect(uc.execute({ name: 'stale-candidate-change', to: 'verifying' })).rejects.toThrow(
        CheckPredicateFailedError,
      )

      expect(runHooksSpy).not.toHaveBeenCalled()
      expect(mutateSpy).not.toHaveBeenCalled()
      expect(change.state).toBe('ready')
    })

    it('executes effects and hooks only after candidate passes complete verdict', async () => {
      const at = new Date('2024-01-01T00:00:00Z')
      const change = makeChangeInState('passing-candidate-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
      ])
      const repo = makeChangeRepository([change])

      const schema = makeSchema(
        [
          makeArtifactType('tasks', {
            hasTasks: true,
            taskCompletionCheck: {
              incompletePattern: '^\\s*-\\s*\\[ \\]\\s+',
              completePattern: '^\\s*-\\s*\\[x\\]\\s+',
            },
          }),
        ],
        [
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying', {
            hooks: {
              pre: [{ id: 'pre-verify', type: 'run', command: 'echo pre' }],
              post: [],
            },
          }),
          makeWorkflowStep('done'),
        ],
      )

      const tasksArtifact = new ChangeArtifact({ type: 'tasks' })
      tasksArtifact.setFile(
        new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'complete' }),
      )
      change.setArtifact(tasksArtifact)
      vi.spyOn(repo, 'artifact').mockResolvedValue(
        new SpecArtifact('tasks.md', '# Tasks\n- [x] 1.1 Completed Task'),
      )

      const runHooksSpy = vi.fn().mockResolvedValue({
        success: true,
        hooks: [],
        failedHooks: [],
        warnings: [],
      })
      const runStepHooks = makeRunStepHooks({ execute: runHooksSpy })
      const mutateSpy = vi.spyOn(repo, 'mutate')

      const uc = makeUseCase(repo, {
        schema,
        runStepHooks,
      })

      const result = await uc.execute({ name: 'passing-candidate-change', to: 'verifying' })

      expect(result.change.state).toBe('verifying')
      expect(runHooksSpy).toHaveBeenCalled()
      expect(mutateSpy).toHaveBeenCalled()
    })
  })
})
