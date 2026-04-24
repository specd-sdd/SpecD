import { type Command } from 'commander'
import { LoadPlugin, createPluginLoader } from '@specd/plugin-manager'
import type { SpecdPlugin } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `plugins show` subcommand.
 *
 * @param parent - Parent command.
 */
export function registerPluginsShow(parent: Command): void {
  parent
    .command('show <plugin>')
    .allowExcessArguments(false)
    .description('Show plugin metadata and capabilities.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (pluginName: string, opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config } = await resolveCliContext({ configPath: opts.config })
        const loader = createPluginLoader({ config })
        const load = new LoadPlugin(loader)
        const { plugin } = await load.execute({ pluginName })

        const payload = {
          name: plugin.name,
          type: plugin.type,
          version: plugin.version,
          configSchema: plugin.configSchema,
          capabilities: buildCapabilities(plugin),
        }

        if (fmt === 'text') {
          output(`name: ${payload.name}`, 'text')
          output(`type: ${payload.type}`, 'text')
          output(`version: ${payload.version}`, 'text')
          output(`capabilities: ${payload.capabilities.join(', ')}`, 'text')
          output(`configSchema: ${JSON.stringify(payload.configSchema)}`, 'text')
          return
        }
        output(payload, fmt)
      } catch (error) {
        handleError(error, opts.format)
      }
    })
}

/**
 * Derives a capability list from a plugin instance.
 *
 * @param plugin - Loaded runtime plugin.
 * @returns Capability names.
 */
function buildCapabilities(plugin: SpecdPlugin): string[] {
  const record = plugin as unknown as Record<string, unknown>
  const capabilities = ['init', 'destroy']
  if (typeof record['install'] === 'function') {
    capabilities.push('install')
  }
  if (typeof record['uninstall'] === 'function') {
    capabilities.push('uninstall')
  }
  return capabilities
}
