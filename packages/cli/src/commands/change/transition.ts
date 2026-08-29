import { type Command } from 'commander'
import {
  type ChangeState,
  type HookPhaseSelector,
  type TransitionProgressEvent,
  type OnTransitionProgress,
  InvalidStateTransitionError,
  ReadOnlyWorkspaceError,
  ArchiveDependencyMismatchError,
  ArchiveImplementationStateError,
} from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, serializeOutput, type OutputFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'
import { createCheckProgressPresenter } from './_check-progress-presenter.js'

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

/** All valid `ChangeState` values (argument validation only; not availability). */
const CHANGE_STATES = [
  'drafting',
  'designing',
  'ready',
  'pending-spec-approval',
  'spec-approved',
  'implementing',
  'verifying',
  'done',
  'pending-signoff',
  'signed-off',
  'archivable',
  'archiving',
] as const satisfies readonly ChangeState[]

/**
 * Returns whether `value` is a known change lifecycle state.
 *
 * @param value - Candidate step name from the CLI
 * @returns `true` when `value` is a `ChangeState`
 */
function isChangeState(value: string): value is ChangeState {
  return (CHANGE_STATES as readonly string[]).includes(value)
}

/** GetStatus payload used to fill the Repair Guide after a failed transition. */
type TransitionFailureStatus = Awaited<
  ReturnType<import('@specd/sdk').Kernel['changes']['status']['execute']>
>

/**
 * Typed transition failures that must render a Repair Guide from GetStatus.
 *
 * @param err - Caught rejection from `TransitionChange.execute`
 * @returns Whether the CLI should exit 1 with a repair guide
 */
function isRepairGuideError(err: unknown): boolean {
  return (
    err instanceof InvalidStateTransitionError ||
    err instanceof ReadOnlyWorkspaceError ||
    err instanceof ArchiveDependencyMismatchError ||
    err instanceof ArchiveImplementationStateError
  )
}

/**
 * Writes the text-mode Repair Guide from a GetStatus projection.
 *
 * @param err - The typed failure whose message is shown first
 * @param status - Fresh GetStatus result after the failed transition
 */
function writeTextRepairGuide(err: Error, status: TransitionFailureStatus): void {
  process.stderr.write(`error: ${err.message}\n`)
  for (const b of status.blockers) {
    process.stderr.write(
      b.label !== undefined
        ? `! ${b.code} — ${b.label}: ${b.message}\n`
        : `! ${b.code}: ${b.message}\n`,
    )
  }
  process.stderr.write('\n')
  process.stderr.write('repair guide:\n')
  process.stderr.write(`  target:  ${status.nextAction.targetStep}\n`)
  process.stderr.write(`  command: ${status.nextAction.command ?? '(none)'}\n`)
  process.stderr.write(`  reason:  ${status.nextAction.reason}\n`)
}

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

  if (step !== undefined && !isChangeState(step)) {
    return cliError(`invalid state '${step}'. valid states: ${CHANGE_STATES.join(', ')}`, format)
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
} {
  const events: TransitionProgressEvent[] = []
  const checkPresenter = createCheckProgressPresenter({
    format,
    streamName: 'change-transition',
    stream: format === 'text' ? process.stderr : process.stdout,
  })

  const onProgress: OnTransitionProgress = (evt) => {
    events.push(evt)

    switch (evt.type) {
      case 'check-start':
      case 'check-progress':
      case 'check-done':
        checkPresenter.onEvent(evt)
        break
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
      case 'task-completion-failed': {
        if (format !== 'text') {
          writeStructuredRecord(format, { stream: 'change-transition', event: evt })
          break
        }
        process.stderr.write(
          `  ✗ tasks incomplete for ${evt.artifactId} (${evt.incomplete}/${evt.total})\n`,
        )
        break
      }
      case 'transitioned': {
        if (format !== 'text') {
          writeStructuredRecord(format, { stream: 'change-transition', event: evt })
          break
        }
        process.stderr.write(`  ✓ ${evt.from} → ${evt.to}\n`)
        break
      }
    }
  }

  return { onProgress, events }
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
      'Transition a change to a new lifecycle state. Approval gates stay in ready/done; pending states drain in-flight work only.',
    )
    .option('--next', 'transition to the next logical lifecycle step')
    .option(
      '--allow-out-of-scope',
      'permit the hop when implementation links resolve outside the change scope (impl.linksInScope)',
    )
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
    { stream: "change-transition", event: { type: "check-start"|"check-progress"|"check-done"|… } }
    { stream: "change-transition", event: { type: "complete", result: { result: "ok", name, from, to } } }
    { stream: "change-transition", event: { type: "complete", result: { result: "failure", name, from, to, blockers, nextAction } } }
`,
    )
    .action(
      async (
        name: string,
        step: string | undefined,
        opts: {
          format: string
          config?: string
          next?: boolean
          skipHooks?: string
          allowOutOfScope?: true
        },
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
          const requestedTarget: ChangeState | 'next' =
            opts.next === true ? 'next' : (step as ChangeState)

          const progressRenderer = makeProgressRenderer(fmt)

          try {
            const result = await kernel.changes.transition.execute(
              {
                name,
                to: requestedTarget,
                skipHookPhases,
                ...(opts.allowOutOfScope === true ? { allowOutOfScope: true } : {}),
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
            if (isRepairGuideError(err) && err instanceof Error) {
              const status = await kernel.changes.status.execute({
                name,
                refreshImplementationTracking: false,
              })

              if (fmt === 'text') {
                writeTextRepairGuide(err, status)
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
