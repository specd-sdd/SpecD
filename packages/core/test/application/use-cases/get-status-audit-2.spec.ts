import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type Change } from '../../../src/domain/entities/change.js'
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

function makeRefresh() {
  return {
    execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
}

function makeGetStatus(
  changes: ReturnType<typeof makeChangeRepository>,
  opts: { reconcile?: ReconcileChangeValidity; refresh?: RefreshImplementationTracking } = {},
) {
  const schema = makeSchema([makeArtifactType('proposal')])
  const schemaProvider = makeSchemaProvider(schema)
  const refresh = opts.refresh ?? makeRefresh()
  const registry = createWorkflowCheckRegistry({
    countTasks: new CountTasks(changes, schemaProvider),
    runStepHooks: makeRunStepHooks(),
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
    { spec: false, signoff: false },
    refresh,
    registry.transitionBindings,
    registry.archiveBindings,
    opts.reconcile ?? makeObservingReconcile(changes, undefined, refresh),
  )
}

function implementingChange(name: string): Change {
  const change = makeChange(name)
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

describe('GetStatus audit 2', () => {
  describe('implementationTracking projection', () => {
    it('projects tracked files with their review state and confirmed links verbatim', async () => {
      const change = implementingChange('tracked')
      change.trackImplementationFile('packages/core/src/a.ts', 'open')
      change.trackImplementationFile('packages/core/src/b.ts', 'resolved')
      change.addImplementationLink({
        specId: 'core:core/lifecycle-engine',
        file: 'packages/core/src/a.ts',
        fileLinkExplicit: true,
        symbols: ['evaluateLifecycle'],
      })
      change.addImplementationLink({
        specId: 'core:core/get-status',
        file: 'packages/core/src/b.ts',
        fileLinkExplicit: false,
        symbols: ['GetStatus'],
      })
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'tracked' })

      expect(result.implementationTracking.trackedFiles).toEqual([
        { file: 'packages/core/src/a.ts', state: 'open' },
        { file: 'packages/core/src/b.ts', state: 'resolved' },
      ])
      expect(result.implementationTracking.links).toEqual([
        {
          specId: 'core:core/lifecycle-engine',
          file: 'packages/core/src/a.ts',
          fileLinkExplicit: true,
          symbols: ['evaluateLifecycle'],
        },
        {
          specId: 'core:core/get-status',
          file: 'packages/core/src/b.ts',
          fileLinkExplicit: false,
          symbols: ['GetStatus'],
        },
      ])
    })

    it('projects empty tracking for an active change without evidence', async () => {
      const change = implementingChange('empty')
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'empty' })

      expect(result.implementationTracking).toEqual({ trackedFiles: [], links: [] })
    })

    it('reflects evidence recorded by the refresh that precedes the projection', async () => {
      const change = implementingChange('refreshed')
      const repo = makeChangeRepository([change])
      const refresh = {
        execute: vi.fn().mockImplementation(async () => {
          repo.store.get('refreshed')!.trackImplementationFile('packages/core/src/new.ts', 'open')
          return { trackedFiles: [], links: [] }
        }),
      } as unknown as RefreshImplementationTracking
      const uc = makeGetStatus(repo, { refresh })

      const result = await uc.execute({ name: 'refreshed' })

      expect(result.implementationTracking.trackedFiles).toEqual([
        { file: 'packages/core/src/new.ts', state: 'open' },
      ])
    })

    it('always projects empty tracking for a drafted change', async () => {
      const change = makeChange('drafted')
      change.transition('designing', testActor)
      change.trackImplementationFile('packages/core/src/a.ts', 'open')
      change.draft(testActor)
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'drafted' })

      expect(result.draftView).toBeDefined()
      expect(result.implementationTracking).toEqual({ trackedFiles: [], links: [] })
    })
  })

  describe('draft read-only conditional status', () => {
    it('returns the read-only draft projection without reconciling or refreshing, even with a current revision', async () => {
      const change = makeChange('drafted', {
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-06-01T12:00:00Z'),
      })
      change.transition('designing', testActor)
      change.draft(testActor)
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const reconcileExecute = vi.fn().mockRejectedValue(new Error('draft must not reconcile'))
      const reconcile = { execute: reconcileExecute } as unknown as ReconcileChangeValidity
      const refresh = makeRefresh()
      const uc = makeGetStatus(repo, { reconcile, refresh })

      const first = await uc.execute({ name: 'drafted' })
      const conditional = await uc.execute({
        name: 'drafted',
        ifModifiedSince: new Date(Date.now() + 60_000).toISOString(),
      })

      expect(reconcileExecute).not.toHaveBeenCalled()
      expect((refresh.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
      expect(conditional.draftView?.name).toBe('drafted')
      expect(conditional.validity).toBeUndefined()
      expect(conditional.lifecycle.validTransitions).toEqual([])
      expect(conditional.lifecycle.availableTransitions).toEqual([])
      expect(conditional.implementationTracking).toEqual({ trackedFiles: [], links: [] })
      expect(conditional.change).toBeUndefined()
      // The projection is identical to the unconditional read: the revision input is advisory.
      expect(conditional.artifactStatuses).toEqual(first.artifactStatuses)
      expect(conditional.nextAction).toEqual(first.nextAction)
      expect(conditional.blockers).toEqual(first.blockers)
    })

    it('never short-circuits active changes either: the reconciler still runs for a current revision', async () => {
      const change = implementingChange('active')
      const reconcileExecute = vi.fn()
      const refresh = makeRefresh()
      const observing = makeObservingReconcile(makeChangeRepository([change]), undefined, refresh)
      const reconcile = {
        execute: async (input: unknown) => {
          reconcileExecute(input)
          return (observing as unknown as { execute(i: unknown): Promise<unknown> }).execute(input)
        },
      } as unknown as ReconcileChangeValidity
      const uc = makeGetStatus(makeChangeRepository([change]), { reconcile, refresh })

      const result = await uc.execute({
        name: 'active',
        ifModifiedSince: new Date(Date.now() + 60_000).toISOString(),
      })

      expect(reconcileExecute).toHaveBeenCalledTimes(1)
      expect(result.unchanged).toBeUndefined()
    })
  })
})
