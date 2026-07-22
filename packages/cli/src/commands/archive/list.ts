import { type Command } from 'commander'
import { type ArchiveListEntry } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import {
  addListPaginationOptions,
  formatTruncationHint,
  parseListPaginationFlags,
} from '../../helpers/list-pagination.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Registers the `archive list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerArchiveList(parent: Command): void {
  const cmd = parent
    .command('list')
    .allowExcessArguments(false)
    .description('List archived changes with optional pagination.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--archived-by', 'include archivedBy on each entry')

  addListPaginationOptions(cmd)

  cmd
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    items: Array<{
      name: string
      archivedName: string
      archivedAt: string
      specIds: string[]
      schemaName: string
      schemaVersion: number
      archivedBy?: { name: string, email: string }
    }>,
    meta: {
      total: number
      count: number
      limit: number
      page?: number
      after?: { key: string, id?: string }
    }
  }
`,
    )
    .action(
      async (opts: {
        format: string
        config?: string
        archivedBy?: boolean
        limit?: number
        page?: number
        afterKey?: string
        afterId?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const pagination = parseListPaginationFlags(opts)
          const result = await kernel.changes.listArchived.execute({
            ...pagination,
            ...(opts.archivedBy === true ? { includeArchivedBy: true } : {}),
          })

          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.items.length === 0) {
              output('no archived changes', 'text')
            } else {
              const includeBy = opts.archivedBy === true
              const dates = result.items.map((c) => c.archivedAt.toISOString().slice(0, 10))
              const byCol = result.items.map((c) =>
                includeBy && c.archivedBy ? c.archivedBy.name : '',
              )
              const columns = [
                {
                  header: 'NAME',
                  width: colWidth(
                    'NAME',
                    result.items.map((c) => c.name),
                  ),
                },
                { header: 'DATE', width: colWidth('DATE', dates) },
              ]
              if (includeBy) {
                columns.push({ header: 'BY', width: colWidth('BY', byCol) })
              }
              const table = renderTable(
                null,
                columns,
                result.items.map((c, i) => {
                  const row = [c.name, dates[i]!]
                  if (includeBy) row.push(byCol[i]!)
                  return row
                }),
              )
              const hint = formatTruncationHint(result.meta)
              output(table + (hint !== null ? `\n${hint}` : ''), 'text')
            }
          } else {
            output(
              {
                items: result.items.map((c: ArchiveListEntry) => ({
                  name: c.name,
                  archivedName: c.archivedName,
                  archivedAt: c.archivedAt.toISOString(),
                  specIds: [...c.specIds],
                  schemaName: c.schemaName,
                  schemaVersion: c.schemaVersion,
                  ...(opts.archivedBy === true && c.archivedBy
                    ? { archivedBy: { name: c.archivedBy.name, email: c.archivedBy.email } }
                    : {}),
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
