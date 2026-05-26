import { type Command } from 'commander'
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

        const sorted = [...unsorted].sort(
          (a, b) => b.discardedAt.getTime() - a.discardedAt.getTime(),
        )

        if (fmt === 'text') {
          if (sorted.length === 0) {
            output('no discarded changes', 'text')
          } else {
            const rows = sorted.map((view) => ({
              name: view.name,
              date: view.discardedAt.toISOString().slice(0, 10),
              by: view.discardedBy.name,
              reason: view.discardReason,
              superseded:
                view.supersededBy !== undefined && view.supersededBy.length > 0
                  ? `→ ${view.supersededBy.join(', ')}`
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
            sorted.map((view) => ({
              name: view.name,
              discardedAt: view.discardedAt.toISOString(),
              discardedBy: { name: view.discardedBy.name, email: view.discardedBy.email },
              reason: view.discardReason,
              ...(view.supersededBy !== undefined && view.supersededBy.length > 0
                ? { supersededBy: [...view.supersededBy] }
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
