import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `drafts show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDraftsShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description(
      'Display the full details of a drafted change, including its specs, schema, and last known lifecycle state.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    state: string
    specIds: string[]
    schema: { name: string, version: string }
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { view } = await kernel.changes.getDraft.execute({ name })

        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          const lines = [
            `name:    ${view.name}`,
            `state:   ${view.state}`,
            `specs:   ${[...view.specIds].join(', ') || '(none)'}`,
            `schema:  ${view.schemaName}@${view.schemaVersion}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: view.name,
              state: view.state,
              specIds: [...view.specIds],
              schema: { name: view.schemaName, version: view.schemaVersion },
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
