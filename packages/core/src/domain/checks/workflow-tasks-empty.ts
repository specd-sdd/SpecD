import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
  type TaskCompletionCounts,
} from '../services/transition-checks.js'
import { type Schema } from '../value-objects/schema.js'

/** Facts required for running `workflow.tasksEmpty`. */
export interface WorkflowTasksEmptyFacts {
  readonly schema: Schema
  readonly taskCounts: {
    readonly byArtifact: Readonly<Record<string, TaskCompletionCounts>>
    readonly total: TaskCompletionCounts
  }
}

/**
 * Validates that tasks are either complete or completely empty before skipping
 * the `implementing` step.
 *
 * @param facts - Schema and aggregated task counts
 * @returns Pass if 0 tasks or 0 incomplete tasks; fail otherwise
 */
export function runTasksEmpty(facts: WorkflowTasksEmptyFacts): CheckResult {
  if (facts.taskCounts.total.total === 0 || facts.taskCounts.total.incomplete === 0) {
    return {
      ...pass('workflow.tasksEmpty'),
      details: {
        byArtifact: facts.taskCounts.byArtifact,
        total: facts.taskCounts.total,
      },
    }
  }

  return fail(
    'workflow.tasksEmpty',
    'INCOMPLETE_TASKS',
    `Cannot skip implementing step: ${String(facts.taskCounts.total.incomplete)} incomplete tasks remain in tasks.md`,
    {
      incomplete: facts.taskCounts.total.incomplete,
      complete: facts.taskCounts.total.complete,
      total: facts.taskCounts.total.total,
      byArtifact: facts.taskCounts.byArtifact,
    },
  )
}

/**
 * Domain stub execute. Application host provides I/O and task counts.
 *
 * @param ctx - Host attempt context
 * @returns Passing placeholder result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  void ctx
  return Promise.resolve(pass('workflow.tasksEmpty'))
}

/** Built-in `workflow.tasksEmpty` check instance. */
export const workflowTasksEmpty: Check = {
  id: 'workflow.tasksEmpty',
  label: CHECK_LABELS['workflow.tasksEmpty'],
  kind: 'predicate',
  execute,
}
