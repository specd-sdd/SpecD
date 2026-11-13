import { type Command } from 'commander'
import { ListPlugins as ListRuntimePlugins, createPluginLoader } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { getDeclaredPlugins } from './get-declared-plugins.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * One `plugins list` row.
 */
interface PluginListRow {
  /** Plugin package name. */
  readonly name: string
  /** Declared and selected contribution ids. */
  readonly contributions: {
    readonly declared: readonly string[]
    readonly selected: readonly string[]
  }
  /** Load status. */
  readonly status: 'installed' | 'not_found' | 'error'
  /** Plugin version when installed. */
  readonly version?: string
  /** Error details for non-installed statuses. */
  readonly detail?: string
}

/**
 * Registers the `plugins list` subcommand.
 *
 * @param parent - Parent command.
 */
export function registerPluginsList(parent: Command): void {
  parent
    .command('list')
    .allowExcessArguments(false)
    .description('List declared plugins and report runtime load status.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config } = await resolveCliContext({
          configPath: opts.config,
          plugins: false,
        })
        const declared = getDeclaredPlugins(config)
        const rows: PluginListRow[] = []
        if (declared.length > 0) {
          const loader = createPluginLoader({ config })
          const listRuntime = new ListRuntimePlugins(loader)
          const runtime = await listRuntime.execute({
            pluginNames: declared.map((entry) => entry.name),
          })
          const byName = new Map(declared.map((entry) => [entry.name, entry]))
          for (const item of runtime.plugins) {
            rows.push(toListRow(item, byName.get(item.name)?.contributions))
          }
        }

        renderRows(rows, fmt)
      } catch (error) {
        handleError(error, opts.format)
      }
    })
}

/**
 * Runtime status consumed by `plugins list`.
 */
interface RuntimeListItem {
  readonly name: string
  readonly status: 'loaded' | 'not_found' | 'error'
  readonly contributions?: readonly string[]
  readonly plugin?: { readonly version: string }
  readonly error?: string
}

/**
 * Maps one loader status onto a list row.
 *
 * A loaded plugin reports the manifest ids. A missing or failed package reports
 * an empty declared list and the config allowlist, or no selection.
 *
 * @param item - Loader status
 * @param allowlist - Contribution allowlist from the config entry
 * @returns The row rendered by `plugins list`
 */
function toListRow(item: RuntimeListItem, allowlist: readonly string[] | undefined): PluginListRow {
  const loaded = item.status === 'loaded'
  const declared = loaded ? (item.contributions ?? []) : []
  const selected = allowlist ?? (loaded ? declared : [])
  return {
    name: item.name,
    contributions: { declared, selected },
    status: loaded ? 'installed' : item.status,
    ...(loaded && item.plugin?.version !== undefined ? { version: item.plugin.version } : {}),
    ...(!loaded && item.error !== undefined ? { detail: item.error } : {}),
  }
}

/**
 * Renders `plugins list` rows.
 *
 * @param rows - Rows to render.
 * @param format - Selected output format.
 */
function renderRows(rows: PluginListRow[], format: OutputFormat): void {
  if (format === 'text') {
    if (rows.length === 0) {
      output('no plugins declared', 'text')
      return
    }
    output('Installed plugins:', 'text')
    for (const row of rows) {
      const version = row.version === undefined ? '-' : row.version
      const detail = row.detail === undefined ? '' : `  ${row.detail}`
      const selected = row.contributions.selected.join(', ')
      const selectedIds = new Set(row.contributions.selected)
      const available = row.contributions.declared.filter((id) => !selectedIds.has(id))
      const availableText = available.length > 0 ? `  available: ${available.join(', ')}` : ''
      output(
        `${row.name}  ${row.status}  ${version}  selected: [${selected}]${availableText}${detail}`,
        'text',
      )
    }
    return
  }
  output({ plugins: rows }, format)
}
