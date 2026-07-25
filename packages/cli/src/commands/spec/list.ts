import { type Command } from 'commander'
import chalk from 'chalk'
import { type SpecListEntry, type ProjectWorkspace, type SpecRepository } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import {
  addListPaginationOptions,
  formatTruncationHint,
  parseLimitFlag,
  parseListPaginationFlags,
} from '../../helpers/list-pagination.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Collects repeatable option values into an array.
 * @param value - The new option value.
 * @param previous - The accumulated array of previous values.
 * @returns A new array with the value appended.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/** Column widths shared across all workspace groups in a single `spec list` run. */
type GlobalWidths = { pathW: number; titleW: number; summaryW: number }

/**
 * Computes column widths from ALL entries across ALL workspaces.
 *
 * @param entries - All spec list entries.
 * @param includeSummary - Whether a SUMMARY column is shown.
 * @returns The computed column widths.
 */
function computeGlobalWidths(
  entries: readonly SpecListEntry[],
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
 *
 * @param workspaceObj - Workspace details used as the table title.
 * @param specs - Entries belonging to this workspace.
 * @param includeSummary - Whether to include a SUMMARY column.
 * @param widths - Column widths computed across all workspaces.
 * @returns Formatted block for this workspace group.
 */
function renderWorkspaceGroup(
  workspaceObj: ProjectWorkspace,
  specs: SpecListEntry[],
  includeSummary: boolean,
  widths: GlobalWidths,
): string {
  let innerWidth = widths.pathW + 2 + widths.titleW
  if (includeSummary) innerWidth += 2 + widths.summaryW

  let wsLabel = `workspace: ${workspaceObj.name}`
  const flags: string[] = []
  if (workspaceObj.ownership === 'readOnly') flags.push('read-only')
  else if (workspaceObj.ownership === 'shared') flags.push('shared')
  if (workspaceObj.isExternal) flags.push('external')
  if (flags.length > 0) {
    wsLabel += ` [${flags.join(', ')}]`
  }
  wsLabel += ` (root: ${workspaceObj.codeRoot})`

  const wsHeader = chalk.inverse.bold(
    '  ' + wsLabel + ' '.repeat(Math.max(0, innerWidth - wsLabel.length)) + '  ',
  )

  const columns: Array<{ header: string; width: number; overflow?: 'wrap' }> = [
    { header: 'PATH', width: widths.pathW },
    { header: 'TITLE', width: widths.titleW },
  ]
  if (includeSummary) columns.push({ header: 'SUMMARY', width: widths.summaryW, overflow: 'wrap' })

  if (specs.length === 0) {
    return wsHeader + '\n\n  (none)'
  }

  const table = renderTable(
    null,
    columns,
    specs.map((s) => {
      const row = [`${workspaceObj.name}:${s.path}`, s.title]
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
  const cmd = parent
    .command('list')
    .allowExcessArguments(false)
    .description(
      'List all specs in the project across all workspaces, with their identifiers and titles.',
    )
    .option('--summary', 'include a short description for each spec')
    .option('--workspace <name>', 'filter by workspace (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')

  addListPaginationOptions(cmd, { includeAfterId: false })

  cmd
    .addHelpText(
      'after',
      `
Options:
  --workspace <name>   Filter results to one or more workspaces (repeatable)

JSON/TOON output schema:
  {
    workspaces: Array<{
      name: string
      specs: Array<{ path, title, summary? }>
      meta: { total, count, limit, page?, after? }
    }>
  }
`,
    )
    .action(
      async (opts: {
        summary?: boolean
        workspace: string[]
        format: string
        config?: string
        limit?: string
        page?: number
        afterKey?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const includeSummary = opts.summary === true
          const parsedLimit = parseLimitFlag(opts.limit)
          const pagination = parseListPaginationFlags(opts, { allowAfterId: false })

          const result = await kernel.specs.list.execute({
            ...pagination,
            includeSummary,
            ...(opts.workspace.length > 0 ? { workspaces: opts.workspace } : {}),
          })
          const fmt = parseFormat(opts.format)

          const workspaces = await kernel.project.listWorkspaces.execute()
          const workspaceNames = workspaces.map((w) => w.name)
          const workspaceFilter = opts.workspace.length > 0 ? new Set(opts.workspace) : null
          const visibleWorkspaces =
            workspaceFilter !== null
              ? workspaceNames.filter((n) => workspaceFilter.has(n))
              : workspaceNames

          const byWorkspace = new Map<string, SpecListEntry[]>()
          for (const name of visibleWorkspaces) byWorkspace.set(name, [])
          for (const entry of result.items) byWorkspace.get(entry.workspace)?.push(entry)

          const workspaceMeta = new Map(
            result.byWorkspace.map((slice) => [slice.workspace, slice.meta]),
          )

          if (fmt === 'text') {
            if (visibleWorkspaces.length === 0) {
              output('no workspaces configured', 'text')
              return
            }

            const workspaceMap = new Map(workspaces.map((w) => [w.name, w]))
            const widths = computeGlobalWidths(result.items, includeSummary)
            const groups = visibleWorkspaces.map((name) => {
              const wsObj: ProjectWorkspace = workspaceMap.get(name) ?? {
                name,
                prefix: null,
                ownership: 'owned' as const,
                isExternal: false,
                codeRoot: '',
                specRepo: null as unknown as SpecRepository,
              }
              const block = renderWorkspaceGroup(
                wsObj,
                byWorkspace.get(name) ?? [],
                includeSummary,
                widths,
              )
              const meta = workspaceMeta.get(name)
              const hint =
                parsedLimit.kind === 'number' && meta !== undefined
                  ? formatTruncationHint(meta)
                  : null
              return hint !== null ? `${block}\n${hint}` : block
            })
            output(groups.join('\n\n'), 'text')
          } else {
            output(
              {
                workspaces: visibleWorkspaces.map((name) => {
                  const specs = byWorkspace.get(name) ?? []
                  const meta = workspaceMeta.get(name) ?? {
                    total: 0,
                    count: 0,
                    limit: 0,
                  }
                  return {
                    name,
                    specs: specs.map((s) => ({
                      path: `${name}:${s.path}`,
                      title: s.title,
                      ...(includeSummary && s.summary !== undefined ? { summary: s.summary } : {}),
                    })),
                    meta,
                  }
                }),
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
