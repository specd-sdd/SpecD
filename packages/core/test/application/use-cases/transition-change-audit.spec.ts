import { describe, it, expect, vi } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ReconciledOperationBlockedError } from '../../../src/application/errors/reconciled-operation-blocked-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { CheckPredicateFailedError } from '../../../src/domain/errors/check-predicate-failed-error.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import {
  type CheckBinding,
  type CustomCheckDefinition,
} from '../../../src/domain/services/transition-checks.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import {
  type AutomaticRecovery,
  type ChangeValidityVerdict,
} from '../../../src/domain/services/change-validity.js'
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

const actor = testActor

/** Text that would indicate delivery-specific (CLI or slash command) syntax. */
const CLI_SYNTAX = /specd |--[a-z]|\/specd-|`specd/

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

function hop(from: string, to: string): ChangeEvent {
  return { type: 'transitioned', from, to, at: new Date(), by: actor } as ChangeEvent
}

function makeUseCase(
  repo: ReturnType<typeof makeChangeRepository>,
  overrides: {
    schema?: ReturnType<typeof makeSchema>
    approvals?: { spec: boolean; signoff: boolean }
    reconcile?: ReconcileChangeValidity
    transitionBindings?: readonly CheckBinding[]
    checkRegistry?: CheckRegistry
  } = {},
): TransitionChange {
  const refresh = {
    execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
  const schemaProvider = makeSchemaProvider(overrides.schema ?? makeSchema())
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
  return new TransitionChange(
    repo,
    makeActorResolver(),
    schemaProvider,
    refresh,
    overrides.approvals ?? { spec: false, signoff: false },
    overrides.transitionBindings ?? registry.transitionBindings,
    overrides.reconcile ?? makeObservingReconcile(repo, undefined, refresh),
    overrides.checkRegistry,
  )
}

/** Reconciler that commits `recovery` on the change and reports `verdict`. */
function recoveringReconcile(
  change: Change,
  recovery: AutomaticRecovery,
  verdict: Partial<ChangeValidityVerdict>,
): ReconcileChangeValidity {
  const full: ChangeValidityVerdict = {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification: 'not-required',
    blockers: [],
    recovery,
    ...verdict,
  }
  return {
    execute: async () => {
      change.recover(recovery, actor)
      return {
        change,
        verdict: full,
        projectionChanges: [],
        affectedArtifacts: [],
        automaticReturn: recovery,
        changed: true,
      }
    },
  } as unknown as ReconcileChangeValidity
}

describe('TransitionChange audit', () => {
  describe('workflow.requires blockedBy', () => {
    it('computes blockedBy through the recursive parent chain', async () => {
      const change = makeChangeInState('parent-review', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
      ])
      const specs = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      specs.markComplete('specs', 'sha256:a')
      specs.markPendingReview()
      const design = new ChangeArtifact({
        type: 'design',
        files: new Map([
          [
            'design',
            new ArtifactFile({ key: 'design', filename: 'design.md', status: 'in-progress' }),
          ],
        ]),
      })
      design.markComplete('design', 'sha256:b')
      change.setArtifact(specs)
      change.setArtifact(design)
      const schema = makeSchema({
        artifacts: [makeArtifactType('specs'), makeArtifactType('design', { requires: ['specs'] })],
        workflow: [makeWorkflowStep('implementing', { requires: ['design'] })],
      })
      const uc = makeUseCase(makeChangeRepository([change]), { schema })

      const error = await uc
        .execute({ name: 'parent-review', to: 'implementing' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('workflow.requires')
      expect(failure.details).toMatchObject({
        artifactId: 'design',
        status: 'pending-parent-artifact-review',
        blockedBy: { artifactId: 'specs', status: 'pending-review' },
      })
    })
  })

  describe('entity transition arguments', () => {
    it('hands the effective target, actor, schema and approvals to Change.transition', async () => {
      const change = makeChangeInState('args', [hop('drafting', 'designing')])
      const transition = vi.spyOn(change, 'transition')
      const schema = makeSchema()
      const approvals = { spec: true, signoff: true }
      const uc = makeUseCase(makeChangeRepository([change]), { schema, approvals })

      const result = await uc.execute({ name: 'args', to: 'ready' })

      expect(result.change.state).toBe('ready')
      expect(transition).toHaveBeenCalledTimes(1)
      const [target, by, resolvedSchema, gates] = transition.mock.calls[0]!
      expect(target).toBe('ready')
      expect(by).toEqual(actor)
      expect(resolvedSchema).toBe(schema)
      expect(gates).toEqual(approvals)
    })
  })

  describe('committed recovery guidance', () => {
    it('reports the design intent when spec consent recovery commits designing', async () => {
      const change = makeChangeInState('spec-stale', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
        hop('ready', 'implementing'),
      ])
      const recovery: AutomaticRecovery = {
        cause: 'spec-approval',
        from: 'implementing',
        to: 'designing',
      }
      const reconcile = recoveringReconcile(change, recovery, {
        specApproval: 'stale',
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        reconcile,
        approvals: { spec: true, signoff: false },
      })

      const error = await uc
        .execute({ name: 'spec-stale', to: 'implementing' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ReconciledOperationBlockedError)
      const blocked = error as ReconciledOperationBlockedError
      expect(blocked.state).toBe('designing')
      expect(blocked.nextAction.intent).toBe('design')
      expect(blocked.nextAction.action).toBeUndefined()
      expect(blocked.message).not.toMatch(CLI_SYNTAX)
      expect(JSON.stringify(blocked.nextAction)).not.toMatch(CLI_SYNTAX)
    })

    it('reports the action declared by approval.signoff when recovery commits done', async () => {
      const change = makeChangeInState('signoff-stale', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
        hop('ready', 'implementing'),
        hop('implementing', 'verifying'),
        hop('verifying', 'done'),
        hop('done', 'archivable'),
      ])
      const recovery: AutomaticRecovery = { cause: 'signoff', from: 'archivable', to: 'done' }
      const reconcile = recoveringReconcile(change, recovery, {
        signoff: 'stale',
        verification: 'valid',
        blockers: [{ code: 'SIGNOFF_STALE', message: 'Sign-off is stale' }],
      })
      const uc = makeUseCase(makeChangeRepository([change]), {
        reconcile,
        approvals: { spec: false, signoff: true },
      })

      const error = await uc
        .execute({ name: 'signoff-stale', to: 'archiving' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ReconciledOperationBlockedError)
      const blocked = error as ReconciledOperationBlockedError
      expect(blocked.state).toBe('done')
      expect(blocked.nextAction.action?.kind).toBe('approve-signoff')
      expect(blocked.message).not.toMatch(CLI_SYNTAX)
      expect(JSON.stringify(blocked.nextAction)).not.toMatch(CLI_SYNTAX)
    })
  })

  describe('next from a parked state with gates on', () => {
    it('resolves pending-spec-approval to implementing and lets approval.spec decide', async () => {
      const change = makeChangeInState('parked-spec', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
        hop('ready', 'pending-spec-approval'),
      ])
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: true, signoff: false },
      })

      await expect(uc.execute({ name: 'parked-spec', to: 'next' })).rejects.toMatchObject({
        name: 'CheckPredicateFailedError',
        checkId: 'approval.spec',
        from: 'pending-spec-approval',
        to: 'implementing',
      })
      expect(change.state).toBe('pending-spec-approval')

      change.recordSpecApproval('ok', makeSpecApprovalFingerprint(change.specIds), actor)
      const result = await uc.execute({ name: 'parked-spec', to: 'next' })
      expect(result.change.state).toBe('implementing')
    })

    it('resolves pending-signoff to archivable and lets approval.signoff decide', async () => {
      const change = makeChangeInState('parked-signoff', [
        hop('drafting', 'designing'),
        hop('designing', 'ready'),
        hop('ready', 'implementing'),
        hop('implementing', 'verifying'),
        hop('verifying', 'done'),
        hop('done', 'pending-signoff'),
      ])
      const uc = makeUseCase(makeChangeRepository([change]), {
        approvals: { spec: false, signoff: true },
      })

      await expect(uc.execute({ name: 'parked-signoff', to: 'next' })).rejects.toMatchObject({
        name: 'CheckPredicateFailedError',
        checkId: 'approval.signoff',
        from: 'pending-signoff',
        to: 'archivable',
      })
      expect(change.state).toBe('pending-signoff')

      change.recordSignoff('ok', {}, actor)
      const result = await uc.execute({ name: 'parked-signoff', to: 'next' })
      expect(result.change.state).toBe('archivable')
    })
  })

  describe('plugin action kinds', () => {
    it('does not enforce namespacing of plugin action kinds in core', async () => {
      const change = makeChangeInState('plugin-action', [hop('drafting', 'designing')])
      const registry = new CheckRegistry()
      const customCheck: CustomCheckDefinition = {
        id: 'code-audit',
        label: 'Code Audit',
        execute: async () => ({
          id: '@acme/security.code-audit',
          label: 'Code Audit',
          kind: 'predicate',
          outcome: 'fail',
          code: 'AUDIT_FAILED',
          message: 'Audit failed',
          action: { kind: 'not-namespaced-kind', guidance: 'Fix the audit findings' },
        }),
      }
      registry.register('@acme/security', customCheck, [
        { scope: 'transition', from: 'designing', to: 'ready', skippable: true },
      ])
      const transitionBindings = registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'transition'))
      const uc = makeUseCase(makeChangeRepository([change]), {
        checkRegistry: registry,
        transitionBindings,
      })

      const error = await uc
        .execute({ name: 'plugin-action', to: 'ready' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      expect((error as CheckPredicateFailedError).action).toEqual({
        kind: 'not-namespaced-kind',
        guidance: 'Fix the audit findings',
      })
    })
  })
})
