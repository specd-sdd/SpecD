import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'

/** Facts for `workflow.requires`. */
export interface WorkflowRequiresFacts {
  readonly schema: Schema
  readonly target: ChangeState
  readonly effectiveStatusByArtifact: ReadonlyMap<string, ArtifactStatus>
}

/**
 * Workflow `requires` on the target step. Recovery exclusion is registry binding,
 * not this runner.
 *
 * @param facts - Schema, target, and artifact statuses
 * @returns Skip, pass, or a status-specific blocker code
 */
export function run(facts: WorkflowRequiresFacts): CheckResult {
  const step = facts.schema.workflowStep(facts.target)
  if (step === null || step.requires.length === 0) {
    return skip('workflow.requires')
  }
  const blocking = step.requires.filter((artifactId) => {
    const status = facts.effectiveStatusByArtifact.get(artifactId) ?? 'missing'
    return status !== 'complete' && status !== 'skipped'
  })
  if (blocking.length === 0) {
    return pass('workflow.requires')
  }
  const artifactId = blocking[0]
  if (artifactId === undefined) {
    return pass('workflow.requires')
  }
  const status = facts.effectiveStatusByArtifact.get(artifactId) ?? 'missing'
  const { code, message } = requiresFailure(artifactId, status)
  return fail('workflow.requires', code, message, { artifactId, status })
}

/**
 * Maps a blocking artifact status to a public blocker code and message.
 *
 * @param artifactId - Required artifact that failed
 * @param status - Effective artifact status
 * @returns Blocker code and human-readable message
 */
function requiresFailure(
  artifactId: string,
  status: ArtifactStatus,
): { readonly code: string; readonly message: string } {
  if (status === 'pending-review') {
    return {
      code: 'REVIEW_REQUIRED',
      message: `Required artifact '${artifactId}' requires semantic consistency review`,
    }
  }
  if (status === 'drifted-pending-review') {
    return {
      code: 'ARTIFACT_DRIFT',
      message: `Required artifact '${artifactId}' drifted since validation and requires semantic consistency review`,
    }
  }
  if (status === 'pending-parent-artifact-review') {
    return {
      code: 'PENDING_PARENT_REVIEW',
      message: `Required artifact '${artifactId}' is blocked by an upstream review state`,
    }
  }
  return {
    code: 'INCOMPLETE_ARTIFACT',
    message: `Required artifact '${artifactId}' is '${status}'`,
  }
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  if (ctx.attempt.scope !== 'transition') {
    return Promise.resolve(skip('workflow.requires'))
  }
  return Promise.resolve(
    run({
      schema: ctx.schema,
      target: ctx.attempt.to,
      effectiveStatusByArtifact: ctx.effectiveStatusByArtifact,
    }),
  )
}

/** Reusable `workflow.requires` check. Registry bindings decide when it runs. */
export const workflowRequires: Check = {
  id: 'workflow.requires',
  label: CHECK_LABELS['workflow.requires'],
  kind: 'predicate',
  execute,
}
