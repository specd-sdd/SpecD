import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `change discard` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeDiscard(parent: Command): void {
  parent
    .command('discard <name>')
    .allowExcessArguments(false)
    .description('Permanently discard a change')
    .requiredOption('--reason <text>', 'mandatory explanation for discarding')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        if (opts.reason.trim().length === 0) {
          cliError('--reason must not be empty', opts.format)
        }
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        await kernel.changes.discard.execute({
          name,
          reason: opts.reason,
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`discarded change ${name}`, 'text')
        } else {
          output({ result: 'ok', name }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
