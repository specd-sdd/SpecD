import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Registers the `archive list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerArchiveList(parent: Command): void {
  parent
    .command('list')
    .description('List all archived changes')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const unsorted = await kernel.changes.listArchived.execute()
        const changes = [...unsorted].sort(
          (a, b) => b.archivedAt.getTime() - a.archivedAt.getTime(),
        )
        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          if (changes.length === 0) {
            output('no archived changes', 'text')
          } else {
            const dates = changes.map((c) => c.archivedAt.toISOString().slice(0, 10))
            output(
              renderTable(
                null,
                [
                  {
                    header: 'NAME',
                    width: colWidth(
                      'NAME',
                      changes.map((c) => c.name),
                    ),
                  },
                  { header: 'DATE', width: colWidth('DATE', dates) },
                ],
                changes.map((c, i) => [c.name, dates[i]!]),
              ),
              'text',
            )
          }
        } else {
          output(
            changes.map((c) => ({
              name: c.name,
              archivedName: c.archivedName,
              workspace: c.workspace?.toString() ?? '',
              archivedAt: c.archivedAt.toISOString(),
              ...(c.archivedBy
                ? { archivedBy: { name: c.archivedBy.name, email: c.archivedBy.email } }
                : {}),
              artifacts: [...(c.artifacts ?? [])],
            })),
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
