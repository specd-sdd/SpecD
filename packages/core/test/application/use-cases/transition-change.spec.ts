import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type TransitionProgressEvent } from '../../../src/application/use-cases/transition-change.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { HappyPathNextUnavailableError } from '../../../src/domain/errors/happy-path-next-unavailable-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import { ArchiveImplementationStateError } from '../../../src/domain/errors/archive-implementation-state-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { Logger } from '../../../src/application/logger.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
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
  testActor,
} from './helpers.js'

function makeChangeInState(name: string, events: ChangeEvent[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: actor,
        specIds: ['auth/login'],
        schemaName: '@specd/schema-std',
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
    runStepHooks?: ReturnType<typeof makeRunStepHooks>
    refresh?: RefreshImplementationTracking
    refreshExecute?: ReturnType<typeof vi.fn>
    approvals?: { spec: boolean; signoff: boolean }
    countTasks?: CountTasks
  },
): TransitionChange {
  const refresh =
    overrides?.refresh ??
    makeRefreshImplementationTracking(
      overrides?.refreshExecute ?? vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    )
  const schemaProvider = makeSchemaProvider(
    overrides?.schema !== undefined ? overrides.schema : makeSchema(),
  )
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
    registry.transitionBindings,
  )
}

describe('TransitionChange', () => {
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

    it('skips refresh when explicitly disabled', async () => {
      const change = makeChangeInState('my-change', [])
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({
        name: 'my-change',
        to: 'designing',
        refreshImplementationTrackingBefore: false,
      })

      expect(refreshExecute).not.toHaveBeenCalled()
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
      change.recordSpecApproval('ok', {}, actor)
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
          return { hooks: [], success: true, failedHooks: [] }
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
            }
          }
          return { hooks: [], success: true, failedHooks: [] }
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
            }
          }
          return { hooks: [], success: true, failedHooks: [] }
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
            }
          }
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
            }
          }
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
          return { hooks: [], success: true, failedHooks: [] }
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
      const executeSpy = vi.fn().mockResolvedValue({ hooks: [], success: true, failedHooks: [] })
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

    it('invalidates approvals when transitioning to designing with active spec approval', async () => {
      const change = makeImplementingChangeWithApproval('my-change')
      expect(change.activeSpecApproval).toBeDefined()

      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.activeSpecApproval).toBeUndefined()
    })

    it('invalidates to mark artifacts for review when transitioning to designing', async () => {
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

      expect(invalidateSpy).toHaveBeenCalledTimes(1)
      expect(invalidateSpy).toHaveBeenCalledWith(
        'artifact-review-required',
        expect.anything(),
        'Invalidated because the change returned to designing and all artifacts require review.',
        expect.any(Array),
        expect.anything(),
      )
    })

    it('does not call transition after invalidate when returning to designing', async () => {
      const change = makeImplementingChange('my-change')
      const transitionSpy = vi.spyOn(change, 'transition')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(transitionSpy).not.toHaveBeenCalled()
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
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
      expect(invalidateSpy).not.toHaveBeenCalled()
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
        execute: vi.fn().mockResolvedValue({ hooks: [], success: true, failedHooks: [] }),
      })
      const uc = makeUseCase(makeChangeRepository([change]), { runStepHooks: hooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
      })

      expect(result.change.state).toBe('archivable')
      expect(hooks.execute).not.toHaveBeenCalled()
    })

    it('transitions from archiving to designing and downgrades artifacts', async () => {
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
      expect(result.change.getArtifact('proposal')?.files.get('proposal')?.status).toBe(
        'pending-review',
      )
    })
  })

  describe('given shared predicate evaluation', () => {
    it('does not CountTasks a second time after a green evaluate', async () => {
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
      )

      await uc.execute({ name: 'my-change', to: 'verifying' })

      expect(executeSpy).toHaveBeenCalledOnce()
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
      const executeSpy = vi.fn().mockResolvedValue({ hooks: [], success: true, failedHooks: [] })
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
      change.recordSpecApproval('spec ok', {}, actor)
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
      )

      await expect(uc.execute({ name: 'my-change', to: 'ready' })).rejects.toThrow(
        ReadOnlyWorkspaceError,
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
        ArchiveImplementationStateError,
      )
    })

    it('skips impl.linksInScope when allowOutOfScope is true', async () => {
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
        allowOutOfScope: true,
      })

      expect(result.change.state).toBe('verifying')
    })

    it('still fails open tracked files when allowOutOfScope is true', async () => {
      const change = makeImplementingChange('my-change')
      change.trackImplementationFile('packages/core/src/foo.ts', 'open')
      const uc = makeUseCase(makeChangeRepository([change]), { schema: verifyingSchema })

      await expect(
        uc.execute({ name: 'my-change', to: 'verifying', allowOutOfScope: true }),
      ).rejects.toThrow(ArchiveImplementationStateError)
    })

    it('fails impl.linksInScope without allowOutOfScope', async () => {
      const change = makeImplementingChange('my-change')
      change.addImplementationLink({
        specId: 'auth/shared',
        file: 'src/shared.ts',
        fileLinkExplicit: true,
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: verifyingSchema })

      await expect(uc.execute({ name: 'my-change', to: 'verifying' })).rejects.toThrow(
        ArchiveImplementationStateError,
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
        allowOutOfScope: true,
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
})
