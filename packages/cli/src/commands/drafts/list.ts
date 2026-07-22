import { type Command } from 'commander'
import { type DraftedChangeListEntry } from '@specd/sdk'
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
 * Renders drafted change list entries as a text table.
 *
 * @param entries - Draft list entries
 * @param includeReason - Whether to show the reason column
 * @returns Multi-line table string
 */
function renderDraftList(
  entries: readonly DraftedChangeListEntry[],
  includeReason: boolean,
): string {
  const rows = entries.map((entry) => ({
    name: entry.name,
    state: entry.state,
    date: entry.draftedAt.toISOString().slice(0, 10),
    by: entry.draftedBy.name,
    reason: entry.reason ?? '',
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
      header: 'STATE',
      width: colWidth(
        'STATE',
        rows.map((r) => r.state),
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

  const table = renderTable(
    null,
    columns,
    rows.map((r) => {
      const row = [r.name, r.state, r.date, r.by]
      if (includeReason) row.push(r.reason)
      return row
    }),
  )

  const descriptionLines = rows
    .filter((r) => r.description !== undefined)
    .map((r) => `    ${chalk.dim(r.description!)}`)

  return [table, ...descriptionLines].filter((line) => line.length > 0).join('\n')
}

/**
 * Registers the `drafts list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDraftsList(parent: Command): void {
  const cmd = parent
    .command('list')
    .allowExcessArguments(false)
    .description(
      'List all drafted (shelved) changes, showing their name, state, date, author, and reason.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--description', 'include change description on each entry')
    .option('--reason', 'include draft reason on each entry')

  addListPaginationOptions(cmd, { defaultLimit: 100 })

  cmd
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    items: Array<{ name, state, createdAt, specIds, schemaName, schemaVersion, draftedAt, draftedBy?, description?, reason? }>,
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
        limit?: string
        page?: number
        afterKey?: string
        afterId?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const pagination = parseListPaginationFlags(opts, { defaultLimit: 100 })
          const result = await kernel.changes.listDrafts.execute({
            ...pagination,
            ...(opts.description === true ? { includeDescription: true } : {}),
            ...(opts.reason === true ? { includeReason: true } : {}),
          })
          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.items.length === 0) {
              output('no drafts', 'text')
            } else {
              const hint = formatTruncationHint(result.meta)
              output(
                renderDraftList(result.items, opts.reason === true) +
                  (hint !== null ? `\n${hint}` : ''),
                'text',
              )
            }
          } else {
            output(
              {
                items: result.items.map((entry) => ({
                  name: entry.name,
                  state: entry.state,
                  createdAt: entry.createdAt.toISOString(),
                  specIds: [...entry.specIds],
                  schemaName: entry.schemaName,
                  schemaVersion: entry.schemaVersion,
                  draftedAt: entry.draftedAt.toISOString(),
                  draftedBy: { name: entry.draftedBy.name, email: entry.draftedBy.email },
                  ...(opts.description === true && entry.description !== undefined
                    ? { description: entry.description }
                    : {}),
                  ...(opts.reason === true && entry.reason !== undefined
                    ? { reason: entry.reason }
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
