import { type Command } from 'commander'
import chalk from 'chalk'
import { type SpecListEntry, type SpecMetadataStatus } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Column widths shared across all workspace groups in a single `spec list` run.
 * Computed once over all entries so every group renders identically wide columns.
 */
type GlobalWidths = { pathW: number; titleW: number; metadataStatusW: number; summaryW: number }

/**
 * Computes column widths from ALL entries across ALL workspaces so every
 * workspace group uses the same fixed column sizes.
 *
 * @param entries - All spec list entries.
 * @param includeMetadataStatus - Whether a STATUS column is shown.
 * @param includeSummary - Whether a SUMMARY column is shown.
 * @returns The computed column widths.
 */
function computeGlobalWidths(
  entries: SpecListEntry[],
  includeMetadataStatus: boolean,
  includeSummary: boolean,
): GlobalWidths {
  return {
    pathW: colWidth(
      'PATH',
      entries.map((s) => `${s.workspace}:${s.path}`),
    ),
    titleW: colWidth(
      'TITLE',
      entries.map((s) => s.title),
    ),
    metadataStatusW: includeMetadataStatus
      ? colWidth(
          'METADATA STATUS',
          entries.map((s) => s.metadataStatus ?? ''),
        )
      : 0,
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
 * @param includeMetadataStatus - Whether to include a STATUS column.
 * @param includeSummary - Whether to include a SUMMARY column.
 * @param widths - Column widths computed across all workspaces.
 * @returns Formatted block for this workspace group.
 */
function renderWorkspaceGroup(
  workspace: string,
  specs: SpecListEntry[],
  includeMetadataStatus: boolean,
  includeSummary: boolean,
  widths: GlobalWidths,
): string {
  // Inner width = all columns + separators between them (2 spaces each)
  let innerWidth = widths.pathW + 2 + widths.titleW
  if (includeMetadataStatus) innerWidth += 2 + widths.metadataStatusW
  if (includeSummary) innerWidth += 2 + widths.summaryW
  const wsLabel = 'workspace: ' + workspace
  const wsHeader = chalk.inverse.bold(
    '  ' + wsLabel + ' '.repeat(Math.max(0, innerWidth - wsLabel.length)) + '  ',
  )

  const columns: Array<{ header: string; width: number; overflow?: 'wrap' }> = [
    { header: 'PATH', width: widths.pathW },
    { header: 'TITLE', width: widths.titleW },
  ]
  if (includeMetadataStatus)
    columns.push({ header: 'METADATA STATUS', width: widths.metadataStatusW })
  if (includeSummary) columns.push({ header: 'SUMMARY', width: widths.summaryW, overflow: 'wrap' })

  if (specs.length === 0) {
    return wsHeader + '\n\n  (none)'
  }

  // renderTable handles the column header and data rows; we prepend the workspace header
  const table = renderTable(
    null,
    columns,
    specs.map((s) => {
      const row = [`${workspace}:${s.path}`, s.title]
      if (includeMetadataStatus) row.push(s.metadataStatus ?? '')
      if (includeSummary) row.push(s.summary ?? '')
      return row
    }),
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
    .allowExcessArguments(false)
    .description('List all available specs across all workspaces')
    .option('--summary', 'include a short description for each spec')
    .option(
      '--metadata-status [filter]',
      'show metadata freshness status; optionally filter by fresh,stale,missing,invalid',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (opts: {
        summary?: boolean
        metadataStatus?: boolean | string
        format: string
        config?: string
      }) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const includeSummary = opts.summary === true
          const includeMetadataStatus = opts.metadataStatus !== undefined
          const metadataStatusFilter = parseMetadataStatusFilter(opts.metadataStatus)
          let entries = await kernel.specs.list.execute({ includeSummary, includeMetadataStatus })
          const fmt = parseFormat(opts.format)

          // Apply status filter when a filter value is provided
          if (metadataStatusFilter !== null) {
            entries = entries.filter(
              (e) => e.metadataStatus !== undefined && metadataStatusFilter.has(e.metadataStatus),
            )
          }

          const workspaceNames = config.workspaces.map((w) => w.name)

          if (fmt === 'text') {
            if (workspaceNames.length === 0) {
              output('no workspaces configured', 'text')
              return
            }

            const byWorkspace = new Map<string, SpecListEntry[]>()
            for (const name of workspaceNames) byWorkspace.set(name, [])
            for (const entry of entries) byWorkspace.get(entry.workspace)?.push(entry)

            const widths = computeGlobalWidths(entries, includeMetadataStatus, includeSummary)
            const groups = workspaceNames.map((name) =>
              renderWorkspaceGroup(
                name,
                byWorkspace.get(name) ?? [],
                includeMetadataStatus,
                includeSummary,
                widths,
              ),
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
                    ...(includeMetadataStatus && s.metadataStatus !== undefined
                      ? { metadataStatus: s.metadataStatus }
                      : {}),
                    ...(includeSummary && s.summary !== undefined ? { summary: s.summary } : {}),
                  })),
                })),
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

const VALID_METADATA_STATUSES: ReadonlySet<SpecMetadataStatus> = new Set([
  'fresh',
  'stale',
  'missing',
  'invalid',
])

/**
 * Parses the `--metadata-status` option value into a filter set.
 *
 * @param value - The raw option value: `undefined` (not passed), `true` (flag only), or a string
 * @returns A set of status tokens to filter by, or `null` if no filtering
 */
function parseMetadataStatusFilter(
  value: boolean | string | undefined,
): Set<SpecMetadataStatus> | null {
  if (typeof value !== 'string') return null
  const tokens = value
    .toLowerCase()
    .split(',')
    .map((t: string) => t.trim())
    .filter((t: string): t is SpecMetadataStatus =>
      VALID_METADATA_STATUSES.has(t as SpecMetadataStatus),
    )
  return tokens.length > 0 ? new Set(tokens) : null
}
