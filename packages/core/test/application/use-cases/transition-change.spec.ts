import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { type TransitionProgressEvent } from '../../../src/application/use-cases/transition-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaRegistry,
  makeSchema,
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
    makeSchemaRegistry(overrides?.schema ?? null),
    overrides?.runStepHooks ?? makeRunStepHooks(),
    'test-ref',
    new Map(),
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

    it('returns empty postHookFailures on success', async () => {
      const change = makeChangeInState('my-change', [])
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.postHookFailures).toEqual([])
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

  describe('given a verifying → implementing transition', () => {
    function makeVerifyingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
      ])
    }

    it('clears validatedHash for artifacts listed in implementingRequires', async () => {
      const change = makeVerifyingChange('my-change')
      const spec = new ChangeArtifact({ type: 'spec', filename: 'spec.md' })
      spec.markComplete('sha256:abc')
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:def')
      change.setArtifact(spec)
      change.setArtifact(tasks)

      const uc = makeUseCase(makeChangeRepository([change]))

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
        implementingRequires: ['spec'],
      })

      expect(spec.validatedHash).toBeUndefined()
      expect(spec.status).toBe('in-progress')
      expect(tasks.validatedHash).toBe('sha256:def')
      expect(tasks.status).toBe('complete')
    })

    it('does not clear hashes when implementingRequires is absent', async () => {
      const change = makeVerifyingChange('my-change')
      const spec = new ChangeArtifact({ type: 'spec', filename: 'spec.md' })
      spec.markComplete('sha256:abc')
      change.setArtifact(spec)

      const uc = makeUseCase(makeChangeRepository([change]))

      await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(spec.validatedHash).toBe('sha256:abc')
    })
  })

  describe('given an implementing → verifying transition with task checks', () => {
    function makeImplementingChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
      ])
    }

    it('blocks transition when an artifact has incomplete task items', async () => {
      const change = makeImplementingChange('my-change')
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [ ] unfinished task\n- [x] done task')
        }
        return null
      }
      const uc = makeUseCase(repo)

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'verifying',
          approvalsSpec: false,
          approvalsSignoff: false,
          implementingTaskChecks: [
            { artifactId: 'tasks', filename: 'tasks.md', incompletePattern: '^\\s*-\\s+\\[ \\]' },
          ],
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })

    it('allows transition when all tasks are complete', async () => {
      const change = makeImplementingChange('my-change')
      const repo = makeChangeRepository([change])
      repo.artifact = async (_c, filename) => {
        if (filename === 'tasks.md') {
          return new SpecArtifact('tasks.md', '- [x] done task\n- [x] another done')
        }
        return null
      }
      const uc = makeUseCase(repo)

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
        implementingTaskChecks: [
          { artifactId: 'tasks', filename: 'tasks.md', incompletePattern: '^\\s*-\\s+\\[ \\]' },
        ],
      })

      expect(result.change.state).toBe('verifying')
    })

    it('allows transition when artifact file is absent', async () => {
      const change = makeImplementingChange('my-change')
      const repo = makeChangeRepository([change])
      repo.artifact = async () => null
      const uc = makeUseCase(repo)

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
        implementingTaskChecks: [
          { artifactId: 'tasks', filename: 'tasks.md', incompletePattern: '^\\s*-\\s+\\[ \\]' },
        ],
      })

      expect(result.change.state).toBe('verifying')
    })

    it('allows transition when no task checks provided', async () => {
      const change = makeImplementingChange('my-change')
      const uc = makeUseCase(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        to: 'verifying',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('verifying')
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
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
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

    it('allows transition when all required artifacts are complete', async () => {
      const change = makeReadyChange('my-change')
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
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
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md', optional: true })
      tasks.markSkipped()
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
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
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
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
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:abc')
      change.setArtifact(tasks)
      // 'spec' artifact is NOT set → effectiveStatus('spec') is 'missing'

      const schema = makeSchema({
        workflow: [
          { step: 'implementing', requires: ['tasks', 'spec'], hooks: { pre: [], post: [] } },
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
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
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
      workflow: [{ step: 'implementing', requires: [], hooks: { pre: [], post: [] } }],
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

      expect(calls).toEqual([
        { name: 'my-change', step: 'implementing', phase: 'pre' },
        { name: 'my-change', step: 'implementing', phase: 'post' },
      ])
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

    it('collects post-hook failures without rollback', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'notify',
                  command: 'notify',
                  exitCode: 1,
                  stdout: '',
                  stderr: '',
                  success: false,
                },
              ],
              success: false,
              failedHook: null,
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('implementing')
      expect(result.postHookFailures).toEqual(['notify'])
    })

    it('collects multiple post-hook failures', async () => {
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input) => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'notify',
                  command: 'notify',
                  exitCode: 1,
                  stdout: '',
                  stderr: '',
                  success: false,
                },
                {
                  id: 'deploy',
                  command: 'deploy',
                  exitCode: 2,
                  stdout: '',
                  stderr: '',
                  success: false,
                },
              ],
              success: false,
              failedHook: null,
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('implementing')
      expect(result.postHookFailures).toEqual(['notify', 'deploy'])
    })

    it('skips hooks when skipHooks is true even with workflow step', async () => {
      const change = makeReadyChange('my-change')
      const executeSpy = vi.fn()
      const runStepHooks = makeRunStepHooks({ execute: executeSpy })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: hookSchema, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
        skipHooks: true,
      })

      expect(executeSpy).not.toHaveBeenCalled()
      expect(result.change.state).toBe('implementing')
      expect(result.postHookFailures).toEqual([])
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
      const change = makeReadyChange('my-change')
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'post') {
            onProgress?.({ type: 'hook-start', hookId: 'notify', command: 'notify-slack' })
            onProgress?.({ type: 'hook-done', hookId: 'notify', success: true, exitCode: 0 })
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

    it('emits all events in correct order', async () => {
      const change = makeReadyChange('my-change')
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:abc')
      change.setArtifact(tasks)

      const schema = makeSchema({
        workflow: [{ step: 'implementing', requires: ['tasks'], hooks: { pre: [], post: [] } }],
      })
      const runStepHooks = makeRunStepHooks({
        execute: async (input, onProgress) => {
          if (input.phase === 'pre') {
            onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
            onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
          }
          if (input.phase === 'post') {
            onProgress?.({ type: 'hook-start', hookId: 'notify', command: 'notify-slack' })
            onProgress?.({ type: 'hook-done', hookId: 'notify', success: true, exitCode: 0 })
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema, runStepHooks })

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

      const types = events.map((e) => {
        if (e.type === 'hook-start' || e.type === 'hook-done') return `${e.type}(${e.phase})`
        return e.type
      })
      expect(types).toEqual([
        'requires-check',
        'hook-start(pre)',
        'hook-done(pre)',
        'transitioned',
        'hook-start(post)',
        'hook-done(post)',
      ])
    })
  })

  describe('schema resolution edge cases', () => {
    it('skips requires and hooks when schema cannot be resolved', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
      const executeSpy = vi.fn().mockResolvedValue({ hooks: [], success: true, failedHook: null })
      const runStepHooks = makeRunStepHooks({ execute: executeSpy })
      const uc = makeUseCase(makeChangeRepository([change]), { schema: null, runStepHooks })

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.change.state).toBe('implementing')
      // No workflow step → hooks are NOT called
      expect(executeSpy).not.toHaveBeenCalled()
      expect(result.postHookFailures).toEqual([])
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
      expect(result.postHookFailures).toEqual([])
    })
  })
})
