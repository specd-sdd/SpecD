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
    .allowExcessArguments(false)
    .description('List archived changes with optional pagination.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--limit <n>', 'maximum number of entries to return', (v) => parseInt(v, 10))
    .option('--page <p>', '1-based page number', (v) => parseInt(v, 10))
    .option('--start-at <name>', 'name of the change to start after')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    items: Array<{
      name: string
      archivedName: string
      archivedAt: string
      archivedBy?: { name: string, email: string }
      artifacts: string[]
      specIds: string[]
    }>,
    meta: {
      total: number
      count: number
      limit: number
      page?: number
      startAt?: string
    }
  }
`,
    )
    .action(
      async (opts: {
        format: string
        config?: string
        limit?: number
        page?: number
        startAt?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const result = await kernel.changes.listArchived.execute({
            limit: opts.limit,
            page: opts.page,
            startAt: opts.startAt,
          })

          const changes = [...result.items].sort(
            (a, b) => b.archivedAt.getTime() - a.archivedAt.getTime(),
          )
          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (changes.length === 0) {
              output('no archived changes', 'text')
            } else {
              const dates = changes.map((c) => c.archivedAt.toISOString().slice(0, 10))
              const byCol = changes.map((c) => (c.archivedBy ? `by ${c.archivedBy.name}` : ''))
              const table = renderTable(
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
                  { header: 'BY', width: colWidth('BY', byCol) },
                ],
                changes.map((c, i) => [c.name, dates[i]!, byCol[i]!]),
              )

              const summary = `\nShowing ${result.meta.count} archived changes of ${result.meta.total}. Increase limit or specify another page.`
              output(table + summary, 'text')
            }
          } else {
            output(
              {
                items: result.items.map((c) => ({
                  name: c.name,
                  archivedName: c.archivedName,
                  archivedAt: c.archivedAt.toISOString(),
                  ...(c.archivedBy
                    ? { archivedBy: { name: c.archivedBy.name, email: c.archivedBy.email } }
                    : {}),
                  artifacts: [...(c.artifacts ?? [])],
                  specIds: [...(c.specIds ?? [])],
                })),
                meta: result.meta,
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
