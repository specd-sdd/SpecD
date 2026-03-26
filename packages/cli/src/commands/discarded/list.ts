import { type Command } from 'commander'
import { type DiscardedEvent } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Registers the `discarded list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDiscardedList(parent: Command): void {
  parent
    .command('list')
    .allowExcessArguments(false)
    .description('List all discarded changes, showing their names and the reason for discarding.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Array<{
    name: string
    discardedAt: string | null
    discardedBy?: { name: string, email: string }
    reason?: string
    supersededBy?: string[]
  }>
`,
    )
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const unsorted = await kernel.changes.listDiscarded.execute()
        const fmt = parseFormat(opts.format)

        // Extract discard event for each change and sort by discard date descending
        const withEvents = unsorted.map((c) => {
          const evt = c.history
            .slice()
            .reverse()
            .find((e): e is DiscardedEvent => e.type === 'discarded')
          return { change: c, evt }
        })
        withEvents.sort((a, b) => {
          const aTime = a.evt?.at.getTime() ?? 0
          const bTime = b.evt?.at.getTime() ?? 0
          return bTime - aTime
        })

        if (fmt === 'text') {
          if (withEvents.length === 0) {
            output('no discarded changes', 'text')
          } else {
            const rows = withEvents.map(({ change: c, evt }) => ({
              name: c.name,
              date: evt?.at.toISOString().slice(0, 10) ?? '',
              by: evt?.by.name ?? '',
              reason: evt?.reason ?? '',
              superseded:
                evt?.supersededBy && evt.supersededBy.length > 0
                  ? `→ ${evt.supersededBy.join(', ')}`
                  : '',
            }))
            output(
              renderTable(
                null,
                [
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
                  {
                    header: 'REASON',
                    width: Math.min(
                      60,
                      colWidth(
                        'REASON',
                        rows.map((r) => r.reason),
                      ),
                    ),
                    overflow: 'wrap',
                  },
                  {
                    header: 'SUPERSEDED',
                    width: colWidth(
                      'SUPERSEDED',
                      rows.map((r) => r.superseded),
                    ),
                  },
                ],
                rows.map((r) => [r.name, r.date, r.by, r.reason, r.superseded]),
              ),
              'text',
            )
          }
        } else {
          output(
            withEvents.map(({ change: c, evt }) => ({
              name: c.name,
              discardedAt: evt?.at.toISOString() ?? null,
              ...(evt ? { discardedBy: { name: evt.by.name, email: evt.by.email } } : {}),
              ...(evt?.reason !== undefined ? { reason: evt.reason } : {}),
              ...(evt?.supersededBy && evt.supersededBy.length > 0
                ? { supersededBy: [...evt.supersededBy] }
                : {}),
            })),
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
