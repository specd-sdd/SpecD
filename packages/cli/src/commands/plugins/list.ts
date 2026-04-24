import { type Command } from 'commander'
import { ListPlugins as ListRuntimePlugins, createPluginLoader } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * One `plugins list` row.
 */
interface PluginListRow {
  /** Plugin package name. */
  readonly name: string
  /** Plugin declaration type bucket. */
  readonly type: string
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
    .option('--type <type>', 'plugin type filter (for example: agents)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { type?: string; format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath, kernel } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const types = opts.type === undefined ? ['agents'] : [opts.type]

        const rows: PluginListRow[] = []
        const loader = createPluginLoader({ config })
        const listRuntime = new ListRuntimePlugins(loader)

        for (const type of types) {
          const declared = await kernel.project.listPlugins.execute({ configPath, type })
          if (declared.length === 0) {
            continue
          }
          const runtime = await listRuntime.execute({
            pluginNames: declared.map((entry) => entry.name),
          })
          for (const item of runtime.plugins) {
            if (item.status === 'loaded') {
              rows.push({
                name: item.name,
                type,
                status: 'installed',
                ...(item.plugin?.version !== undefined ? { version: item.plugin.version } : {}),
              })
            } else if (item.status === 'not_found') {
              rows.push({
                name: item.name,
                type,
                status: 'not_found',
                ...(item.error !== undefined ? { detail: item.error } : {}),
              })
            } else {
              rows.push({
                name: item.name,
                type,
                status: 'error',
                ...(item.error !== undefined ? { detail: item.error } : {}),
              })
            }
          }
        }

        renderRows(rows, fmt)
      } catch (error) {
        handleError(error, opts.format)
      }
    })
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
      output(`${row.name}  ${row.type}  ${version}  ${row.status}${detail}`, 'text')
    }
    return
  }
  output({ plugins: rows }, format)
}
