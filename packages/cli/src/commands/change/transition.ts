import { type Command } from 'commander'
import {
  type ChangeState,
  type TransitionProgressEvent,
  type OnTransitionProgress,
  VALID_TRANSITIONS,
} from '@specd/core'
import { createSpinner, type Spinner } from 'nanospinner'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/** All valid `ChangeState` values. */
const VALID_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

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
    .command('transition <name> <step>')
    .allowExcessArguments(false)
    .description('Transition a change to a new lifecycle state')
    .option('--no-hooks', 'skip run: hook execution')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        step: string,
        opts: { format: string; config?: string; hooks: boolean },
      ) => {
        try {
          if (!(VALID_STATES as string[]).includes(step)) {
            cliError(
              `invalid state '${step}'. valid states: ${VALID_STATES.join(', ')}`,
              opts.format,
            )
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)

          const { change: statusBefore } = await kernel.changes.status.execute({ name })
          const fromState = statusBefore.state

          const { onProgress } = makeProgressRenderer(fmt === 'text')

          const result = await kernel.changes.transition.execute(
            {
              name,
              to: step as ChangeState,
              approvalsSpec: config.approvals.spec,
              approvalsSignoff: config.approvals.signoff,
              skipHooks: !opts.hooks,
            },
            onProgress,
          )

          if (result.postHookFailures.length > 0) {
            const cmds = result.postHookFailures.join(', ')
            cliError(`post-hook(s) failed: ${cmds}`, opts.format, 2)
          }

          if (fmt === 'text') {
            output(`transitioned ${name}: ${fromState} → ${result.change.state}`, 'text')
          } else {
            output(
              {
                result: 'ok',
                name,
                from: fromState,
                to: result.change.state,
                postHookFailures: result.postHookFailures,
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
