import { type Command } from 'commander'
import chalk from 'chalk'
import { type SpecListEntry } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Column widths shared across all workspace groups in a single `spec list` run.
 * Computed once over all entries so every group renders identically wide columns.
 */
type GlobalWidths = { pathW: number; titleW: number; summaryW: number }

/**
 * Computes column widths from ALL entries across ALL workspaces so every
 * workspace group uses the same fixed column sizes.
 *
 * @param entries - All spec list entries.
 * @param includeSummary - Whether a SUMMARY column is shown.
 * @returns The computed column widths.
 */
function computeGlobalWidths(entries: SpecListEntry[], includeSummary: boolean): GlobalWidths {
  return {
    pathW: colWidth(
      'PATH',
      entries.map((s) => `${s.workspace}:${s.path}`),
    ),
    titleW: colWidth(
      'TITLE',
      entries.map((s) => s.title),
    ),
    summaryW: includeSummary
      ? Math.min(
          60,
          colWidth(
            'SUMMARY',
            entries.map((s) => s.summary ?? ''),
          ),
        )
      : 0,
  }
}

/**
 * Renders one workspace group using the globally fixed column widths.
 * An empty workspace shows the workspace name followed by `  (none)`.
 *
 * @param workspace - Workspace name used as the table title.
 * @param specs - Entries belonging to this workspace.
 * @param includeSummary - Whether to include a SUMMARY column.
 * @param widths - Column widths computed across all workspaces.
 * @returns Formatted block for this workspace group.
 */
function renderWorkspaceGroup(
  workspace: string,
  specs: SpecListEntry[],
  includeSummary: boolean,
  widths: GlobalWidths,
): string {
  // Inner width = all columns + separators between them (2 spaces each)
  const innerWidth = widths.pathW + 2 + widths.titleW + (includeSummary ? 2 + widths.summaryW : 0)
  const wsLabel = 'workspace: ' + workspace
  const wsHeader = chalk.inverse.bold(
    '  ' + wsLabel + ' '.repeat(Math.max(0, innerWidth - wsLabel.length)) + '  ',
  )

  const columns = includeSummary
    ? [
        { header: 'PATH', width: widths.pathW },
        { header: 'TITLE', width: widths.titleW },
        { header: 'SUMMARY', width: widths.summaryW, overflow: 'wrap' as const },
      ]
    : [
        { header: 'PATH', width: widths.pathW },
        { header: 'TITLE', width: widths.titleW },
      ]

  if (specs.length === 0) {
    return wsHeader + '\n\n  (none)'
  }

  // renderTable handles the column header and data rows; we prepend the workspace header
  const table = renderTable(
    null,
    columns,
    specs.map((s) =>
      includeSummary
        ? [`${workspace}:${s.path}`, s.title, s.summary ?? '']
        : [`${workspace}:${s.path}`, s.title],
    ),
  )
  return wsHeader + '\n' + table
}

/**
 * Registers the `spec list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecList(parent: Command): void {
  parent
    .command('list')
    .description('List all available specs across all workspaces')
    .option('--summary', 'include a short description for each spec')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { summary?: boolean; format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        const includeSummary = opts.summary === true
        const entries = await kernel.specs.list.execute({ includeSummary })
        const fmt = parseFormat(opts.format)

        const workspaceNames = config.workspaces.map((w) => w.name)

        if (fmt === 'text') {
          if (workspaceNames.length === 0) {
            output('no workspaces configured', 'text')
            return
          }

          const byWorkspace = new Map<string, SpecListEntry[]>()
          for (const name of workspaceNames) byWorkspace.set(name, [])
          for (const entry of entries) byWorkspace.get(entry.workspace)?.push(entry)

          const widths = computeGlobalWidths(entries, includeSummary)
          const groups = workspaceNames.map((name) =>
            renderWorkspaceGroup(name, byWorkspace.get(name) ?? [], includeSummary, widths),
          )
          output(groups.join('\n\n'), 'text')
        } else {
          const byWorkspace = new Map<string, SpecListEntry[]>()
          for (const name of workspaceNames) byWorkspace.set(name, [])
          for (const entry of entries) byWorkspace.get(entry.workspace)?.push(entry)

          output(
            {
              workspaces: [...byWorkspace.entries()].map(([name, specs]) => ({
                name,
                specs: specs.map((s) => ({
                  path: `${name}:${s.path}`,
                  title: s.title,
                  ...(includeSummary && s.summary !== undefined ? { summary: s.summary } : {}),
                })),
              })),
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
