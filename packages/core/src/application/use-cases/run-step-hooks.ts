import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { isWorkflowStepEnabled } from '../../domain/services/workflow-topology.js'
import { type HookEntry } from '../../domain/value-objects/workflow-step.js'
import { StepNotValidError } from '../../domain/errors/step-not-valid-error.js'
import { HookNotFoundError } from '../../domain/errors/hook-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ExternalHookRunner } from '../ports/external-hook-runner.js'
import {
  type HookResult,
  type HookRunner,
  type HookRunnerProgressEvent,
  type TemplateVariables,
} from '../ports/hook-runner.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { ResolveChangeSchema } from '../services/resolve-change-schema.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ExternalHookTypeNotRegisteredError } from '../errors/external-hook-type-not-registered-error.js'

/** Valid `ChangeState` values for step validation. */
const CHANGE_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/** Progress event emitted during hook execution. */
export type HookProgressEvent =
  | { type: 'hook-start'; hookId: string; command: string }
  | { type: 'hook-output'; hookId: string; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'hook-heartbeat'; hookId: string; elapsedMs: number }
  | { type: 'hook-done'; hookId: string; success: boolean; exitCode: number }
  | { type: 'hook-warning'; hookId: string; command: string; exitCode: number; stderr: string }

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
  readonly failedHooks: readonly RunStepHookEntry[]
  readonly warnings: readonly RunStepHookEntry[]
}

/**
 * Executes executable hooks for a given workflow step and phase.
 *
 * Resolves hooks from the schema, builds template variables from the
 * active change, and executes them via `HookRunner` with fail-fast
 * (pre) or fail-soft (post) semantics, respecting `onFailure: 'warn'`.
 */
export class RunStepHooks {
  private readonly _changes: ChangeRepository
  private readonly _archive: ArchiveRepository
  private readonly _hooks: HookRunner
  private readonly _externalHookRunners: ReadonlyMap<string, ExternalHookRunner>
  private readonly _schemaProvider: SchemaProvider
  private readonly _resolveChangeSchema: ResolveChangeSchema

  /**
   * Creates a new `RunStepHooks` use case.
   *
   * @param changes - Repository for loading change entities
   * @param archive - Repository for loading archived changes (fallback for post-archive hooks)
   * @param hooks - Hook runner for executing shell commands
   * @param externalHookRunners - External hook runners indexed by accepted type
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param resolveChangeSchema - Shared change schema resolver
   */
  constructor(
    changes: ChangeRepository,
    archive: ArchiveRepository,
    hooks: HookRunner,
    externalHookRunners: ReadonlyMap<string, ExternalHookRunner>,
    schemaProvider: SchemaProvider,
    resolveChangeSchema?: ResolveChangeSchema,
  ) {
    this._changes = changes
    this._archive = archive
    this._hooks = hooks
    this._externalHookRunners = externalHookRunners
    this._schemaProvider = schemaProvider
    this._resolveChangeSchema = resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)
  }

  /**
   * Executes executable hooks for the given step and phase.
   *
   * @param input - The step name, phase, and optional hook filter
   * @param onProgress - Optional callback for hook execution progress events
   * @returns Per-hook execution results with overall success status and warnings
   */
  async execute(
    input: RunStepHooksInput,
    onProgress?: OnHookProgress,
  ): Promise<RunStepHooksResult> {
    const change = await this._changes.get(input.name)

    // Fallback to archive for post-archive hooks
    if (change === null) {
      if (input.step === 'archiving' && input.phase === 'post') {
        const archived = await this._archive.get(input.name)
        if (archived === null) throw new ChangeNotFoundError(input.name)

        const { schema } = await this._resolveChangeSchema.execute({
          changeName: archived.name,
          schemaName: archived.schemaName,
          schemaVersion: archived.schemaVersion,
        })

        if (!(CHANGE_STATES as string[]).includes(input.step)) {
          throw new StepNotValidError(input.step)
        }

        const workflowStep = schema.workflowStep(input.step)
        if (workflowStep === null || !isWorkflowStepEnabled(input.step as ChangeState, schema)) {
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        }

        let runHooks = this._collectHooks(workflowStep.hooks[input.phase])

        if (input.only !== undefined) {
          const match = runHooks.find((h) => h.id === input.only)
          if (match === undefined) {
            const instrMatch = workflowStep.hooks[input.phase].find((h) => h.id === input.only)
            if (instrMatch !== undefined) {
              throw new HookNotFoundError(input.only, 'wrong-type')
            }
            throw new HookNotFoundError(input.only, 'not-found')
          }
          runHooks = [match]
        }

        if (runHooks.length === 0) {
          return { hooks: [], success: true, failedHooks: [], warnings: [] }
        }

        const variables: TemplateVariables = {
          change: {
            name: archived.name,
            archivedName: archived.archivedName,
            path: this._archive.archivePath(archived),
          },
        }

        return this._executeHooks(runHooks, variables, input.phase, onProgress)
      }

      throw new ChangeNotFoundError(input.name)
    }

    const { schema } = await this._resolveChangeSchema.execute({
      changeName: change.name,
      schemaName: change.schemaName,
      schemaVersion: change.schemaVersion,
    })

    // Validate step is a valid ChangeState
    if (!(CHANGE_STATES as string[]).includes(input.step)) {
      throw new StepNotValidError(input.step)
    }

    // A disabled step is never entered: no hooks in either phase, even with --only.
    const workflowStep = schema.workflowStep(input.step)
    if (workflowStep === null || !isWorkflowStepEnabled(input.step as ChangeState, schema)) {
      return { hooks: [], success: true, failedHooks: [], warnings: [] }
    }

    // Collect executable hooks from schema
    let runHooks = this._collectHooks(workflowStep.hooks[input.phase])

    // --only filter
    if (input.only !== undefined) {
      const match = runHooks.find((h) => h.id === input.only)
      if (match === undefined) {
        const instrMatch = workflowStep.hooks[input.phase].find((h) => h.id === input.only)
        if (instrMatch !== undefined) {
          throw new HookNotFoundError(input.only, 'wrong-type')
        }
        throw new HookNotFoundError(input.only, 'not-found')
      }
      runHooks = [match]
    }

    if (runHooks.length === 0) {
      return { hooks: [], success: true, failedHooks: [], warnings: [] }
    }

    const variables: TemplateVariables = {
      change: { name: change.name, path: this._changes.changePath(change) },
    }

    return this._executeHooks(runHooks, variables, input.phase, onProgress)
  }

  /**
   * Collects executable hooks from schema for the given phase.
   *
   * @param schemaHooks - Schema-level hooks for this step and phase
   * @returns Schema hooks filtered to executable types
   */
  private _collectHooks(
    schemaHooks: readonly HookEntry[],
  ): readonly Extract<HookEntry, { type: 'run' | 'external' }>[] {
    return schemaHooks.filter(
      (h): h is Extract<HookEntry, { type: 'run' | 'external' }> =>
        h.type === 'run' || h.type === 'external',
    )
  }

  /**
   * Executes a list of hooks with the given template variables.
   *
   * @param runHooks - The hooks to execute
   * @param variables - Template variables for command expansion
   * @param phase - The phase ('pre' for fail-fast, 'post' for fail-soft)
   * @param onProgress - Optional callback for hook execution progress events
   * @returns Per-hook execution results with overall success status and warnings
   */
  private async _executeHooks(
    runHooks: readonly Extract<HookEntry, { type: 'run' | 'external' }>[],
    variables: TemplateVariables,
    phase: 'pre' | 'post',
    onProgress?: OnHookProgress,
  ): Promise<RunStepHooksResult> {
    const results: RunStepHookEntry[] = []
    const failedHooks: RunStepHookEntry[] = []
    const warnings: RunStepHookEntry[] = []

    for (const hook of runHooks) {
      const command = hook.type === 'run' ? hook.command : `external:${hook.externalType}`
      onProgress?.({ type: 'hook-start', hookId: hook.id, command })
      const relayRunnerProgress = (event: HookRunnerProgressEvent): void => {
        switch (event.type) {
          case 'output':
            onProgress?.({
              type: 'hook-output',
              hookId: hook.id,
              stream: event.stream,
              line: event.line,
            })
            break
          case 'heartbeat':
            onProgress?.({
              type: 'hook-heartbeat',
              hookId: hook.id,
              elapsedMs: event.elapsedMs,
            })
            break
        }
      }
      const result =
        hook.type === 'run'
          ? await this._hooks.run(hook.command, variables, relayRunnerProgress)
          : await this._runExternalHook(hook, variables)
      const entry: RunStepHookEntry = {
        id: hook.id,
        command,
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
        if (hook.onFailure === 'warn') {
          warnings.push(entry)
          onProgress?.({
            type: 'hook-warning',
            hookId: hook.id,
            command,
            exitCode: result.exitCode(),
            stderr: result.stderr(),
          })
        } else {
          failedHooks.push(entry)
          if (phase === 'pre') {
            return { hooks: results, success: false, failedHooks, warnings }
          }
        }
      }
    }

    return {
      hooks: results,
      success: failedHooks.length === 0,
      failedHooks,
      warnings,
    }
  }

  /**
   * Executes an explicit external hook through the accepted-type runner index.
   *
   * @param hook - The explicit external hook entry
   * @param variables - Template variables for runtime expansion
   * @returns The workflow-compatible hook result
   * @throws {@link ExternalHookTypeNotRegisteredError} When no runner accepts the hook type
   */
  private async _runExternalHook(
    hook: Extract<HookEntry, { type: 'external' }>,
    variables: TemplateVariables,
  ): Promise<HookResult> {
    const runner = this._externalHookRunners.get(hook.externalType)
    if (runner === undefined) {
      throw new ExternalHookTypeNotRegisteredError(hook.externalType, hook.id)
    }
    return runner.run({ id: hook.id, type: hook.externalType, config: hook.config }, variables)
  }
}
