import { runTasksEmpty } from '../../domain/checks/workflow-tasks-empty.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  skip,
  type TaskCompletionCounts,
} from '../../domain/services/transition-checks.js'
import { type CountTasks } from '../use-cases/count-tasks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * `workflow.tasksEmpty` predicate check.
 */
class WorkflowTasksEmptyCheck extends WorkflowCheck {
  private readonly _countTasks: CountTasks

  /**
   * Check identifier.
   */
  override get id(): CheckId {
    return 'workflow.tasksEmpty'
  }

  /**
   * Check kind.
   */
  override get kind(): CheckKind {
    return 'predicate'
  }

  /**
   * Creates the tasks-empty predicate.
   *
   * @param countTasks - Task-completion query port
   */
  constructor(countTasks: CountTasks) {
    super()
    this._countTasks = countTasks
  }

  /**
   * Validates that tasks are either complete or completely empty before skipping
   * an intermediate workflow step (e.g. `implementing`).
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override async execute(ctx: CheckExecutionContext) {
    if (ctx.attempt.scope !== 'step-skip') {
      return skip('workflow.tasksEmpty')
    }
    const taskCounts = await this._loadCounts(ctx)
    return runTasksEmpty({
      schema: ctx.schema,
      taskCounts,
    })
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
 * Creates the `workflow.tasksEmpty` predicate check.
 *
 * @param deps - CountTasks port
 * @param deps.countTasks - Shared task counter
 * @returns WorkflowCheck-compatible instance
 */
export function createWorkflowTasksEmpty(deps: { readonly countTasks: CountTasks }): Check {
  return new WorkflowTasksEmptyCheck(deps.countTasks)
}
