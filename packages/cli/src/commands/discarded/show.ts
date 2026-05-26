import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `discarded show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDiscardedShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description(
      'Display the full details of a discarded change, including the reason it was discarded and its last known state.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    specIds: string[]
    schema: { name: string, version: string }
    reason: string
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { view } = await kernel.changes.getDiscarded.execute({ name })

        const fmt = parseFormat(opts.format)
        const specIds = [...view.specIds]

        if (fmt === 'text') {
          const lines = [
            `name:    ${view.name}`,
            `specs:   ${specIds.join(', ') || '(none)'}`,
            `schema:  ${view.schemaName}@${view.schemaVersion}`,
            `reason:  ${view.discardReason}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: view.name,
              specIds,
              schema: { name: view.schemaName, version: view.schemaVersion },
              reason: view.discardReason,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
