import { describe, expect, it, vi } from 'vitest'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import {
  type AutomaticRecovery,
  type ChangeValidityVerdict,
} from '../../../src/domain/services/change-validity.js'
import {
  makeActorResolver,
  makeChangeRepository,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeSchema,
  makeSchemaProvider,
  makeWorkflowStep,
  testActor,
} from './helpers.js'

const CLI_SYNTAX = /specd |--[a-z]|\/specd-|`specd/

function changeIn(path: readonly string[]): Change {
  const at = new Date('2024-01-15T10:00:00.000Z')
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at,
      by: testActor,
      specIds: ['auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    },
  ]
  let previous = 'drafting'
  for (const state of path) {
    history.push({
      type: 'transitioned',
      from: previous,
      to: state,
      at,
      by: testActor,
    } as ChangeEvent)
    previous = state
  }
  return new Change({
    name: 'c1',
    createdAt: at,
    specIds: ['auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history,
  })
}

const PATH_TO_ARCHIVABLE = [
  'designing',
  'ready',
  'implementing',
  'verifying',
  'done',
  'archivable',
] as const

async function invalidateWithRecovery(options: {
  change: Change
  recovery: AutomaticRecovery
  verdict: Partial<ChangeValidityVerdict>
  approvals: { spec: boolean; signoff: boolean }
  verifyingDisabled?: boolean
}) {
  const { change, recovery } = options
  const repo = makeChangeRepository([change])
  const schema = makeSchema({
    name: '@specd/schema-std',
    workflow: [makeWorkflowStep('verifying', { disabled: options.verifyingDisabled === true })],
  })
  const schemaProvider = makeSchemaProvider(schema)
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
  const verdict: ChangeValidityVerdict = {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification: 'not-required',
    blockers: [],
    recovery,
    ...options.verdict,
  }
  const committed = () => ({
    change,
    verdict,
    projectionChanges: [],
    affectedArtifacts: [],
    automaticReturn: recovery,
    changed: true,
  })
  const reconcile = {
    execute: vi.fn(async () => {
      change.recover(recovery, testActor)
      return committed()
    }),
    mutate: vi.fn(
      async (
        _input: unknown,
        operation: (context: {
          change: Change
          before: ChangeValidityVerdict
          fingerprint: null
          reconcileAfter: () => Promise<ChangeValidityVerdict>
        }) => unknown,
      ) => {
        const result = await operation({
          change,
          before: { ...verdict, recovery: null },
          fingerprint: null,
          reconcileAfter: async () => {
            change.recover(recovery, testActor)
            return verdict
          },
        })
        return { ...committed(), result }
      },
    ),
  } as unknown as ReconcileChangeValidity
  const uc = new InvalidateChange(
    repo,
    makeActorResolver(),
    schemaProvider,
    reconcile,
    undefined,
    options.approvals,
    registry.transitionBindings,
  )
  return uc.execute({
    name: change.name,
    reason: 'review',
    policyOverride: { artifacts: 'none', workflow: 'preserve' },
  })
}

describe('InvalidateChange next action from committed recovery', () => {
  it('keeps the check-declared action when recovery to done also leaves stale verification', async () => {
    const result = await invalidateWithRecovery({
      change: changeIn(PATH_TO_ARCHIVABLE),
      recovery: { cause: 'signoff', from: 'archivable', to: 'done' },
      verdict: {
        signoff: 'stale',
        verification: 'stale',
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Verification evidence is stale' }],
      },
      approvals: { spec: false, signoff: true },
    })

    expect(result.change.state).toBe('done')
    // The committed recovery check-declared action takes precedence over the phase intent.
    expect(result.nextAction.action).toMatchObject({ kind: 'approve-signoff' })
    expect(result.nextAction.intent).toBeNull()
    expect(JSON.stringify(result.nextAction)).not.toMatch(CLI_SYNTAX)
  })

  it('reports the approve-signoff action when verification is current', async () => {
    const result = await invalidateWithRecovery({
      change: changeIn(PATH_TO_ARCHIVABLE),
      recovery: { cause: 'signoff', from: 'archivable', to: 'done' },
      verdict: {
        signoff: 'stale',
        verification: 'valid',
        blockers: [{ code: 'SIGNOFF_STALE', message: 'Sign-off is stale' }],
      },
      approvals: { spec: false, signoff: true },
    })

    expect(result.change.state).toBe('done')
    expect(result.nextAction.action).toMatchObject({ kind: 'approve-signoff' })
    expect(result.nextAction.intent).toBeNull()
    expect(JSON.stringify(result.nextAction)).not.toMatch(CLI_SYNTAX)
  })

  it('reports the design intent when spec consent recovery commits designing', async () => {
    const result = await invalidateWithRecovery({
      change: changeIn(['designing', 'ready', 'implementing']),
      recovery: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
      verdict: {
        specApproval: 'stale',
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      },
      approvals: { spec: true, signoff: false },
    })

    expect(result.change.state).toBe('designing')
    expect(result.nextAction.intent).toBe('design')
    expect(result.nextAction.action).toBeUndefined()
    expect(JSON.stringify(result.nextAction)).not.toMatch(CLI_SYNTAX)
  })
})
