import { type Command } from 'commander'
import {
  type ChangeState,
  type HookPhaseSelector,
  type TransitionProgressEvent,
  type OnTransitionProgress,
  VALID_TRANSITIONS,
} from '@specd/core'
import { createSpinner, type Spinner } from 'nanospinner'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'

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
  }

  return cliError(`cannot advance with --next from unsupported state '${fromState}'`, format)
}

/**
 * Builds an `OnTransitionProgress` callback that renders step-by-step
 * feedback to stderr in text format. Returns a no-op for structured formats.
 *
 * @param isText - Whether to render visual progress (true for text format)
 * @returns The progress callback and collected events
 */
function makeProgressRenderer(isText: boolean): {
  onProgress: OnTransitionProgress
  events: TransitionProgressEvent[]
} {
  const events: TransitionProgressEvent[] = []

  if (!isText) {
    return { onProgress: (evt) => events.push(evt), events }
  }

  let activeSpinner: Spinner | null = null

  const onProgress: OnTransitionProgress = (evt) => {
    events.push(evt)

    switch (evt.type) {
      case 'requires-check': {
        const mark = evt.satisfied ? '✓' : '✗'
        const status = evt.satisfied ? 'satisfied' : 'not satisfied'
        process.stderr.write(`  ${mark} requires ${evt.artifactId} [${status}]\n`)
        break
      }
      case 'hook-start': {
        activeSpinner = createSpinner(`${evt.phase} › ${evt.hookId}: ${evt.command}`, {
          stream: process.stderr,
        }).start()
        break
      }
      case 'hook-done': {
        if (activeSpinner !== null) {
          if (evt.success) {
            activeSpinner.success({ text: `${evt.phase} › ${evt.hookId} (exit ${evt.exitCode})` })
          } else {
            activeSpinner.error({ text: `${evt.phase} › ${evt.hookId} (exit ${evt.exitCode})` })
          }
          activeSpinner = null
        }
        break
      }
      case 'transitioned': {
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
    .description('Transition a change to a new lifecycle state')
    .option('--next', 'transition to the next logical lifecycle step')
    .option(
      '--skip-hooks <phases>',
      'skip hook phases (source.pre,source.post,target.pre,target.post,all)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        step: string | undefined,
        opts: { format: string; config?: string; next?: boolean; skipHooks?: string },
      ) => {
        try {
          validateRequestedTarget(step, opts.next ?? false, opts.format)

          const skipHookPhases =
            opts.skipHooks !== undefined
              ? parseCommaSeparatedValues(opts.skipHooks, VALID_HOOK_PHASES, '--skip-hooks')
              : new Set<HookPhaseSelector>()

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)

          const { change: statusBefore } = await kernel.changes.status.execute({ name })
          const fromState = statusBefore.state
          const requestedTarget = resolveRequestedTarget(
            fromState,
            step,
            opts.next ?? false,
            opts.format,
          )

          const { onProgress } = makeProgressRenderer(fmt === 'text')

          const result = await kernel.changes.transition.execute(
            {
              name,
              to: requestedTarget,
              approvalsSpec: config.approvals.spec,
              approvalsSignoff: config.approvals.signoff,
              skipHookPhases,
            },
            onProgress,
          )

          if (fmt === 'text') {
            output(`transitioned ${name}: ${fromState} → ${result.change.state}`, 'text')
          } else {
            output(
              {
                result: 'ok',
                name,
                from: fromState,
                to: result.change.state,
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
