import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `drafts show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDraftsShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description('Show details of a drafted change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { change } = await kernel.changes.status.execute({ name })

        if (!change.isDrafted) {
          cliError(`change '${name}' is not in drafts`, opts.format)
        }

        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          const lines = [
            `name:    ${change.name}`,
            `state:   ${change.state}`,
            `specs:   ${[...change.specIds].join(', ') || '(none)'}`,
            `schema:  ${change.schemaName}@${change.schemaVersion}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: change.name,
              state: change.state,
              specIds: [...change.specIds],
              schema: { name: change.schemaName, version: change.schemaVersion },
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
