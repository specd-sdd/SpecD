import { type Command } from 'commander'
import { type DiscardedChangeListEntry } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import {
  addListPaginationOptions,
  formatTruncationHint,
  parseListPaginationFlags,
} from '../../helpers/list-pagination.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'
import chalk from 'chalk'

/**
 * Renders discarded change list entries as a text table.
 *
 * @param entries - Discarded list entries
 * @param includeReason - Whether to show the reason column
 * @param includeSupersededBy - Whether to show superseded-by targets
 * @returns Multi-line table string
 */
function renderDiscardedList(
  entries: readonly DiscardedChangeListEntry[],
  includeReason: boolean,
  includeSupersededBy: boolean,
): string {
  const rows = entries.map((entry) => ({
    name: entry.name,
    date: entry.discardedAt.toISOString().slice(0, 10),
    by: entry.discardedBy.name,
    reason: entry.reason ?? '',
    superseded:
      includeSupersededBy && entry.supersededBy !== undefined && entry.supersededBy.length > 0
        ? `→ ${entry.supersededBy}`
        : '',
    description: entry.description,
  }))

  const columns: Array<{ header: string; width: number; overflow?: 'wrap' }> = [
    {
      header: 'NAME',
      width: colWidth(
        'NAME',
        rows.map((r) => r.name),
      ),
    },
    {
      header: 'DATE',
      width: colWidth(
        'DATE',
        rows.map((r) => r.date),
      ),
    },
    {
      header: 'BY',
      width: colWidth(
        'BY',
        rows.map((r) => r.by),
      ),
    },
  ]
  if (includeReason) {
    columns.push({
      header: 'REASON',
      width: Math.min(
        60,
        colWidth(
          'REASON',
          rows.map((r) => r.reason),
        ),
      ),
      overflow: 'wrap',
    })
  }
  if (includeSupersededBy) {
    columns.push({
      header: 'SUPERSEDED',
      width: colWidth(
        'SUPERSEDED',
        rows.map((r) => r.superseded),
      ),
    })
  }

  const table = renderTable(
    null,
    columns,
    rows.map((r) => {
      const row = [r.name, r.date, r.by]
      if (includeReason) row.push(r.reason)
      if (includeSupersededBy) row.push(r.superseded)
      return row
    }),
  )

  const descriptionLines = rows
    .filter((r) => r.description !== undefined)
    .map((r) => `    ${chalk.dim(r.description!)}`)

  return [table, ...descriptionLines].filter((line) => line.length > 0).join('\n')
}

/**
 * Registers the `discarded list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDiscardedList(parent: Command): void {
  const cmd = parent
    .command('list')
    .allowExcessArguments(false)
    .description('List all discarded changes, showing their names and the reason for discarding.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--description', 'include change description on each entry')
    .option('--reason', 'include discard reason on each entry')
    .option('--superseded-by', 'include superseded-by target on each entry')

  addListPaginationOptions(cmd)

  cmd
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    items: Array<{ name, createdAt, state, specIds, schemaName, schemaVersion, discardedAt, discardedBy, description?, reason?, supersededBy? }>,
    meta: { total, count, limit, page?, after? }
  }
`,
    )
    .action(
      async (opts: {
        format: string
        config?: string
        description?: boolean
        reason?: boolean
        supersededBy?: boolean
        limit?: number
        page?: number
        afterKey?: string
        afterId?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const pagination = parseListPaginationFlags(opts)
          const result = await kernel.changes.listDiscarded.execute({
            ...pagination,
            ...(opts.description === true ? { includeDescription: true } : {}),
            ...(opts.reason === true ? { includeReason: true } : {}),
            ...(opts.supersededBy === true ? { includeSupersededBy: true } : {}),
          })
          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.items.length === 0) {
              output('no discarded changes', 'text')
            } else {
              const hint = formatTruncationHint(result.meta)
              output(
                renderDiscardedList(
                  result.items,
                  opts.reason === true,
                  opts.supersededBy === true,
                ) + (hint !== null ? `\n${hint}` : ''),
                'text',
              )
            }
          } else {
            output(
              {
                items: result.items.map((entry) => ({
                  name: entry.name,
                  createdAt: entry.createdAt.toISOString(),
                  state: entry.state,
                  specIds: [...entry.specIds],
                  schemaName: entry.schemaName,
                  schemaVersion: entry.schemaVersion,
                  discardedAt: entry.discardedAt.toISOString(),
                  discardedBy: {
                    name: entry.discardedBy.name,
                    email: entry.discardedBy.email,
                  },
                  ...(opts.description === true && entry.description !== undefined
                    ? { description: entry.description }
                    : {}),
                  ...(opts.reason === true && entry.reason !== undefined
                    ? { reason: entry.reason }
                    : {}),
                  ...(opts.supersededBy === true && entry.supersededBy !== undefined
                    ? { supersededBy: entry.supersededBy }
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
