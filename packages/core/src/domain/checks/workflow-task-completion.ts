import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
  type TaskCompletionCounts,
} from '../services/transition-checks.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'

/** Facts for `workflow.taskCompletion`. */
export interface WorkflowTaskCompletionFacts {
  readonly schema: Schema
  readonly target: ChangeState
  readonly taskCounts: {
    readonly byArtifact: Readonly<Record<string, TaskCompletionCounts>>
    readonly total: TaskCompletionCounts
  }
}

/**
 * Workflow `requiresTaskCompletion` on the target step. Recovery exclusion is
 * registry binding, not this runner.
 *
 * @param facts - Schema, target, and task counts
 * @returns Skip, pass, or `INCOMPLETE_TASKS`
 */
export function run(facts: WorkflowTaskCompletionFacts): CheckResult {
  const step = facts.schema.workflowStep(facts.target)
  if (step === null || step.requiresTaskCompletion.length === 0) {
    return {
      ...skip('workflow.taskCompletion'),
      details: { byArtifact: facts.taskCounts.byArtifact },
    }
  }
  for (const artifactId of step.requiresTaskCompletion) {
    const artifactType = facts.schema.artifact(artifactId)
    if (
      artifactType === null ||
      !artifactType.hasTasks ||
      artifactType.taskCompletionCheck === undefined
    ) {
      return fail(
        'workflow.taskCompletion',
        'INCOMPLETE_TASKS',
        `Artifact '${artifactId}' is gated for task completion but lacks task capability`,
        { reason: 'missing-task-capability', artifactId, byArtifact: facts.taskCounts.byArtifact },
      )
    }
    const counts = facts.taskCounts.byArtifact[artifactId]
    if (counts === undefined) {
      continue
    }
    if (counts.incomplete > 0) {
      return fail(
        'workflow.taskCompletion',
        'INCOMPLETE_TASKS',
        `Artifact '${artifactId}' has ${String(counts.incomplete)} incomplete tasks`,
        {
          artifactId,
          complete: counts.complete,
          incomplete: counts.incomplete,
          total: counts.total,
          byArtifact: facts.taskCounts.byArtifact,
        },
      )
    }
  }
  return {
    ...pass('workflow.taskCompletion'),
    details: { byArtifact: facts.taskCounts.byArtifact },
  }
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  void ctx
  return Promise.resolve(skip('workflow.taskCompletion'))
}

/** Reusable `workflow.taskCompletion` check. Registry bindings decide when it runs. */
export const workflowTaskCompletion: Check = {
  id: 'workflow.taskCompletion',
  label: CHECK_LABELS['workflow.taskCompletion'],
  kind: 'predicate',
  execute,
}
