import { type Command } from 'commander'
import chalk from 'chalk'
import { type OverlapReport } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Renders an overlap report as grouped text output.
 *
 * Each overlapping spec is a header, with changes listed indented below.
 *
 * @param report - The overlap report to render
 * @returns Multi-line string
 */
function renderOverlapReport(report: OverlapReport): string {
  const groups: string[] = []
  for (const entry of report.entries) {
    const lines = [chalk.bold(entry.specId)]
    for (const change of entry.changes) {
      lines.push(`  ${change.name}  ${chalk.dim(change.state)}`)
    }
    groups.push(lines.join('\n'))
  }
  return groups.join('\n\n')
}

/**
 * Registers the `change overlap` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeOverlap(parent: Command): void {
  parent
    .command('check-overlap [name]')
    .allowExcessArguments(false)
    .description(
      'Detect specs targeted by multiple active changes. Optionally filter to a specific change.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string | undefined, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const report = await kernel.changes.detectOverlap.execute(
          name !== undefined ? { name } : undefined,
        )

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          if (!report.hasOverlap) {
            output('no overlap detected', 'text')
          } else {
            output(renderOverlapReport(report), 'text')
          }
        } else {
          output(
            {
              hasOverlap: report.hasOverlap,
              entries: report.entries.map((e) => ({
                specId: e.specId,
                changes: e.changes.map((c) => ({ name: c.name, state: c.state })),
              })),
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
