import {
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  type CheckResult,
} from '../../domain/services/transition-checks.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type OnHookProgress, type RunStepHooks } from '../use-cases/run-step-hooks.js'
import { WorkflowCheck } from './workflow-check.js'

/**
 * Resolves the workflow step for a hook effect.
 *
 * @param phase - `pre` (enter target / archiving) or `post` (leave source / archiving)
 * @param ctx - Host attempt context
 * @returns Step name for RunStepHooks
 */
export function hookStep(phase: 'pre' | 'post', ctx: CheckExecutionContext): ChangeState {
  if (ctx.attempt.scope === 'archive') {
    return 'archiving'
  }
  return phase === 'post' ? ctx.attempt.from : ctx.attempt.to
}

/**
 * Maps a {@link RunStepHooks} progress event onto the generic check progress bus.
 *
 * @param check - Hook effect check identity
 * @param check.id - Check identifier (`hook.pre` / `hook.post`)
 * @param check.label - Gerund progress label
 * @param evt - RunStepHooks progress event
 * @param sink - Optional check progress sink
 */
export function emitHookAsCheckProgress(
  check: { readonly id: CheckId; readonly label: string },
  evt: Parameters<OnHookProgress>[0],
  sink: CheckExecutionContext['onCheckProgress'],
): void {
  if (sink === undefined) {
    return
  }
  const base = { type: 'check-progress' as const, id: check.id, label: check.label }
  switch (evt.type) {
    case 'hook-start':
      sink({
        ...base,
        detail: 'hook-start',
        hookId: evt.hookId,
        command: evt.command,
        message: evt.command,
      })
      break
    case 'hook-output':
      sink({
        ...base,
        detail: 'hook-output',
        hookId: evt.hookId,
        stream: evt.stream,
        line: evt.line,
      })
      break
    case 'hook-heartbeat':
      sink({
        ...base,
        detail: 'hook-heartbeat',
        hookId: evt.hookId,
        elapsedMs: evt.elapsedMs,
        message: `${Math.floor(evt.elapsedMs / 1000)}s`,
      })
      break
    case 'hook-done':
      sink({
        ...base,
        detail: 'hook-done',
        hookId: evt.hookId,
        success: evt.success,
        exitCode: evt.exitCode,
      })
      break
  }
}

/**
 * Shared `hook.pre` / `hook.post` effect.
 */
export class HookEffectCheck extends WorkflowCheck {
  private readonly _id: Extract<CheckId, 'hook.pre' | 'hook.post'>
  private readonly _phase: 'pre' | 'post'
  private readonly _runStepHooks: RunStepHooks

  /**
   * Stable check id.
   *
   * @returns Check identifier
   */
  override get id(): CheckId {
    return this._id
  }

  /**
   * Predicate vs `run:` hook.
   *
   * @returns Check kind
   */
  override get kind(): CheckKind {
    return 'effect'
  }

  /**
   * Creates a hook effect check.
   *
   * @param id - Stable effect id
   * @param phase - RunStepHooks phase
   * @param runStepHooks - Hook runner port
   */
  constructor(
    id: Extract<CheckId, 'hook.pre' | 'hook.post'>,
    phase: 'pre' | 'post',
    runStepHooks: RunStepHooks,
  ) {
    super()
    this._id = id
    this._phase = phase
    this._runStepHooks = runStepHooks
  }

  /**
   * Runs schema `run:` hooks for this effect via {@link RunStepHooks}.
   * Skip selectors live on `ctx.skipHookPhases` (`all`, `target.pre`/`source.post`,
   * archive `pre`/`post`) — not on the use-case loop.
   *
   * @param ctx - Host attempt (optional `onCheckProgress`)
   * @returns Pass, skip, or fail
   */
  override async execute(ctx: CheckExecutionContext): Promise<CheckResult> {
    const skip = new Set(ctx.skipHookPhases ?? [])
    if (skip.has('all')) {
      return this.skip()
    }
    if (ctx.attempt.scope === 'archive') {
      if (this._phase === 'pre' && skip.has('pre')) {
        return this.skip()
      }
      if (this._phase === 'post' && skip.has('post')) {
        return this.skip()
      }
    } else if (this._phase === 'pre' && skip.has('target.pre')) {
      return this.skip()
    } else if (this._phase === 'post' && skip.has('source.post')) {
      return this.skip()
    }
    const step = hookStep(this._phase, ctx)
    if (ctx.attempt.scope !== 'archive' && ctx.schema.workflowStep(step) === null) {
      return this.skip()
    }
    const onProgress: OnHookProgress = (evt) => {
      emitHookAsCheckProgress(this, evt, ctx.onCheckProgress)
    }
    const result = await this._runStepHooks.execute(
      { name: ctx.change.name, step, phase: this._phase },
      onProgress,
    )
    if (result.success) {
      return this.pass()
    }
    const failedCommands = result.hooks.filter((hook) => !hook.success).map((hook) => hook.command)
    const failed = result.failedHooks[0]
    if (failed === undefined) {
      return this.fail('HOOK_FAILED', `Hook phase '${this._phase}' failed`, {
        commands: failedCommands,
      })
    }
    return this.fail('HOOK_FAILED', `Hook failed: ${failed.command}`, {
      command: failed.command,
      commands: failedCommands,
      exitCode: failed.exitCode,
      stderr: failed.stderr,
    })
  }
}
