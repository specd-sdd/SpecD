import { type Command } from 'commander'
import { createConfigWriter } from '@specd/sdk'
import {
  LoadPlugin,
  PluginNotFoundError,
  UninstallPlugin,
  createPluginLoader,
} from '@specd/plugin-manager'
import { findDeclaredPlugin } from './get-declared-plugins.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { CliExitError } from '../../helpers/cli-exit-error.js'

/**
 * One plugin-uninstall result entry.
 */
interface PluginUninstallEntry {
  /** Plugin package name. */
  readonly name: string
  /** Result status. */
  readonly status: 'uninstalled' | 'skipped' | 'error'
  /** Human-readable detail. */
  readonly detail: string
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
          plugins: false,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const writer = createConfigWriter()
        const loader = createPluginLoader({ config })
        const load = new LoadPlugin(loader)
        const uninstall = new UninstallPlugin(loader)

        const plugins: PluginUninstallEntry[] = []
        let hasErrors = false
        const processed = new Set<string>()

        for (const pluginName of pluginNames) {
          if (processed.has(pluginName)) {
            plugins.push({ name: pluginName, status: 'skipped', detail: 'already processed' })
            continue
          }
          processed.add(pluginName)
          try {
            const declared = findDeclaredPlugin(config, pluginName)
            if (declared === undefined) {
              throw new Error(`plugin '${pluginName}' is not declared in specd.yaml`)
            }
            let detail = `uninstalled '${pluginName}'`
            // No hook can run for a plugin that cannot be loaded: only the declaration remains.
            const loadFailure = await load.execute({ pluginName }).then(
              () => undefined,
              (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
            )
            if (loadFailure === undefined) {
              await uninstall.execute({
                pluginName,
                config,
                ...(declared.contributions !== undefined
                  ? { contributions: declared.contributions }
                  : {}),
              })
            } else if (loadFailure instanceof PluginNotFoundError) {
              detail = 'package not found; only the declaration was removed'
            } else {
              detail = `plugin failed to load (${loadFailure.message}); only the declaration was removed`
            }
            await writer.removePlugin(configPath, pluginName)
            plugins.push({ name: pluginName, status: 'uninstalled', detail })
          } catch (error) {
            hasErrors = true
            plugins.push({
              name: pluginName,
              status: 'error',
              detail: formatError(error),
            })
          }
        }

        renderUninstallOutput(plugins, fmt)
        if (hasErrors) {
          throw new CliExitError(1)
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
function renderUninstallOutput(plugins: PluginUninstallEntry[], format: OutputFormat): void {
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
