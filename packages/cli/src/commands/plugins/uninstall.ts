import { type Command } from 'commander'
import type { SpecdConfig } from '@specd/sdk'
import { createConfigWriter } from '@specd/sdk'
import { LoadPlugin, UninstallPlugin, createPluginLoader } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { toPluginBucket } from './plugin-bucket.js'

/**
 * One plugin-uninstall result entry.
 */
interface PluginUninstallEntry {
  /** Plugin package name. */
  readonly name: string
  /** Result status. */
  readonly status: 'uninstalled' | 'error'
  /** Human-readable detail. */
  readonly detail: string
}

/**
 * Orchestrates plugin uninstall and config persistence.
 *
 * @param input - Uninstall input.
 * @param input.config - Fully-resolved project configuration.
 * @param input.configPath - Absolute path to `specd.yaml`.
 * @param input.pluginNames - Plugin package names to uninstall.
 * @returns Per-plugin results and aggregate error state.
 */
export async function uninstallPluginsWithKernel(input: {
  readonly config: SpecdConfig
  readonly configPath: string
  readonly pluginNames: readonly string[]
}): Promise<{ readonly plugins: readonly PluginUninstallEntry[]; readonly hasErrors: boolean }> {
  const writer = createConfigWriter()
  const loader = createPluginLoader({ config: input.config })
  const load = new LoadPlugin(loader)
  const uninstall = new UninstallPlugin(loader)

  const plugins: PluginUninstallEntry[] = []
  let hasErrors = false

  for (const pluginName of input.pluginNames) {
    try {
      const loaded = await load.execute({ pluginName })
      const bucket = toPluginBucket(loaded.plugin.type)
      await uninstall.execute({ pluginName, config: input.config })
      await writer.removePlugin(input.configPath, bucket, pluginName)
      plugins.push({
        name: pluginName,
        status: 'uninstalled',
        detail: `uninstalled '${pluginName}'`,
      })
    } catch (error) {
      hasErrors = true
      plugins.push({
        name: pluginName,
        status: 'error',
        detail: formatError(error),
      })
    }
  }

  return { plugins, hasErrors }
}

/**
 * Registers the `plugins uninstall` subcommand.
 *
 * @param parent - Parent command.
 */
export function registerPluginsUninstall(parent: Command): void {
  parent
    .command('uninstall <plugin...>')
    .allowExcessArguments(false)
    .description('Uninstall one or more plugins and remove declarations from specd.yaml.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (pluginNames: string[], opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const result = await uninstallPluginsWithKernel({
          config,
          configPath,
          pluginNames,
        })

        renderUninstallOutput(result.plugins, fmt)
        if (result.hasErrors) {
          process.exit(1)
        }
      } catch (error) {
        handleError(error, opts.format)
      }
    })
}

/**
 * Renders uninstall output.
 *
 * @param plugins - Result entries.
 * @param format - Selected output format.
 */
function renderUninstallOutput(
  plugins: readonly PluginUninstallEntry[],
  format: OutputFormat,
): void {
  if (format === 'text') {
    for (const entry of plugins) {
      output(`${entry.name}  ${entry.status}  ${entry.detail}`, 'text')
    }
    return
  }
  output({ plugins }, format)
}

/**
 * Normalizes unknown errors into display-safe strings.
 *
 * @param error - Unknown thrown value.
 * @returns Human-readable error text.
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
