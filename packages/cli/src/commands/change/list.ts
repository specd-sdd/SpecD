import { type Command } from 'commander'
import chalk from 'chalk'
import { type Change } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth } from '../../helpers/table.js'

const vlen = (s: string): number => s.normalize('NFC').length
const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - vlen(s)))

/**
 * Renders the change list as an aligned text table with an inverse-video
 * header row.
 *
 * Header row (inverse-video): `NAME  STATE  SPECS  SCHEMA`
 * Each data row: `  <name>  <state>  <specIds>  <schema>@<version>`
 * Optional description row (indented, dim): `    <description>`
 *
 * Column widths are fixed at render time, computed from the widest value
 * across all rows for each column (global, not per-group).
 *
 * @param changes - Changes to render
 * @returns Multi-line string
 */
function renderChangeList(changes: Change[]): string {
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
  parent
    .command('list')
    .description('List all active changes')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        const changes = await kernel.changes.list.execute()
        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          if (changes.length === 0) {
            output('no changes', 'text')
          } else {
            output(renderChangeList(changes), 'text')
          }
        } else {
          output(
            changes.map((c) => ({
              name: c.name,
              state: c.state,
              specIds: [...c.specIds],
              schema: { name: c.schemaName, version: c.schemaVersion },
              ...(c.description !== undefined ? { description: c.description } : {}),
            })),
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
