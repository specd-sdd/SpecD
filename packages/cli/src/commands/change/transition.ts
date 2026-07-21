import { type Command } from 'commander'
import {
  type ChangeState,
  type HookPhaseSelector,
  type TransitionProgressEvent,
  type OnTransitionProgress,
  VALID_TRANSITIONS,
  InvalidStateTransitionError,
} from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, serializeOutput, type OutputFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'
import { createHookProgressPresenter, type HookPresenterEvent } from './_hook-progress-presenter.js'

/**
 * Renders the separator written to stderr after transition hooks complete.
 *
 * @param result - Aggregate hook completion counts observed during the transition.
 * @param result.hooks - Total number of hooks observed.
 * @param result.done - Hooks that completed successfully.
 * @param result.failed - Hooks that failed.
 * @returns One-line summary marker followed by a blank line.
 */
function renderAllHooksDoneMarker(result: { hooks: number; done: number; failed: number }): string {
  return `[all hooks done] hooks=${result.hooks} done=${result.done} failed=${result.failed} -------------------------------------\n\n`
}

/**
 * Writes one structured stream record for machine-readable transition output.
 *
 * @param format - Structured output format.
 * @param record - Stream record payload.
 */
function writeStructuredRecord(format: Exclude<OutputFormat, 'text'>, record: unknown): void {
  process.stdout.write(`${serializeOutput(record, format)}\n`)
}

const VALID_HOOK_PHASES = new Set<HookPhaseSelector>([
  'source.pre',
  'source.post',
  'target.pre',
  'target.post',
  'all',
])

/** All valid `ChangeState` values. */
const VALID_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/**
 * Validates the user-facing target selection arguments.
 *
 * @param step - The explicit step argument, if provided
 * @param useNext - Whether `--next` was requested
 * @param format - The CLI output format for structured errors
 * @returns Nothing. Throws/terminates the process when the invocation shape is invalid.
 */
function validateRequestedTarget(
  step: string | undefined,
  useNext: boolean,
  format?: string,
): void {
  if (step !== undefined && useNext) {
    return cliError('<step> and --next are mutually exclusive', format)
  }

  if (step === undefined && !useNext) {
    return cliError('either <step> or --next is required', format)
  }

  if (step !== undefined && !(VALID_STATES as string[]).includes(step)) {
    return cliError(`invalid state '${step}'. valid states: ${VALID_STATES.join(', ')}`, format)
  }
}

/**
 * Resolves the effective target requested by the CLI invocation.
 *
 * @param fromState - The change's current lifecycle state
 * @param step - The explicit step argument, if provided
 * @param useNext - Whether `--next` was requested
 * @param format - The CLI output format for structured errors
 * @returns The target state to pass to the transition use case
 */
function resolveRequestedTarget(
  fromState: ChangeState,
  step: string | undefined,
  useNext: boolean,
  format?: string,
): ChangeState {
  if (step !== undefined) {
    return step as ChangeState
  }

  return resolveNextTarget(fromState, format)
}

/**
 * Resolves the next logical lifecycle target for `--next`.
 *
 * @param fromState - The change's current lifecycle state
 * @param format - The CLI output format for structured errors
 * @returns The next transition target
 */
function resolveNextTarget(fromState: ChangeState, format?: string): ChangeState {
  switch (fromState) {
    case 'drafting':
      return 'designing'
    case 'designing':
      return 'ready'
    case 'ready':
      return 'implementing'
    case 'spec-approved':
      return 'implementing'
    case 'implementing':
      return 'verifying'
    case 'verifying':
      return 'done'
    case 'done':
      return 'archivable'
    case 'signed-off':
      return 'archivable'
    case 'pending-spec-approval':
      return cliError(
        'cannot advance with --next: change is waiting for human spec approval',
        format,
      )
    case 'pending-signoff':
      return cliError('cannot advance with --next: change is waiting for human signoff', format)
    case 'archivable':
      return cliError('cannot advance with --next: archiving is not a lifecycle transition', format)
    case 'archiving':
      return cliError('cannot advance with --next: archiving is a terminal state', format)
  }
}

/**
 * Builds an `OnTransitionProgress` callback that renders step-by-step
 * feedback to stderr in text format and stdout stream records for structured formats.
 *
 * @param format - The CLI output format for visual or structured progress
 * @returns The progress callback and collected events
 */
function makeProgressRenderer(format: OutputFormat): {
  onProgress: OnTransitionProgress
  events: TransitionProgressEvent[]
  finishHookStream(): void
} {
  const events: TransitionProgressEvent[] = []
  const presenter = createHookProgressPresenter({
    format,
    stream: format === 'text' ? process.stderr : process.stdout,
    autoFinalizeOnDone: true,
  })
  let sawHookEvent = false
  let renderedHookCompletion = false
  const hookResults = new Map<string, boolean>()

  const hookKeyFor = (event: Extract<HookPresenterEvent, { hookId: string }>): string =>
    `${event.phase ?? 'none'}:${event.hookId}`

  const finishHookStream = (): void => {
    presenter.flush()
    if (format !== 'text' || !sawHookEvent || renderedHookCompletion) return
    const doneCount = Array.from(hookResults.values()).filter(Boolean).length
    const failedCount = hookResults.size - doneCount
    process.stderr.write(
      renderAllHooksDoneMarker({
        hooks: hookResults.size,
        done: doneCount,
        failed: failedCount,
      }),
    )
    renderedHookCompletion = true
  }

  const onProgress: OnTransitionProgress = (evt) => {
    events.push(evt)

    switch (evt.type) {
      case 'requires-check': {
        if (format !== 'text') {
          writeStructuredRecord(format, { stream: 'change-transition', event: evt })
          break
        }
        const mark = evt.satisfied ? '✓' : '✗'
        const status = evt.satisfied ? 'satisfied' : 'not satisfied'
        process.stderr.write(`  ${mark} requires ${evt.artifactId} [${status}]\n`)
        break
      }
      case 'hook-start':
      case 'hook-output':
      case 'hook-heartbeat': {
        sawHookEvent = true
        presenter.onEvent(evt)
        break
      }
      case 'hook-done': {
        sawHookEvent = true
        hookResults.set(hookKeyFor(evt), evt.success)
        presenter.onEvent(evt)
        break
      }
      case 'transitioned': {
        finishHookStream()
        if (format !== 'text') {
          writeStructuredRecord(format, { stream: 'change-transition', event: evt })
          break
        }
        process.stderr.write(`  ✓ ${evt.from} → ${evt.to}\n`)
        break
      }
    }
  }

  return { onProgress, events, finishHookStream }
}

/**
 * Registers the `change transition` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeTransition(parent: Command): void {
  parent
    .command('transition <name> [step]')
    .allowExcessArguments(false)
    .description(
      'Transition a change to a new lifecycle state (e.g. designing → ready → implementing → verifying).',
    )
    .option('--next', 'transition to the next logical lifecycle step')
    .option(
      '--skip-hooks <phases>',
      'skip hook phases (source.pre,source.post,target.pre,target.post,all)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Stream records on stdout:
    { stream: "hook-progress", event: ... }
    { stream: "change-transition", event: ... }
    { stream: "change-transition", event: { type: "complete", result: ... } }
`,
    )
    .action(
      async (
        name: string,
        step: string | undefined,
        opts: { format: string; config?: string; next?: boolean; skipHooks?: string },
      ) => {
        const fmt = parseFormat(opts.format)
        try {
          validateRequestedTarget(step, opts.next ?? false, opts.format)

          const skipHookPhases =
            opts.skipHooks !== undefined
              ? parseCommaSeparatedValues(opts.skipHooks, VALID_HOOK_PHASES, '--skip-hooks')
              : new Set<HookPhaseSelector>()

          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const statusResult = await kernel.changes.status.execute({
            name,
            refreshImplementationTracking: false,
          })
          const statusBefore = statusResult.change
          if (statusBefore === undefined) {
            cliError(`change '${name}' is drafted; restore it before transitioning`, opts.format)
          }
          const fromState = statusBefore.state
          const requestedTarget = resolveRequestedTarget(
            fromState,
            step,
            opts.next ?? false,
            opts.format,
          )

          const progressRenderer = makeProgressRenderer(fmt)

          try {
            const result = await kernel.changes.transition.execute(
              {
                name,
                to: requestedTarget,
                skipHookPhases,
              },
              progressRenderer.onProgress,
            )

            if (fmt === 'text') {
              output(`transitioned ${name}: ${fromState} → ${result.change.state}`, 'text')
            } else {
              writeStructuredRecord(fmt, {
                stream: 'change-transition',
                event: {
                  type: 'complete',
                  result: {
                    result: 'ok',
                    name,
                    from: fromState,
                    to: result.change.state,
                  },
                },
              })
            }
          } catch (err) {
            progressRenderer.finishHookStream()
            if (err instanceof InvalidStateTransitionError) {
              const status = await kernel.changes.status.execute({
                name,
                refreshImplementationTracking: false,
              })

              if (fmt === 'text') {
                process.stderr.write(`error: ${err.message}\n`)
                for (const b of status.blockers) {
                  process.stderr.write(`! ${b.code}: ${b.message}\n`)
                }
                process.stderr.write('\n')
                process.stderr.write('repair guide:\n')
                process.stderr.write(`  target:  ${status.nextAction.targetStep}\n`)
                process.stderr.write(`  command: ${status.nextAction.command ?? '(none)'}\n`)
                process.stderr.write(`  reason:  ${status.nextAction.reason}\n`)
                process.exit(1)
              } else {
                writeStructuredRecord(fmt, {
                  stream: 'change-transition',
                  event: {
                    type: 'complete',
                    result: {
                      result: 'failure',
                      name,
                      from: fromState,
                      to: requestedTarget,
                      blockers: status.blockers,
                      nextAction: status.nextAction,
                    },
                  },
                })
                process.exit(1)
              }
            }
            throw err
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
