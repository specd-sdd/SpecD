import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { CheckPredicateFailedError } from '../../../src/domain/errors/check-predicate-failed-error.js'
import {
  CheckNotSkippableError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeRunStepHooks,
  makeWorkflowStep,
  makeListWorkspaces,
  makeNoopParsers,
  makeObservingReconcile,
  makeContentHasher,
  testActor,
} from './helpers.js'

const actor = testActor

function hop(from: string, to: string): ChangeEvent {
  return { type: 'transitioned', from, to, at: new Date(), by: actor } as ChangeEvent
}

function makeChangeInState(name: string, events: ChangeEvent[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: actor,
        specIds: ['auth/login'],
        schemaName: 'test-schema',
        schemaVersion: 1,
      },
      ...events,
    ],
  })
}

function implementing(name: string): Change {
  return makeChangeInState(name, [
    hop('drafting', 'designing'),
    hop('designing', 'ready'),
    hop('ready', 'implementing'),
  ])
}

function verifying(name: string): Change {
  return makeChangeInState(name, [
    hop('drafting', 'designing'),
    hop('designing', 'ready'),
    hop('ready', 'implementing'),
    hop('implementing', 'verifying'),
  ])
}

const openVerdict: ChangeValidityVerdict = {
  artifactReviewRequired: false,
  affectedArtifacts: [],
  projectionChanges: [],
  specApproval: 'not-required',
  signoff: 'not-required',
  verification: 'valid',
  blockers: [],
  recovery: null,
}

function makeUseCase(
  repo: ReturnType<typeof makeChangeRepository>,
  opts: {
    schema?: ReturnType<typeof makeSchema>
    reconcile?: ReconcileChangeValidity
    runStepHooks?: ReturnType<typeof makeRunStepHooks>
    countTasks?: CountTasks
    refreshExecute?: ReturnType<typeof vi.fn>
  } = {},
): TransitionChange {
  const refresh = {
    execute: opts.refreshExecute ?? vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
  const schemaProvider = makeSchemaProvider(opts.schema ?? makeSchema())
  const registry = createWorkflowCheckRegistry({
    countTasks: opts.countTasks ?? new CountTasks(repo, schemaProvider),
    runStepHooks: opts.runStepHooks ?? makeRunStepHooks(),
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
    { spec: false, signoff: false },
    registry.transitionBindings,
    opts.reconcile ?? makeObservingReconcile(repo, undefined, refresh),
  )
}

const verifyingSchema = makeSchema({
  workflow: [
    makeWorkflowStep('implementing'),
    makeWorkflowStep('verifying'),
    makeWorkflowStep('done'),
  ],
})

describe('TransitionChange audit 2', () => {
  describe('exit from implementing after hooks', () => {
    it('rejects the exit when a hook leaves an open tracked file and does not persist', async () => {
      const change = implementing('hooked')
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks({
        execute: vi.fn().mockImplementation(async () => {
          // Hook side effect: the stored change now carries open implementation evidence.
          const stored = repo.store.get('hooked')!
          stored.trackImplementationFile('packages/core/src/from-hook.ts', 'open')
          return { success: true, hooks: [], failedHooks: [], warnings: [] }
        }),
      })
      const uc = makeUseCase(repo, { schema: verifyingSchema, runStepHooks })

      const error = await uc.execute({ name: 'hooked', to: 'verifying' }).catch((e: unknown) => e)

      expect(runStepHooks.execute).toHaveBeenCalled()
      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('impl.filesResolved')
      expect(failure.details).toMatchObject({ files: ['packages/core/src/from-hook.ts'] })
      expect(repo.store.get('hooked')!.state).toBe('implementing')
    })

    it('lets the exit through when hooks leave the evidence untouched', async () => {
      const change = implementing('clean-hook')
      const repo = makeChangeRepository([change])
      const runStepHooks = makeRunStepHooks()
      const uc = makeUseCase(repo, { schema: verifyingSchema, runStepHooks })

      const result = await uc.execute({ name: 'clean-hook', to: 'verifying' })

      expect(result.change.state).toBe('verifying')
    })
  })

  describe('missing verification verdict', () => {
    it('fails verification.current with VERIFICATION_VALIDITY_UNAVAILABLE when the reconciler yields no verdict', async () => {
      const change = verifying('no-verdict')
      const repo = makeChangeRepository([change])
      const reconcile = {
        execute: async () => ({
          change,
          verdict: undefined,
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: null,
          changed: false,
        }),
      } as unknown as ReconcileChangeValidity
      const uc = makeUseCase(repo, { schema: verifyingSchema, reconcile })

      const error = await uc.execute({ name: 'no-verdict', to: 'done' }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('verification.current')
      expect(failure.code).toBe('VERIFICATION_VALIDITY_UNAVAILABLE')
      expect(change.state).toBe('verifying')
    })

    it('reports VERIFICATION_REQUIRED when the verdict says verification is absent', async () => {
      const change = verifying('absent')
      const repo = makeChangeRepository([change])
      const reconcile = makeObservingReconcile(repo, { ...openVerdict, verification: 'absent' })
      const uc = makeUseCase(repo, { schema: verifyingSchema, reconcile })

      await expect(uc.execute({ name: 'absent', to: 'done' })).rejects.toMatchObject({
        checkId: 'verification.current',
        code: 'VERIFICATION_REQUIRED',
      })
    })
  })

  describe('readiness check dedup', () => {
    it('counts tasks once per evaluation pass even though several checks need the counts', async () => {
      const change = makeChangeInState('dedup', [hop('drafting', 'designing')])
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(makeSchema())
      const countTasks = new CountTasks(repo, schemaProvider)
      const spy = vi.spyOn(countTasks, 'execute')
      const uc = makeUseCase(repo, { countTasks })

      await uc.execute({ name: 'dedup', to: 'ready' })

      // Pass 1 (pre-hook) and pass 2 (post-hook re-check) each own one memo.
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
    })

    it('emits each check at most once per evaluation in progress events', async () => {
      const change = makeChangeInState('dedup-events', [hop('drafting', 'designing')])
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)
      const seen: string[] = []

      await uc.execute({ name: 'dedup-events', to: 'ready' }, (event) => {
        if (event.type === 'check-start') seen.push((event as { id?: string }).id ?? '')
      })

      const readiness = ['deps.consistent', 'workspace.readOnly']
      for (const id of readiness) {
        // One occurrence per pass (pre + post re-check), never more.
        const count = seen.filter((s) => s === id).length
        expect(count).toBeGreaterThanOrEqual(1)
        expect(count).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('missing reconciler', () => {
    it('TransitionChange fails explicitly at construction', () => {
      const repo = makeChangeRepository()
      const schemaProvider = makeSchemaProvider(makeSchema())
      const refresh = { execute: vi.fn() } as unknown as RefreshImplementationTracking
      expect(
        () =>
          new TransitionChange(
            repo,
            makeActorResolver(),
            schemaProvider,
            refresh,
            { spec: false, signoff: false },
            [],
          ),
      ).toThrow(InvalidCompositionFactoryArgumentsError)
    })

    it('InvalidateChange without a reconciler fails when executed and leaves the change untouched', async () => {
      const change = implementing('inv')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        undefined as unknown as ReconcileChangeValidity,
      )

      await expect(
        uc.execute({ name: 'inv', reason: 'x', target: 'design' } as never),
      ).rejects.toThrow()
      expect(repo.store.get('inv')!.state).toBe('implementing')
    })

    it('ApproveSpec without a reconciler fails when executed and records no approval', async () => {
      const change = makeChangeInState('appr', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
        hop('ready', 'pending-spec-approval'),
      ])
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(makeSchema())
      const fingerprint = new ValidityFingerprintService({
        changes: repo,
        hasher: makeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      })
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        schemaProvider,
        { spec: true, signoff: false },
        undefined as unknown as ReconcileChangeValidity,
        fingerprint,
      )

      await expect(uc.execute({ name: 'appr', reason: 'ok' })).rejects.toThrow()
      expect(repo.store.get('appr')!.specApproval).toBeUndefined()
    })
  })

  describe('designing to designing no-op', () => {
    function designing(name: string): Change {
      return makeChangeInState(name, [hop('drafting', 'designing')])
    }

    it('rejects an unknown skipChecks id instead of silently ignoring it', async () => {
      const repo = makeChangeRepository([designing('noop')])
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({ name: 'noop', to: 'designing', skipChecks: ['@acme/bogus.check'] }),
      ).rejects.toThrow(UnknownCheckError)
    })

    it('rejects a non-skippable check in skipChecks on the designing to designing path', async () => {
      const repo = makeChangeRepository([designing('noop-locked')])
      const mutate = vi.spyOn(repo, 'mutate')
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({ name: 'noop-locked', to: 'designing', skipChecks: ['hook.pre'] }),
      ).rejects.toThrow(CheckNotSkippableError)
      expect(mutate).not.toHaveBeenCalled()
    })

    it('still returns the unchanged change when the bypass list is empty or valid', async () => {
      const repo = makeChangeRepository([designing('noop-ok')])
      const mutate = vi.spyOn(repo, 'mutate')
      const uc = makeUseCase(repo)

      const result = await uc.execute({ name: 'noop-ok', to: 'designing', skipChecks: [] })

      expect(result.change.state).toBe('designing')
      expect(mutate).not.toHaveBeenCalled()
    })
  })
})
