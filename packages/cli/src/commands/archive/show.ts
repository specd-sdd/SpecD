import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `archive show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerArchiveShow(parent: Command): void {
  parent
    .command('show <name>')
    .description('Show details of an archived change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const archived = await kernel.changes.getArchived.execute({ name })
        const fmt = parseFormat(opts.format)
        const specIds = [...archived.specIds]

        if (fmt === 'text') {
          const lines = [
            `name:    ${archived.name}`,
            `state:   archivable`,
            `specs:   ${specIds.join(', ') || '(none)'}`,
            `schema:  ${archived.schemaName}@${archived.schemaVersion}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: archived.name,
              state: 'archivable',
              specIds,
              schema: { name: archived.schemaName, version: archived.schemaVersion },
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
