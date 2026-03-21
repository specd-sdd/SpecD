import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { type HookEntry } from '../../domain/value-objects/workflow-step.js'
import { StepNotValidError } from '../../domain/errors/step-not-valid-error.js'
import { HookNotFoundError } from '../../domain/errors/hook-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type HookRunner, type TemplateVariables } from '../ports/hook-runner.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'

/** Valid `ChangeState` values for step validation. */
const CHANGE_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/** Progress event emitted during hook execution. */
export type HookProgressEvent =
  | { type: 'hook-start'; hookId: string; command: string }
  | { type: 'hook-done'; hookId: string; success: boolean; exitCode: number }

/** Callback for receiving hook execution progress events. */
export type OnHookProgress = (event: HookProgressEvent) => void

/** Input for the {@link RunStepHooks} use case. */
export interface RunStepHooksInput {
  readonly name: string
  readonly step: string
  readonly phase: 'pre' | 'post'
  readonly only?: string | undefined
}

/** Per-hook execution result. */
export interface RunStepHookEntry {
  readonly id: string
  readonly command: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly success: boolean
}

/** Result returned by {@link RunStepHooks}. */
export interface RunStepHooksResult {
  readonly hooks: readonly RunStepHookEntry[]
  readonly success: boolean
  readonly failedHook: RunStepHookEntry | null
}

/**
 * Executes `run:` hooks for a given workflow step and phase.
 *
 * Resolves hooks from the schema, builds template variables from the
 * active change, and executes them via `HookRunner` with fail-fast
 * (pre) or fail-soft (post) semantics.
 */
export class RunStepHooks {
  private readonly _changes: ChangeRepository
  private readonly _hooks: HookRunner
  private readonly _schemaProvider: SchemaProvider

  /**
   * Creates a new `RunStepHooks` use case.
   *
   * @param changes - Repository for loading change entities
   * @param hooks - Hook runner for executing shell commands
   * @param schemaProvider - Provider for the fully-resolved schema
   */
  constructor(changes: ChangeRepository, hooks: HookRunner, schemaProvider: SchemaProvider) {
    this._changes = changes
    this._hooks = hooks
    this._schemaProvider = schemaProvider
  }

  /**
   * Executes `run:` hooks for the given step and phase.
   *
   * @param input - The step name, phase, and optional hook filter
   * @param onProgress - Optional callback for hook execution progress events
   * @returns Per-hook execution results with overall success status
   */
  async execute(
    input: RunStepHooksInput,
    onProgress?: OnHookProgress,
  ): Promise<RunStepHooksResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()
    if (schema === null) throw new SchemaNotFoundError('(provider)')

    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    // Validate step is a valid ChangeState
    if (!(CHANGE_STATES as string[]).includes(input.step)) {
      throw new StepNotValidError(input.step)
    }

    const workflowStep = schema.workflowStep(input.step)
    if (workflowStep === null) {
      return { hooks: [], success: true, failedHook: null }
    }

    // Collect run: hooks from schema
    let runHooks = this._collectHooks(workflowStep.hooks[input.phase])

    // --only filter
    if (input.only !== undefined) {
      const match = runHooks.find((h) => h.id === input.only)
      if (match === undefined) {
        // Check if it's an instruction hook
        const instrMatch = workflowStep.hooks[input.phase].find(
          (h) => h.id === input.only && h.type === 'instruction',
        )
        if (instrMatch !== undefined) {
          throw new HookNotFoundError(input.only, 'wrong-type')
        }
        throw new HookNotFoundError(input.only, 'not-found')
      }
      runHooks = [match]
    }

    if (runHooks.length === 0) {
      return { hooks: [], success: true, failedHook: null }
    }

    // Build contextual variables
    const workspace = change.workspaces[0] ?? 'default'
    const variables: TemplateVariables = {
      change: { name: change.name, workspace, path: this._changes.changePath(change) },
    }

    // Execute hooks
    const results: RunStepHookEntry[] = []
    let failedHook: RunStepHookEntry | null = null

    for (const hook of runHooks) {
      onProgress?.({ type: 'hook-start', hookId: hook.id, command: hook.command })
      const result = await this._hooks.run(hook.command, variables)
      const entry: RunStepHookEntry = {
        id: hook.id,
        command: hook.command,
        exitCode: result.exitCode(),
        stdout: result.stdout(),
        stderr: result.stderr(),
        success: result.isSuccess(),
      }
      results.push(entry)
      onProgress?.({
        type: 'hook-done',
        hookId: hook.id,
        success: result.isSuccess(),
        exitCode: result.exitCode(),
      })

      if (!result.isSuccess()) {
        if (input.phase === 'pre') {
          // Fail-fast: stop on first failure
          return { hooks: results, success: false, failedHook: entry }
        }
        if (failedHook === null) failedHook = entry
      }
    }

    return {
      hooks: results,
      success: results.every((r) => r.success),
      failedHook,
    }
  }

  /**
   * Collects `run:` hooks from schema for the given phase.
   *
   * @param schemaHooks - Schema-level hooks for this step and phase
   * @returns Schema hooks filtered to `type === 'run'`
   */
  private _collectHooks(
    schemaHooks: readonly HookEntry[],
  ): readonly Extract<HookEntry, { type: 'run' }>[] {
    return schemaHooks.filter((h): h is Extract<HookEntry, { type: 'run' }> => h.type === 'run')
  }
}
