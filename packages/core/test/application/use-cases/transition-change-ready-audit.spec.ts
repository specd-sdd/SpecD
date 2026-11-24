import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { CheckPredicateFailedError } from '../../../src/domain/errors/check-predicate-failed-error.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import {
  makeActorResolver,
  makeChangeRepository,
  makeListWorkspaces,
  makeNoopParsers,
  makeRealReconcile,
  makeRunStepHooks,
  makeSchema,
  makeSchemaProvider,
  makeSpecApprovalFingerprint,
  testActor,
} from './helpers.js'

function changeInReady(name: string): Change {
  const at = new Date('2024-01-01T00:00:00Z')
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at,
      by: testActor,
      specIds: ['auth/login'],
      schemaName: 'test-schema',
      schemaVersion: 1,
    },
    { type: 'transitioned', from: 'drafting', to: 'designing', at, by: testActor } as ChangeEvent,
    { type: 'transitioned', from: 'designing', to: 'ready', at, by: testActor } as ChangeEvent,
  ]
  return new Change({
    name,
    createdAt: at,
    specIds: ['auth/login'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    history,
  })
}

describe('TransitionChange from ready with stale spec consent', () => {
  it('fails approval.spec with the approve-spec action and commits no recovery', async () => {
    const change = changeInReady('stale-ready')
    // Scope no longer matches the change specs: stale per fingerprint.
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const schemaProvider = makeSchemaProvider(makeSchema())
    const approvals = { spec: true, signoff: false }
    const refresh = {
      execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    } as unknown as RefreshImplementationTracking
    const registry = createWorkflowCheckRegistry({
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
    const useCase = new TransitionChange(
      repo,
      makeActorResolver(),
      schemaProvider,
      refresh,
      approvals,
      registry.transitionBindings,
      makeRealReconcile(repo, schemaProvider, approvals),
    )
    const eventsBefore = repo.store.get('stale-ready')!.history.length

    const error = await useCase
      .execute({ name: 'stale-ready', to: 'implementing' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CheckPredicateFailedError)
    const failed = error as CheckPredicateFailedError
    expect(failed.checkId).toBe('approval.spec')
    expect(failed.action).toMatchObject({ kind: 'approve-spec' })

    const persisted = repo.store.get('stale-ready')!
    expect(persisted.state).toBe('ready')
    expect(persisted.history.filter((e) => e.type === 'transitioned')).toHaveLength(2)
    expect(persisted.history.length).toBeGreaterThanOrEqual(eventsBefore)
    expect(persisted.history.some((e) => e.type === 'invalidated')).toBe(false)
  })
})
