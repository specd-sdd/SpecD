import { run as runTaskCompletion } from '../../domain/checks/workflow-task-completion.js'
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
    if (ctx.attempt.scope !== 'transition') {
      return skip('workflow.taskCompletion')
    }
    const memoKey = 'workflow.taskCompletion:countTasks'
    let taskCounts = ctx.passMemo?.get(memoKey) as
      | {
          readonly byArtifact: Readonly<Record<string, TaskCompletionCounts>>
          readonly total: TaskCompletionCounts
        }
      | undefined
    if (taskCounts === undefined) {
      taskCounts = await this._countTasks.execute({ change: ctx.change })
      ctx.passMemo?.set(memoKey, taskCounts)
    }
    return runTaskCompletion({
      schema: ctx.schema,
      target: ctx.attempt.to,
      taskCounts,
    })
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
