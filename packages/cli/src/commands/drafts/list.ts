import { type Command } from 'commander'
import { type DraftedEvent } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Registers the `drafts list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerDraftsList(parent: Command): void {
  parent
    .command('list')
    .description('List all drafted (shelved) changes')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const changes = await kernel.changes.listDrafts.execute()
        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          if (changes.length === 0) {
            output('no drafts', 'text')
          } else {
            const rows = changes.map((c) => {
              const evt = c.history
                .slice()
                .reverse()
                .find((e): e is DraftedEvent => e.type === 'drafted')
              return {
                name: c.name,
                state: c.state,
                date: evt?.at.toISOString().slice(0, 10) ?? '',
                by: evt?.by.name ?? '',
                reason: evt?.reason ?? '',
              }
            })
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
                ],
                rows.map((r) => [r.name, r.state, r.date, r.by, r.reason]),
              ),
              'text',
            )
          }
        } else {
          output(
            changes.map((c) => {
              const evt = c.history
                .slice()
                .reverse()
                .find((e): e is DraftedEvent => e.type === 'drafted')
              return {
                name: c.name,
                state: c.state,
                draftedAt: evt?.at.toISOString(),
                ...(evt ? { draftedBy: { name: evt.by.name, email: evt.by.email } } : {}),
                ...(evt?.reason !== undefined ? { reason: evt.reason } : {}),
              }
            }),
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
