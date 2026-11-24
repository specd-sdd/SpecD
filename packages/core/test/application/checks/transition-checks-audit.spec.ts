import { describe, expect, it, vi } from 'vitest'
import { createWorkflowTaskCompletion } from '../../../src/application/checks/workflow-task-completion.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { type CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { buildCheckExecutionContext } from '../../../src/application/services/execute-matching-predicates.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { workspaceReadOnly } from '../../../src/domain/checks/workspace-read-only.js'
import { fail } from '../../../src/domain/services/transition-checks.js'
import {
  type Check,
  type CustomCheckDefinition,
} from '../../../src/domain/services/transition-checks.js'
import {
  makeArtifactType,
  makeChange,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeSchema,
  makeWorkflowStep,
} from '../use-cases/helpers.js'

const zero = { complete: 0, incomplete: 0, total: 0 }

function makeCountTasks(): { countTasks: CountTasks; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue({ byArtifact: {}, total: zero })
  return { countTasks: { execute } as unknown as CountTasks, execute }
}

function taskGatedSchema(): ReturnType<typeof makeSchema> {
  return makeSchema({
    artifacts: [
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: { incompletePattern: 'x' },
      }),
    ],
    workflow: [makeWorkflowStep('verifying', { requiresTaskCompletion: ['tasks'] })],
  })
}

function ctxWith(passMemo: Map<string, unknown>) {
  return buildCheckExecutionContext({
    change: makeChange('c1'),
    schema: taskGatedSchema(),
    attempt: { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
    approvals: { spec: false, signoff: false },
    passMemo,
  })
}

describe('transition checks audit', () => {
  describe('CountTasks memo lives on passMemo', () => {
    it('counts at most once per pass and recounts on the next pass with the same instance', async () => {
      const { countTasks, execute } = makeCountTasks()
      const check = createWorkflowTaskCompletion({ countTasks })

      const firstPass = new Map<string, unknown>()
      await check.execute(ctxWith(firstPass))
      await check.execute(ctxWith(firstPass))
      expect(execute).toHaveBeenCalledTimes(1)

      await check.execute(ctxWith(new Map<string, unknown>()))
      expect(execute).toHaveBeenCalledTimes(2)
    })

    it('does not cache on the check instance when no passMemo is supplied', async () => {
      const { countTasks, execute } = makeCountTasks()
      const check = createWorkflowTaskCompletion({ countTasks })
      const ctx = buildCheckExecutionContext({
        change: makeChange('c1'),
        schema: taskGatedSchema(),
        attempt: { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
        approvals: { spec: false, signoff: false },
      })
      await check.execute(ctx)
      await check.execute(ctx)
      expect(execute).toHaveBeenCalledTimes(2)
    })
  })

  describe('no static action on checks', () => {
    it('declares no action on any built-in check instance', () => {
      const { countTasks } = makeCountTasks()
      const built = createWorkflowCheckRegistry({
        countTasks,
        runStepHooks: makeRunStepHooks(),
        readyFacts: {
          changes: {} as never,
          listWorkspaces: makeListWorkspaces(),
          parsers: makeNoopParsers(),
          extractorTransforms: new Map(),
          workspaceRoutes: [],
        },
        detectImplLinksInScope,
      })
      const instances = Object.values(built.checks) as Check[]
      expect(instances.length).toBeGreaterThan(5)
      for (const check of instances) {
        expect('action' in check, check.id).toBe(false)
      }
      expect('action' in workspaceReadOnly).toBe(false)
    })

    it('rejects a static action on Check and CustomCheckDefinition at compile time', () => {
      const staticActionCheck: Check = {
        id: 'x.y',
        label: 'Checking x',
        kind: 'predicate',
        // @ts-expect-error Check declares no static action; actions travel on CheckResult
        action: { kind: 'approve-spec' },
        execute: () => Promise.resolve(fail('x.y', 'X', 'x')),
      }
      const staticActionDefinition: CustomCheckDefinition = {
        id: 'y',
        label: 'Checking y',
        // @ts-expect-error CustomCheckDefinition declares no static action
        action: { kind: '@acme.y' },
        execute: () => Promise.resolve(fail('y', 'Y', 'y')),
      }
      expect(staticActionCheck.id).toBe('x.y')
      expect(staticActionDefinition.id).toBe('y')
    })
  })

  describe('plugin action kinds', () => {
    it('keeps any action kind on a failing CheckResult without validating its namespace', () => {
      const namespaced = fail('@audit.run', 'AUDIT', 'bad', undefined, 'predicate', 'Auditing', {
        kind: '@audit.fix',
        guidance: 'Run the audit fixer',
      })
      const bare = fail('@audit.run', 'AUDIT', 'bad', undefined, 'predicate', 'Auditing', {
        kind: 'plain-kind',
      })
      expect(namespaced.action).toEqual({ kind: '@audit.fix', guidance: 'Run the audit fixer' })
      expect(bare.action).toEqual({ kind: 'plain-kind' })
    })
  })
})
