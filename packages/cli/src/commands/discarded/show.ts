import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `discarded show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDiscardedShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description('Show details of a discarded change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { change } = await kernel.changes.status.execute({ name })

        const isDiscarded = change.history.some((e: { type: string }) => e.type === 'discarded')
        if (!isDiscarded) {
          cliError(`change '${name}' is not in discarded`, opts.format)
        }

        // Find the discarded event for reason
        const discardedEvent = change.history
          .slice()
          .reverse()
          .find((e: { type: string }) => e.type === 'discarded')

        const fmt = parseFormat(opts.format)
        const specIds = [...change.specIds]
        const reason = discardedEvent?.type === 'discarded' ? discardedEvent.reason : '(unknown)'

        if (fmt === 'text') {
          const lines = [
            `name:    ${change.name}`,
            `specs:   ${specIds.join(', ') || '(none)'}`,
            `schema:  ${change.schemaName}@${change.schemaVersion}`,
            `reason:  ${reason}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: change.name,
              specIds,
              schema: { name: change.schemaName, version: change.schemaVersion },
              reason,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
