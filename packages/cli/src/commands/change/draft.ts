import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change draft` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeDraft(parent: Command): void {
  parent
    .command('draft <name>')
    .allowExcessArguments(false)
    .description(
      'Shelve a change as a draft, moving it out of the active list so it can be resumed later.',
    )
    .option('--reason <text>', 'reason for shelving')
    .option(
      '--force',
      'bypass the historical implementation guard when the change has previously reached implementing',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string }
`,
    )
    .action(
      async (
        name: string,
        opts: { reason?: string; force?: boolean; format: string; config?: string },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          await kernel.changes.draft.execute({
            name,
            ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
            ...(opts.force ? { force: true } : {}),
          })
          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`drafted change ${name}`, 'text')
          } else {
            output({ result: 'ok', name }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
