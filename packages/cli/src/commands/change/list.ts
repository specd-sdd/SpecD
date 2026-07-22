import { type Command } from 'commander'
import chalk from 'chalk'
import { type ActiveChangeListEntry } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import {
  addListPaginationOptions,
  formatTruncationHint,
  parseListPaginationFlags,
} from '../../helpers/list-pagination.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, pad } from '../../helpers/table.js'

/**
 * Renders the change list as an aligned text table with an inverse-video
 * header row.
 *
 * @param changes - Change list entries to render
 * @returns Multi-line string
 */
function renderChangeList(changes: readonly ActiveChangeListEntry[]): string {
  const rows = changes.map((c) => ({
    name: c.name,
    state: c.state,
    specs: [...c.specIds].join(', '),
    schema: `${c.schemaName}@${c.schemaVersion.toString()}`,
    description: c.description,
  }))

  const wName = colWidth(
    'NAME',
    rows.map((r) => r.name),
  )
  const wState = colWidth(
    'STATE',
    rows.map((r) => r.state),
  )
  const wSpecs = colWidth(
    'SPECS',
    rows.map((r) => r.specs),
  )
  const wSchema = colWidth(
    'SCHEMA',
    rows.map((r) => r.schema),
  )

  const headerRow = chalk.inverse.bold(
    '  ' +
      pad('NAME', wName) +
      '  ' +
      pad('STATE', wState) +
      '  ' +
      pad('SPECS', wSpecs) +
      '  ' +
      pad('SCHEMA', wSchema) +
      '  ',
  )

  const lines: string[] = [headerRow]
  for (const row of rows) {
    const mainLine =
      '  ' +
      pad(row.name, wName) +
      '  ' +
      pad(row.state, wState) +
      '  ' +
      pad(row.specs, wSpecs) +
      '  ' +
      row.schema
    lines.push(mainLine)
    if (row.description !== undefined) {
      lines.push('    ' + chalk.dim(row.description))
    }
  }
  return lines.join('\n')
}

/**
 * Registers the `change list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeList(parent: Command): void {
  const cmd = parent
    .command('list')
    .allowExcessArguments(false)
    .description('List all active changes with their current lifecycle state and associated specs.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--description', 'include change description on each entry')

  addListPaginationOptions(cmd)

  cmd
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    items: Array<{
      name: string
      state: string
      specIds: string[]
      schemaName: string
      schemaVersion: number
      createdAt: string
      description?: string
    }>,
    meta: { total: number, count: number, limit: number, page?: number, after?: object }
  }
`,
    )
    .action(
      async (opts: {
        format: string
        config?: string
        description?: boolean
        limit?: number
        page?: number
        afterKey?: string
        afterId?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const pagination = parseListPaginationFlags(opts)
          const result = await kernel.changes.list.execute({
            ...pagination,
            ...(opts.description === true ? { includeDescription: true } : {}),
          })
          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.items.length === 0) {
              output('no changes', 'text')
            } else {
              const hint = formatTruncationHint(result.meta)
              output(renderChangeList(result.items) + (hint !== null ? `\n${hint}` : ''), 'text')
            }
          } else {
            output(
              {
                items: result.items.map((c) => ({
                  name: c.name,
                  state: c.state,
                  specIds: [...c.specIds],
                  schemaName: c.schemaName,
                  schemaVersion: c.schemaVersion,
                  createdAt: c.createdAt.toISOString(),
                  ...(c.description !== undefined ? { description: c.description } : {}),
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
