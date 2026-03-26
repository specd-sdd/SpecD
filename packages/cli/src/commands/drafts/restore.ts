import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `drafts restore` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDraftsRestore(parent: Command): void {
  parent
    .command('restore <name>')
    .allowExcessArguments(false)
    .description('Restore a drafted change back to the active change list so work can continue.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        await kernel.changes.restore.execute({ name })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`restored change ${name}`, 'text')
        } else {
          output({ result: 'ok', name }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
