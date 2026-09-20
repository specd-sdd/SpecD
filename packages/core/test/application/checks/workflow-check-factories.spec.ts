import { describe, expect, it, vi } from 'vitest'
import { createWorkflowTaskCompletion } from '../../../src/application/checks/workflow-task-completion.js'
import { createHookPre } from '../../../src/application/checks/hook-pre.js'
import { createHookPost } from '../../../src/application/checks/hook-post.js'
import { createProtocolEdge } from '../../../src/application/checks/protocol-edge.js'
import { WorkflowCheck } from '../../../src/application/checks/workflow-check.js'
import { type CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type RunStepHooks } from '../../../src/application/use-cases/run-step-hooks.js'
import { makeChange, makeSchema, makeWorkflowStep, testActor } from '../use-cases/helpers.js'
import { buildCheckExecutionContext } from '../../../src/application/services/execute-matching-predicates.js'

describe('workflow check factories', () => {
  it('given createWorkflowTaskCompletion, when built, then returns a WorkflowCheck-compatible instance', () => {
    const countTasks = { execute: vi.fn() } as unknown as CountTasks
    const check = createWorkflowTaskCompletion({ countTasks })
    expect(check).toBeInstanceOf(WorkflowCheck)
    expect(check.id).toBe('workflow.taskCompletion')
    expect(check.kind).toBe('predicate')
  })

  it('given createHookPre, when execute runs, then uses RunStepHooks from constructor deps', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      hooks: [],
      failedHooks: [],
    })
    const runStepHooks = { execute } as unknown as RunStepHooks
    const check = createHookPre({ runStepHooks })
    const change = makeChange('c1')
    change.transition('designing', testActor)
    const schema = makeSchema([], [makeWorkflowStep('designing'), makeWorkflowStep('ready')])
    const result = await check.execute(
      buildCheckExecutionContext({
        change,
        schema,
        attempt: {
          scope: 'transition',
          from: 'designing',
          to: 'ready',
          along: 'forward',
        },
        approvals: { spec: false, signoff: false },
      }),
    )
    expect(execute).toHaveBeenCalled()
    expect(result.outcome).toBe('pass')
  })

  it('given createProtocolEdge, when execute takes CheckExecutionContext, then evaluates without a snapshot bag', async () => {
    const check = createProtocolEdge()
    const change = makeChange('c1')
    change.transition('designing', testActor)
    const result = await check.execute(
      buildCheckExecutionContext({
        change,
        schema: makeSchema(),
        attempt: {
          scope: 'transition',
          from: 'designing',
          to: 'ready',
          along: 'forward',
        },
        approvals: { spec: false, signoff: false },
      }),
    )
    expect(result.outcome).toBe('pass')
  })

  it('given createHookPost, when built, then kind is effect', () => {
    const check = createHookPost({
      runStepHooks: { execute: vi.fn() } as unknown as RunStepHooks,
    })
    expect(check.kind).toBe('effect')
  })
})
