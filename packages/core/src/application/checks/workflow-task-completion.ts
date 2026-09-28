import { run as runTaskCompletion } from '../../domain/checks/workflow-task-completion.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  pass,
  skip,
  type TaskCompletionCounts,
} from '../../domain/services/transition-checks.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type CountTasks } from '../use-cases/count-tasks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `workflow.taskCompletion` predicate.
 */
class WorkflowTaskCompletionCheck extends WorkflowCheck {
  private readonly _countTasks: CountTasks

  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'workflow.taskCompletion'
  }

  /**
   * Predicate vs effect.
   *
   * @returns Check kind
   */
  override get kind(): CheckKind {
    return 'predicate'
  }

  /**
   * Creates the task-completion predicate.
   *
   * @param countTasks - Task-completion query port
   */
  constructor(countTasks: CountTasks) {
    super()
    this._countTasks = countTasks
  }

  /**
   * Counts tasks then applies the domain rule. Memoized on `ctx.passMemo` so one
   * evaluation pass shares a CountTasks call; the instance MUST NOT cache across executes.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override async execute(ctx: CheckExecutionContext) {
    if (ctx.attempt.scope !== 'transition' && ctx.attempt.scope !== 'archive') {
      return skip('workflow.taskCompletion')
    }
    const taskCounts = await this._loadCounts(ctx)
    if (ctx.attempt.scope === 'transition') {
      return runTaskCompletion({
        schema: ctx.schema,
        target: ctx.attempt.to,
        taskCounts,
      })
    }
    let sawRequiredStep = false
    for (const step of ctx.schema.workflow()) {
      if (step.requiresTaskCompletion.length === 0) continue
      sawRequiredStep = true
      const result = runTaskCompletion({
        schema: ctx.schema,
        target: step.step as ChangeState,
        taskCounts,
      })
      if (result.outcome === 'fail') return result
    }
    if (!sawRequiredStep) {
      return {
        ...skip('workflow.taskCompletion'),
        details: { byArtifact: taskCounts.byArtifact },
      }
    }
    return {
      ...pass('workflow.taskCompletion'),
      details: { byArtifact: taskCounts.byArtifact },
    }
  }

  /**
   * Loads checkbox counts once per predicate pass.
   *
   * @param ctx - Host attempt context
   * @returns Per-artifact and total counts
   */
  private async _loadCounts(ctx: CheckExecutionContext): Promise<{
    readonly byArtifact: Readonly<Record<string, TaskCompletionCounts>>
    readonly total: TaskCompletionCounts
  }> {
    const memoKey = 'workflow.taskCompletion:countTasks'
    const cached = ctx.passMemo?.get(memoKey) as
      | {
          readonly byArtifact: Readonly<Record<string, TaskCompletionCounts>>
          readonly total: TaskCompletionCounts
        }
      | undefined
    if (cached !== undefined) return cached
    const taskCounts = await this._countTasks.execute({ change: ctx.change })
    ctx.passMemo?.set(memoKey, taskCounts)
    return taskCounts
  }
}

/**
 * Creates the `workflow.taskCompletion` predicate check.
 *
 * @param deps - CountTasks port
 * @param deps.countTasks - Shared task counter
 * @returns WorkflowCheck-compatible instance
 */
export function createWorkflowTaskCompletion(deps: { readonly countTasks: CountTasks }): Check {
  return new WorkflowTaskCompletionCheck(deps.countTasks)
}
