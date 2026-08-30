import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import * as lifecycleEvaluation from '../../../src/application/services/lifecycle-evaluation.js'
import {
  fail,
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
  makeWorkflowStep,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  testActor,
} from './helpers.js'

const defaultApprovals = { spec: false, signoff: false }

/**
 * Creates a standard test schema.
 * @returns A Schema entity.
 */
function makeStdSchema(): Schema {
  return makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('specs', { scope: 'spec' }),
    makeArtifactType('verify', { scope: 'spec', requires: ['specs'] }),
  ])
}

function makeRefreshImplementationTracking(
  execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
): RefreshImplementationTracking {
  return { execute } as unknown as RefreshImplementationTracking
}

function makeGetStatus(
  changes: ReturnType<typeof makeChangeRepository>,
  opts: {
    schema?: Schema | null
    approvals?: { spec: boolean; signoff: boolean }
    failSchema?: boolean
    refresh?: RefreshImplementationTracking
    refreshExecute?: ReturnType<typeof vi.fn>
    countTasks?: CountTasks
    transitionBindings?: import('../../../src/domain/services/transition-checks.js').CheckBinding[]
    archiveBindings?: import('../../../src/domain/services/transition-checks.js').CheckBinding[]
    detectSpecOverlap?: (
      change: Change,
    ) => { blocked: boolean; message?: string } | Promise<{ blocked: boolean; message?: string }>
  } = {},
) {
  const schema = opts.schema === undefined ? makeStdSchema() : opts.schema
  const schemaProvider = makeSchemaProvider(schema)
  const countTasks = opts.countTasks ?? new CountTasks(changes, schemaProvider)
  const refresh =
    opts.refresh ??
    makeRefreshImplementationTracking(
      opts.refreshExecute ?? vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    )
  const registry = createWorkflowCheckRegistry({
    countTasks,
    runStepHooks: makeRunStepHooks(),
    readyFacts: {
      changes,
      listWorkspaces: makeListWorkspaces(),
      parsers: makeNoopParsers(),
      extractorTransforms: new Map(),
      workspaceRoutes: [],
    },
    detectImplLinksInScope,
    ...(opts.detectSpecOverlap !== undefined ? { detectSpecOverlap: opts.detectSpecOverlap } : {}),
  })
  return new GetStatus(
    changes,
    schemaProvider,
    opts.approvals ?? defaultApprovals,
    refresh,
    opts.transitionBindings ?? registry.transitionBindings,
    opts.archiveBindings ?? registry.archiveBindings,
  )
}

describe('GetStatus', () => {
  describe('given no existing change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = makeGetStatus(makeChangeRepository())
      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('basic status fields', () => {
    it('returns the change name and description', async () => {
      const change = makeChange('my-change', { description: 'A test change' })
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.name).toBe('my-change')
      expect(result.change?.description).toBe('A test change')
    })

    it('returns the current lifecycle state', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.state).toBe('designing')
    })

    it('returns all specs in the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'auth/logout'] })
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.specIds).toEqual(['auth/login', 'auth/logout'])
    })
  })

  describe('history event mapping', () => {
    it('maps history events with formatted dates', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.history).toHaveLength(2)
      const event = result.change!.history[0]!
      expect(event.type).toBe('created')
      expect(event.by).toEqual(testActor)
      expect(event.at).toBeInstanceOf(Date)
    })
  })

  describe('artifact status derivation', () => {
    it('reports missing when artifact not present in change', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const proposal = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(proposal?.state).toBe('missing')
    })

    it('reports complete when artifact is marked complete', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'missing' }),
      )
      proposal.markComplete('proposal', 'hash')
      change.setArtifact(proposal)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const node = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(node?.state).toBe('complete')
    })

    it('reports in-progress when artifact has files but not complete', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.json', status: 'in-progress' }),
      )
      change.setArtifact(proposal)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const node = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(node?.state).toBe('in-progress')
    })
  })

  describe('available transitions', () => {
    it('returns valid next states according to state machine', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.lifecycle.availableTransitions).toEqual(VALID_TRANSITIONS['designing'])
      expect(result.lifecycle.checksByTarget).toBeDefined()
      expect(result.lifecycle.checksByTarget.ready).toBeDefined()
    })
  })

  describe('spec dependencies', () => {
    it('projects specDependsOn from an active change', async () => {
      const change = makeChange('my-change', {
        specIds: ['core:a', 'core:b'],
      })
      change.setSpecDependsOn('core:a', ['core:c', 'core:d'])
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.specDependsOn).toEqual({
        'core:a': ['core:c', 'core:d'],
      })
    })

    it('projects specDependsOn from a drafted change', async () => {
      const change = makeChange('my-change', {
        specIds: ['core:a'],
      })
      change.setSpecDependsOn('core:a', ['core:b'])
      change.transition('designing', testActor)
      change.draft(testActor)

      const repo = makeChangeRepository()
      repo.store.set(change.name, change)

      const uc = makeGetStatus(repo)
      const result = await uc.execute({ name: 'my-change' })

      expect(result.specDependsOn).toEqual({
        'core:a': ['core:b'],
      })
    })
  })

  describe('implementation tracking refresh', () => {
    it('refreshes active changes by default', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({ name: 'my-change' })

      expect(refreshExecute).toHaveBeenCalledWith({ name: 'my-change' })
    })

    it('skips refresh when explicitly disabled', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({ name: 'my-change', refreshImplementationTracking: false })

      expect(refreshExecute).not.toHaveBeenCalled()
    })

    it('skips refresh for draft-only reads', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      change.draft(testActor)
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(repo, { refreshExecute })

      await uc.execute({ name: 'my-change' })

      expect(refreshExecute).not.toHaveBeenCalled()
    })
  })

  describe('schema issues', () => {
    it('returns artifacts with missing status when schema provider fails', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]), { schema: null })

      const result = await uc.execute({ name: 'my-change' })
      expect(result.artifactStatuses).toEqual([])
      expect(result.lifecycle.availableTransitions).toEqual([])
      expect(result.lifecycle.checksByTarget).toEqual({})
    })

    it('rethrows unexpected schema provider errors', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const changes = makeChangeRepository([change])
      const schemaProvider = {
        get: async () => {
          throw new Error('disk exploded')
        },
      }
      const uc = new GetStatus(
        changes,
        schemaProvider as never,
        defaultApprovals,
        makeRefreshImplementationTracking(),
        [],
        [],
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow('disk exploded')
    })
  })

  describe('task checklist preservation', () => {
    it('does not reset or invalidate completed tasks when retrieving status', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const tasksArtifact = new ChangeArtifact({ type: 'tasks' })
      tasksArtifact.setFile(
        new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'complete' }),
      )
      change.setArtifact(tasksArtifact)

      const changesRepo = makeChangeRepository([change])
      vi.spyOn(changesRepo, 'artifact').mockResolvedValue(
        new SpecArtifact(
          'tasks.md',
          '# Tasks\n- [x] 1.1 Completed Task\n- [ ] 1.2 Incomplete Task',
        ),
      )

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('tasks', {
          hasTasks: true,
          taskCompletionCheck: {
            incompletePattern: '^\\s*-\\s*\\[ \\]\\s+',
            completePattern: '^\\s*-\\s*\\[x\\]\\s+',
          },
        }),
      ])

      const uc = makeGetStatus(changesRepo, { schema })
      const result = await uc.execute({ name: 'my-change' })

      const tasksStatus = result.artifactStatuses.find((a) => a.type === 'tasks')
      expect(tasksStatus?.taskCompletion).toEqual({
        complete: 1,
        incomplete: 1,
        total: 2,
      })
    })
  })

  it('delegates task projection to CountTasks for artifact painting', async () => {
    const change = makeChange('delegated-tasks')
    change.transition('designing', testActor)
    const countTasks = {
      execute: vi.fn().mockResolvedValue({
        byArtifact: { tasks: { complete: 1, incomplete: 0, total: 1 } },
        total: { complete: 1, incomplete: 0, total: 1 },
      }),
    } as unknown as CountTasks
    const schema = makeSchema([
      makeArtifactType('tasks', { hasTasks: true, taskCompletionCheck: {} }),
    ])
    const uc = makeGetStatus(makeChangeRepository([change]), { schema, countTasks })

    const result = await uc.execute({ name: 'delegated-tasks' })

    expect(countTasks.execute).toHaveBeenCalled()
    expect(result.artifactStatuses[0]?.taskCompletion).toEqual({
      complete: 1,
      incomplete: 0,
      total: 1,
    })
    expect(result).not.toHaveProperty('total')
  })

  it('executes CountTasks inside task-completion before evaluateLifecycle', async () => {
    const change = makeChange('order-tasks')
    change.transition('designing', testActor)
    const order: string[] = []
    const countTasks = {
      execute: vi.fn().mockImplementation(async () => {
        order.push('countTasks')
        return {
          byArtifact: {},
          total: { complete: 0, incomplete: 0, total: 0 },
        }
      }),
    } as unknown as CountTasks
    const schema = makeStdSchema()
    const originalEvaluate = lifecycleEvaluation.evaluateLifecycle
    const evaluateSpy = vi
      .spyOn(lifecycleEvaluation, 'evaluateLifecycle')
      .mockImplementation((...args) => {
        order.push('evaluate')
        return originalEvaluate(...args)
      })
    const registry = createWorkflowCheckRegistry({
      countTasks,
      runStepHooks: makeRunStepHooks(),
      readyFacts: {
        changes: makeChangeRepository([change]),
        listWorkspaces: makeListWorkspaces(),
        parsers: makeNoopParsers(),
        extractorTransforms: new Map(),
        workspaceRoutes: [],
      },
      detectImplLinksInScope,
    })
    const uc = new GetStatus(
      makeChangeRepository([change]),
      makeSchemaProvider(schema),
      defaultApprovals,
      makeRefreshImplementationTracking(),
      registry.transitionBindings,
      registry.archiveBindings,
    )

    await uc.execute({ name: 'order-tasks' })

    expect(evaluateSpy).toHaveBeenCalledOnce()
    expect(countTasks.execute).toHaveBeenCalledTimes(1)
    expect(evaluateSpy.mock.calls[0]?.[2]?.checksByTarget).toBeDefined()
    expect(order.indexOf('countTasks')).toBeGreaterThan(-1)
    expect(order.indexOf('countTasks')).toBeLessThan(order.indexOf('evaluate'))
    evaluateSpy.mockRestore()
  })

  it('recounts CountTasks on a second execute of the same GetStatus instance', async () => {
    const change = makeChange('recount-tasks')
    change.transition('designing', testActor)
    const countTasks = {
      execute: vi.fn().mockResolvedValue({
        byArtifact: {},
        total: { complete: 0, incomplete: 0, total: 0 },
      }),
    } as unknown as CountTasks
    const schema = makeSchema([
      makeArtifactType('tasks', { hasTasks: true, taskCompletionCheck: {} }),
    ])
    const uc = makeGetStatus(makeChangeRepository([change]), { schema, countTasks })

    await uc.execute({ name: 'recount-tasks' })
    await uc.execute({ name: 'recount-tasks' })

    expect(countTasks.execute).toHaveBeenCalledTimes(2)
  })

  it('omits verifying from availableTransitions when implementing tasks are incomplete', async () => {
    const change = makeChange('impl-tasks')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'complete' }))
    change.setArtifact(tasks)
    const countTasks = {
      execute: vi.fn().mockResolvedValue({
        byArtifact: { tasks: { complete: 0, incomplete: 2, total: 2 } },
        total: { complete: 0, incomplete: 2, total: 2 },
      }),
    } as unknown as CountTasks
    const schema = makeSchema(
      [
        makeArtifactType('proposal'),
        makeArtifactType('tasks', {
          hasTasks: true,
          taskCompletionCheck: {
            incompletePattern: '^\\s*-\\s*\\[ \\]\\s+',
            completePattern: '^\\s*-\\s*\\[x\\]\\s+',
          },
        }),
      ],
      [
        makeWorkflowStep('designing'),
        makeWorkflowStep('ready', { requires: ['proposal'] }),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying', {
          requires: ['tasks'],
          requiresTaskCompletion: ['tasks'],
        }),
      ],
    )
    const uc = makeGetStatus(makeChangeRepository([change]), { schema, countTasks })

    const result = await uc.execute({ name: 'impl-tasks' })

    expect(result.lifecycle.availableTransitions).not.toContain('verifying')
    expect(result.lifecycle.validTransitions).toContain('verifying')
    expect(result.lifecycle.availableSteps.map((step) => step.step)).toEqual(
      expect.arrayContaining(['verifying']),
    )
    expect(
      result.lifecycle.availableSteps.find((step) => step.step === 'verifying')?.available,
    ).toBe(false)
    expect(result.lifecycle.checksByTarget.verifying).toBeDefined()
    expect(result.blockers.some((blocker) => blocker.code === 'INCOMPLETE_TASKS')).toBe(true)
  })

  it('given failed impl.filesResolved, when GetStatus merges blockers, then bypassFlag is absent', async () => {
    const change = makeChange('impl-open')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    const schema = makeSchema(
      [makeArtifactType('proposal'), makeArtifactType('tasks')],
      [
        makeWorkflowStep('designing'),
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
      ],
    )
    const failingFiles = {
      id: 'impl.filesResolved' as const,
      label: 'Checking open implementation files',
      kind: 'predicate' as const,
      execute: async () => ({
        id: 'impl.filesResolved' as const,
        label: 'Checking open implementation files',
        kind: 'predicate' as const,
        outcome: 'fail' as const,
        code: 'IMPLEMENTATION_STATE',
        message: '1 open tracked file remain open: a.ts',
      }),
    }
    const repo = makeChangeRepository([change])
    const schemaProvider = makeSchemaProvider(schema)
    const countTasks = new CountTasks(repo, schemaProvider)
    const registry = createWorkflowCheckRegistry({
      countTasks,
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
    const transitionBindings = registry.transitionBindings.map((binding) =>
      binding.check.id === 'impl.filesResolved' ? { ...binding, check: failingFiles } : binding,
    )
    const uc = makeGetStatus(repo, { schema, transitionBindings, countTasks })

    const result = await uc.execute({ name: 'impl-open' })

    const blocker = result.blockers.find((entry) => entry.code === 'IMPLEMENTATION_STATE')
    expect(blocker).toBeDefined()
    expect(blocker?.bypassFlag).toBeUndefined()
    expect(blocker?.checkId).toBe('impl.filesResolved')
    expect(blocker?.label).toBe('Checking open implementation files')
  })

  it('given failed impl.linksInScope, when GetStatus merges blockers, then bypassFlag is --allow-out-of-scope', async () => {
    const change = makeChange('impl-scope')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    const schema = makeSchema(
      [makeArtifactType('proposal'), makeArtifactType('tasks')],
      [
        makeWorkflowStep('designing'),
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
      ],
    )
    const failingLinks = {
      id: 'impl.linksInScope' as const,
      label: 'Checking implementation links',
      kind: 'predicate' as const,
      execute: async () => ({
        id: 'impl.linksInScope' as const,
        label: 'Checking implementation links',
        kind: 'predicate' as const,
        outcome: 'fail' as const,
        code: 'IMPLEMENTATION_STATE',
        message: 'out of scope',
      }),
    }
    const repo = makeChangeRepository([change])
    const schemaProvider = makeSchemaProvider(schema)
    const countTasks = new CountTasks(repo, schemaProvider)
    const registry = createWorkflowCheckRegistry({
      countTasks,
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
    const transitionBindings = registry.transitionBindings.map((binding) =>
      binding.check.id === 'impl.linksInScope' ? { ...binding, check: failingLinks } : binding,
    )
    const uc = makeGetStatus(repo, { schema, transitionBindings, countTasks })

    const result = await uc.execute({ name: 'impl-scope' })

    const blocker = result.blockers.find((entry) => entry.code === 'IMPLEMENTATION_STATE')
    expect(blocker).toBeDefined()
    expect(blocker?.bypassFlag).toBe('--allow-out-of-scope')
    expect(blocker?.checkId).toBe('impl.linksInScope')
    expect(blocker?.label).toBe('Checking implementation links')
  })

  it('given failed deps.consistent, when GetStatus merges blockers, then blocker carries gerund label', async () => {
    const change = makeChange('deps-label')
    change.transition('designing', testActor)
    const schema = makeSchema(
      [makeArtifactType('proposal')],
      [makeWorkflowStep('designing'), makeWorkflowStep('ready', { requires: ['proposal'] })],
    )
    change.setArtifact(
      (() => {
        const proposal = new ChangeArtifact({ type: 'proposal' })
        proposal.setFile(
          new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'complete' }),
        )
        return proposal
      })(),
    )
    const failingDeps = {
      id: 'deps.consistent' as const,
      label: 'Checking spec dependencies',
      kind: 'predicate' as const,
      execute: async () => ({
        id: 'deps.consistent' as const,
        label: 'Checking spec dependencies',
        kind: 'predicate' as const,
        outcome: 'fail' as const,
        code: 'DEPS_INCONSISTENT',
        message: 'extracted [] vs persisted [core:a]',
      }),
    }
    const repo = makeChangeRepository([change])
    const schemaProvider = makeSchemaProvider(schema)
    const countTasks = new CountTasks(repo, schemaProvider)
    const registry = createWorkflowCheckRegistry({
      countTasks,
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
    const transitionBindings = registry.transitionBindings.map((binding) =>
      binding.check.id === 'deps.consistent' ? { ...binding, check: failingDeps } : binding,
    )
    const uc = makeGetStatus(repo, { schema, transitionBindings, countTasks })

    const result = await uc.execute({ name: 'deps-label' })

    const blocker = result.blockers.find((entry) => entry.code === 'DEPS_INCONSISTENT')
    expect(blocker).toEqual(
      expect.objectContaining({
        code: 'DEPS_INCONSISTENT',
        label: 'Checking spec dependencies',
        checkId: 'deps.consistent',
      }),
    )
  })

  describe('missing application-level test requirements', () => {
    it('cascades effectiveStatus to required dependencies', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
      )
      change.setArtifact(proposal)

      const specs = new ChangeArtifact({ type: 'specs' })
      specs.setFile(
        new ArtifactFile({
          key: 'auth/login',
          filename: 'specs/auth/login/spec.md',
          status: 'complete',
          validatedHash: 'hash',
        }),
      )
      change.setArtifact(specs)

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] }),
      ])

      const uc = makeGetStatus(makeChangeRepository([change]), { schema })
      const result = await uc.execute({ name: 'my-change' })

      const proposalStatus = result.artifactStatuses.find((a) => a.type === 'proposal')
      const specsStatus = result.artifactStatuses.find((a) => a.type === 'specs')

      expect(proposalStatus?.state).toBe('in-progress')
      expect(proposalStatus?.effectiveStatus).toBe('in-progress')

      expect(specsStatus?.state).toBe('complete')
      expect(specsStatus?.effectiveStatus).toBe('in-progress')
    })

    it('aggregates displayStatus using precedence (complete-with-drift)', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const specs = new ChangeArtifact({ type: 'specs' })

      const file1 = new ArtifactFile({
        key: 'auth/login',
        filename: 'specs/auth/login/spec.md',
        status: 'complete',
        validatedHash: 'hash',
      })
      const file2 = new ArtifactFile({
        key: 'auth/logout',
        filename: 'specs/auth/logout/spec.md',
        status: 'complete',
        hasDrift: true,
        validatedHash: 'hash2',
      })

      specs.setFile(file1)
      specs.setFile(file2)
      change.setArtifact(specs)

      const schema = makeSchema([makeArtifactType('specs', { scope: 'spec' })])

      const uc = makeGetStatus(makeChangeRepository([change]), { schema })
      const result = await uc.execute({ name: 'my-change' })

      const specsStatus = result.artifactStatuses.find((a) => a.type === 'specs')
      expect(specsStatus?.displayStatus).toBe('complete-with-drift')
    })

    it('asserts that machine blocker codes ARTIFACT_DRIFT and REVIEW_REQUIRED are correctly projected', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'drifted-pending-review',
          hasDrift: true,
          validatedHash: 'hash',
        }),
      )
      change.setArtifact(proposal)

      const uc = makeGetStatus(makeChangeRepository([change]))
      const result = await uc.execute({ name: 'my-change' })

      expect(result.blockers.some((b) => b.code === 'ARTIFACT_DRIFT')).toBe(true)

      const change2 = makeChange('my-change-2')
      change2.transition('designing', testActor)

      const proposal2 = new ChangeArtifact({ type: 'proposal' })
      proposal2.setFile(
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'pending-review',
          validatedHash: 'hash',
        }),
      )
      change2.setArtifact(proposal2)

      const uc2 = makeGetStatus(makeChangeRepository([change2]))
      const result2 = await uc2.execute({ name: 'my-change-2' })

      expect(result2.blockers.some((b) => b.code === 'REVIEW_REQUIRED')).toBe(true)
    })

    it('projects read-only views with empty transitions for drafted changes', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      change.draft(testActor)

      const repo = makeChangeRepository()
      repo.store.set(change.name, change)

      const uc = makeGetStatus(repo)
      const result = await uc.execute({ name: 'my-change' })

      expect(result.change).toBeUndefined()
      expect(result.draftView).toBeDefined()
      expect(result.draftView?.name).toBe('my-change')

      expect(result.lifecycle.validTransitions).toEqual([])
      expect(result.lifecycle.availableTransitions).toEqual([])
      expect(result.lifecycle.availableSteps).toEqual([])
      expect(result.lifecycle.blockers).toEqual([])
      expect(result.lifecycle.nextArtifact).toBeNull()
      expect(result.nextAction.command).toBeNull()
    })

    it('projects pending-parent-artifact-review for drafted dependents without calling evaluate', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'pending-review',
          validatedHash: 'hash',
        }),
      )
      const specs = new ChangeArtifact({ type: 'specs' })
      specs.setFile(
        new ArtifactFile({
          key: 'default:auth/login',
          filename: 'deltas/core/x/spec.md.delta.yaml',
          status: 'complete',
          validatedHash: 'hash2',
        }),
      )
      change.setArtifact(proposal)
      change.setArtifact(specs)
      change.draft(testActor)

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] }),
      ])
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const evaluateSpy = vi.spyOn(lifecycleEvaluation, 'evaluateLifecycle')
      const uc = makeGetStatus(repo, { schema })
      const result = await uc.execute({ name: 'my-change' })
      expect(evaluateSpy).not.toHaveBeenCalled()
      expect(
        result.artifactStatuses.find((artifact) => artifact.type === 'specs')?.effectiveStatus,
      ).toBe('pending-parent-artifact-review')
      evaluateSpy.mockRestore()
      expect(result.lifecycle.availableTransitions).toEqual([])
      expect(result.lifecycle.availableSteps).toEqual([])
    })

    it('projects missing schema artifacts on drafted changes from the DAG', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const specs = new ChangeArtifact({ type: 'specs' })
      specs.setFile(
        new ArtifactFile({
          key: 'default:auth/login',
          filename: 'deltas/core/x/spec.md.delta.yaml',
          status: 'complete',
          validatedHash: 'hash2',
        }),
      )
      change.setArtifact(specs)
      change.draft(testActor)

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] }),
      ])
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const uc = makeGetStatus(repo, { schema })
      const result = await uc.execute({ name: 'my-change' })

      expect(result.artifactStatuses.find((artifact) => artifact.type === 'proposal')?.state).toBe(
        'missing',
      )
      expect(
        result.artifactStatuses.find((artifact) => artifact.type === 'specs')?.effectiveStatus,
      ).toBe('in-progress')
    })
  })

  describe('ifModifiedSince revision checks', () => {
    it('returns unchanged early when client revision matches updatedAt', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const updatedAt = new Date('2024-06-01T12:00:00Z')
      const change = makeChange('my-change', { createdAt, updatedAt })
      change.transition('designing', testActor)
      const refreshExecute = vi.fn()
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      const result = await uc.execute({
        name: 'my-change',
        ifModifiedSince: updatedAt.toISOString(),
      })

      expect(result.unchanged).toBe(true)
      expect(result.artifactStatuses).toEqual([])
      expect(refreshExecute).not.toHaveBeenCalled()
      expect(result.change).toBe(change)
      expect(result.specDependsOn).toEqual({})
      expect(result.blockers).toEqual([])
      expect(result.review.required).toBe(false)
    })

    it('returns unchanged early when client revision exceeds updatedAt', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const updatedAt = new Date('2024-06-01T12:00:00Z')
      const change = makeChange('my-change', { createdAt, updatedAt })
      change.transition('designing', testActor)
      const refreshExecute = vi.fn()
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      const result = await uc.execute({
        name: 'my-change',
        ifModifiedSince: new Date('2024-06-01T13:00:00Z').toISOString(),
      })

      expect(result.unchanged).toBe(true)
      expect(result.artifactStatuses).toEqual([])
      expect(refreshExecute).not.toHaveBeenCalled()
      expect(result.change).toBe(change)
      expect(result.specDependsOn).toEqual({})
      expect(result.blockers).toEqual([])
      expect(result.review.required).toBe(false)
    })

    it('re-evaluates full status when client revision is older than updatedAt', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const updatedAt = new Date('2024-06-01T12:00:00Z')
      const change = makeChange('my-change', { createdAt, updatedAt })
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        ifModifiedSince: new Date('2024-01-01T00:00:00Z').toISOString(),
      })

      expect(result.unchanged).toBeUndefined()
      expect(result.artifactStatuses.length).toBeGreaterThan(0)
    })

    it('re-evaluates full status when ifModifiedSince is unparseable', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const updatedAt = new Date('2024-06-01T12:00:00Z')
      const change = makeChange('my-change', { createdAt, updatedAt })
      change.transition('designing', testActor)
      const refreshExecute = vi.fn()
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      const result = await uc.execute({
        name: 'my-change',
        ifModifiedSince: 'not-a-date',
      })

      expect(result.unchanged).toBeUndefined()
      expect(result.artifactStatuses.length).toBeGreaterThan(0)
      expect(refreshExecute).toHaveBeenCalled()
    })
  })

  it('given incomplete required artifacts, when GetStatus merges blockers, then INCOMPLETE_ARTIFACT is included', async () => {
    const change = makeChange('incomplete-requires')
    change.transition('designing', testActor)
    const schema = makeSchema(
      [makeArtifactType('proposal')],
      [makeWorkflowStep('ready', { requires: ['proposal'] })],
    )
    const uc = makeGetStatus(makeChangeRepository([change]), { schema })

    const result = await uc.execute({ name: 'incomplete-requires' })

    expect(result.blockers.some((blocker) => blocker.code === 'INCOMPLETE_ARTIFACT')).toBe(true)
  })

  it('given spec approval enabled without recorded approval, when GetStatus merges blockers, then APPROVAL_REQUIRED is included', async () => {
    const change = makeChange('needs-spec-approval')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    const uc = makeGetStatus(makeChangeRepository([change]), {
      approvals: { spec: true, signoff: false },
    })

    const result = await uc.execute({ name: 'needs-spec-approval' })

    expect(result.blockers.some((blocker) => blocker.code === 'APPROVAL_REQUIRED')).toBe(true)
  })

  it('given invalidation overlap, when GetStatus runs, then review is required without OVERLAP_CONFLICT', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'overlap-victim',
      createdAt,
      specIds: ['default:auth/login'],
      history: [
        {
          type: 'created',
          at: createdAt,
          by: testActor,
          specIds: ['default:auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        {
          type: 'invalidated',
          at: new Date('2024-01-02T00:00:00Z'),
          by: testActor,
          cause: 'spec-overlap-conflict',
          message: "Overlaps with archived change 'alpha' on specs: default:auth/login",
          affectedArtifacts: [],
        },
      ],
    })
    const proposal = new ChangeArtifact({ type: 'proposal' })
    proposal.setFile(
      new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'pending-review' }),
    )
    change.setArtifact(proposal)
    const uc = makeGetStatus(makeChangeRepository([change]))

    const result = await uc.execute({ name: 'overlap-victim' })

    expect(result.review.reason).toBe('spec-overlap-conflict')
    expect(result.review.message).toBe('Conflict detected with archived overlapping specs')
    expect(result.review.required).toBe(true)
    expect(result.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
    expect(result.nextAction.command).toBe('/specd-design')
  })

  it('given archivable live overlap, when GetStatus runs archive predicates, then OVERLAP_CONFLICT is skippable', async () => {
    const change = makeChange('live-overlap')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)
    change.transition('archivable', testActor)
    const overlapCheck: Check = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      execute: async () =>
        fail('spec.overlap', 'OVERLAP_CONFLICT', 'Specs overlap with other active changes'),
    }
    const archiveBindings: CheckBinding[] = [
      { check: overlapCheck, applicability: [{ scope: 'archive' }] },
    ]
    const uc = makeGetStatus(makeChangeRepository([change]), { archiveBindings })

    const result = await uc.execute({ name: 'live-overlap' })

    const overlap = result.blockers.find((blocker) => blocker.code === 'OVERLAP_CONFLICT')
    expect(overlap).toBeDefined()
    expect(overlap?.bypassFlag).toBe('--allow-overlap')
    expect(overlap?.checkId).toBe('spec.overlap')
    expect(result.nextAction.command).toBe('/specd-archive')
    expect(result.nextAction.targetStep).toBe('archivable')
    expect(result.nextAction.reason).not.toBe('Ready to archive')
    expect(result.nextAction.reason).toMatch(/overlap/i)
    expect(result.nextAction.reason).toContain('--allow-overlap')
  })

  it('does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable', async () => {
    const change = makeChange('designing-live-overlap')
    change.transition('designing', testActor)
    const detectSpecOverlap = vi.fn().mockResolvedValue({
      blocked: true,
      message: 'Specs overlap with other active changes',
    })
    const uc = makeGetStatus(makeChangeRepository([change]), { detectSpecOverlap })

    const result = await uc.execute({ name: 'designing-live-overlap' })

    expect(detectSpecOverlap).not.toHaveBeenCalled()
    expect(result.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
  })

  it('runs wired archive overlap I/O when archivable', async () => {
    const change = makeChange('archivable-wired-overlap')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)
    change.transition('archivable', testActor)
    const detectSpecOverlap = vi.fn().mockResolvedValue({
      blocked: true,
      message: 'Specs overlap with other active changes',
    })
    const uc = makeGetStatus(makeChangeRepository([change]), { detectSpecOverlap })

    const result = await uc.execute({ name: 'archivable-wired-overlap' })

    expect(detectSpecOverlap).toHaveBeenCalled()
    const overlap = result.blockers.find((blocker) => blocker.code === 'OVERLAP_CONFLICT')
    expect(overlap).toBeDefined()
    expect(overlap?.bypassFlag).toBe('--allow-overlap')
  })
})
