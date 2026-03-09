import { type Command } from 'commander'
import { type ChangeState, VALID_TRANSITIONS } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/** All valid `ChangeState` values. */
const VALID_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/**
 * Registers the `change transition` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeTransition(parent: Command): void {
  parent
    .command('transition <name> <step>')
    .description('Transition a change to a new lifecycle state')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, step: string, opts: { format: string; config?: string }) => {
      try {
        if (!(VALID_STATES as string[]).includes(step)) {
          process.stderr.write(
            `error: invalid state '${step}'. valid states: ${VALID_STATES.join(', ')}\n`,
          )
          process.exit(1)
        }

        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)

        const { change: statusBefore } = await kernel.changes.status.execute({ name })
        const fromState = statusBefore.state

        const change = await kernel.changes.transition.execute({
          name,
          to: step as ChangeState,
          approvalsSpec: config.approvals.spec,
          approvalsSignoff: config.approvals.signoff,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`transitioned ${name}: ${fromState} → ${change.state}`, 'text')
        } else {
          output({ result: 'ok', name, from: fromState, to: change.state }, fmt)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
