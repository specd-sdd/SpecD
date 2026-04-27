import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { type TransitionProgressEvent } from '../../../src/application/use-cases/transition-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeRunStepHooks,
  testActor,
} from './helpers.js'

function makeChangeInState(name: string, events: ChangeEvent[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history: events,
  })
}

const actor = testActor

/** Creates a TransitionChange with all required deps (schema + hooks are no-ops by default). */
function makeUseCase(
  repo: ReturnType<typeof makeChangeRepository>,
  overrides?: {
    schema?: ReturnType<typeof makeSchema> | null
    runStepHooks?: ReturnType<typeof makeRunStepHooks>
  },
): TransitionChange {
  return new TransitionChange(
    repo,
    makeActorResolver(),
    makeSchemaProvider(overrides?.schema !== undefined ? overrides.schema : makeSchema()),
    overrides?.runStepHooks ?? makeRunStepHooks(),
  )
}

describe('TransitionChange', () => {
  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = makeUseCase(makeChangeRepository())

      await expect(
        uc.execute({
          name: 'missing',
          to: 'designing',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given a change in drafting state', () => {
    it('transitions to designing', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('implementing')
    })

    it('routes ready → pending-spec-approval when approvalsSpec is true', async () => {
      const change = makeReadyChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: true,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('pending-spec-approval')
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
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('archivable')
    })

    it('routes done → pending-signoff when approvalsSignoff is true', async () => {
      const change = makeDoneChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
        approvalsSpec: false,
        approvalsSignoff: true,
      })

      expect(result.change.state).toBe('pending-signoff')
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

    it('throws approval-required reason for pending spec approval', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'spec-approved',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'spec' },
      })
    })

    it('throws approval-required reason for pending signoff', async () => {
      const change = makePendingSignoffChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'signed-off',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toMatchObject({
        reason: { type: 'approval-required', gate: 'signoff' },
      })
    })

    it('still allows redesign from pending spec approval', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('verifying')
      expect(artifactSpy).not.toHaveBeenCalled()
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
        uc.execute(
          { name: 'my-change', to: 'verifying', approvalsSpec: false, approvalsSignoff: false },
          (evt) => events.push(evt),
        ),
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
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
            approvalsSpec: false,
            approvalsSignoff: false,
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
              failedHook: {
                id: 'lint',
                command: 'pnpm lint',
                exitCode: 1,
                stdout: '',
                stderr: 'err',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
          approvalsSpec: false,
          approvalsSignoff: false,
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
              failedHook: {
                id: 'lint',
                command: 'pnpm lint',
                exitCode: 1,
                stdout: '',
                stderr: 'err',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(repo, { schema: hookSchema, runStepHooks })

      await uc
        .execute({
          name: 'my-change',
          to: 'implementing',
          approvalsSpec: false,
          approvalsSignoff: false,
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
              failedHook: {
                id: 'lint',
                command: 'pnpm lint',
                exitCode: 1,
                stdout: '',
                stderr: 'err',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc
        .execute({
          name: 'my-change',
          to: 'implementing',
          approvalsSpec: false,
          approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
          return { hooks: [], success: true, failedHook: null }
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
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
              failedHook: {
                id: 'test',
                command: 'pnpm test',
                exitCode: 1,
                stdout: '',
                stderr: 'fail',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toThrow(HookFailedError)
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
        skipHookPhases: new Set(['target.pre']),
      })

      expect(calls).toEqual([{ step: 'implementing', phase: 'post' }])
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        schema: implementingSchema,
        runStepHooks,
      })

      await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
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
          approvalsSpec: false,
          approvalsSignoff: false,
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'transitioned',
        from: 'drafting',
        to: 'designing',
      })
    })

    it('emits hook-start and hook-done progress events with phase:pre', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'pre') {
            onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
            onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'implementing',
          approvalsSpec: false,
          approvalsSignoff: false,
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'hook-start',
        phase: 'pre',
        hookId: 'lint',
        command: 'pnpm lint',
      })
      expect(events).toContainEqual({
        type: 'hook-done',
        phase: 'pre',
        hookId: 'lint',
        success: true,
        exitCode: 0,
      })
    })

    it('emits hook-start and hook-done progress events with phase:post', async () => {
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: postSchema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'verifying',
          approvalsSpec: false,
          approvalsSignoff: false,
        },
        (evt) => events.push(evt),
      )

      expect(events).toContainEqual({
        type: 'hook-start',
        phase: 'post',
        hookId: 'notify',
        command: 'notify-slack',
      })
      expect(events).toContainEqual({
        type: 'hook-done',
        phase: 'post',
        hookId: 'notify',
        success: true,
        exitCode: 0,
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
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema, runStepHooks })

      const events: TransitionProgressEvent[] = []
      await uc.execute(
        {
          name: 'my-change',
          to: 'verifying',
          approvalsSpec: false,
          approvalsSignoff: false,
        },
        (evt) => events.push(evt),
      )

      const types = events.map((e) => {
        if (e.type === 'hook-start' || e.type === 'hook-done') return `${e.type}(${e.phase})`
        return e.type
      })
      expect(types).toEqual([
        'hook-start(post)',
        'hook-done(post)',
        'hook-start(pre)',
        'hook-done(pre)',
        'transitioned',
      ])
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
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toThrow()
    })

    it('skips requires and hooks when schema has no workflow step for target', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const executeSpy = vi.fn().mockResolvedValue({ hooks: [], success: true, failedHook: null })
      const runStepHooks = makeRunStepHooks({ execute: executeSpy })
      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase(makeChangeRepository([change]), { schema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('designing')
    })

    it('transitions from implementing to designing', async () => {
      const change = makeImplementingChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.activeSpecApproval).toBeUndefined()
    })

    it('does not invalidate when transitioning to designing without active approvals', async () => {
      const change = makeImplementingChange('my-change')
      expect(change.activeSpecApproval).toBeUndefined()
      expect(change.activeSignoff).toBeUndefined()

      const invalidateSpy = vi.spyOn(change, 'invalidate')
      const repo = makeChangeRepository([change])
      const uc = makeUseCase(repo)

      await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('does not trigger invalidation for drafting to designing', async () => {
      const change = makeChangeInState('my-change', [])
      expect(change.state).toBe('drafting')

      const invalidateSpy = vi.spyOn(change, 'invalidate')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
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
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('designing')
      expect(result.change.activeSpecApproval).toBeDefined()
    })
  })
})
