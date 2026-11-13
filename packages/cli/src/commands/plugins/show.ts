import { type Command } from 'commander'
import {
  LoadPlugin,
  buildContributionAddress,
  createPluginLoader,
  type SpecdPlugin,
  type SpecdPluginManifest,
} from '@specd/plugin-manager'
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
        const { config } = await resolveCliContext({
          configPath: opts.config,
          plugins: false,
        })
        const loader = createPluginLoader({ config })
        const load = new LoadPlugin(loader)
        const { plugin, manifest } = await load.execute({ pluginName })
        const contributions = Object.entries(manifest.contributes).flatMap(([kind, entries]) =>
          Object.keys(entries).map((id) => ({
            kind,
            id,
            address: buildContributionAddress(plugin.name, id),
          })),
        )

        const capabilities = buildCapabilities(plugin, manifest)
        const payload = {
          name: plugin.name,
          version: plugin.version,
          contributions,
          ...(manifest.configSchema !== undefined ? { configSchema: manifest.configSchema } : {}),
          ...(manifest.defaultConfig !== undefined
            ? { defaultConfig: manifest.defaultConfig }
            : {}),
          ...(capabilities.length > 0 ? { capabilities } : {}),
        }

        if (fmt === 'text') {
          output(`name: ${payload.name}`, 'text')
          output(`version: ${payload.version}`, 'text')
          if (payload.contributions.length === 0) {
            output('contributions: (none)', 'text')
          } else {
            output('contributions:', 'text')
            for (const entry of payload.contributions) {
              output(`  ${entry.kind} ${entry.id} ${entry.address}`, 'text')
            }
          }
          if (manifest.configSchema !== undefined) {
            output(`configSchema: ${JSON.stringify(manifest.configSchema)}`, 'text')
          }
          if (manifest.defaultConfig !== undefined) {
            output(`defaultConfig: ${JSON.stringify(manifest.defaultConfig)}`, 'text')
          }
          if (payload.capabilities !== undefined) {
            output(`capabilities: ${payload.capabilities.join(', ')}`, 'text')
          }
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
 * @param manifest - Parsed plugin manifest.
 * @returns Capability names. `init` and `destroy` are the base contract and are
 * not listed. Install hooks are listed when the plugin implements them or
 * declares the `agents` kind.
 */
function buildCapabilities(plugin: SpecdPlugin, manifest: SpecdPluginManifest): string[] {
  const agents = manifest.contributes['agents'] !== undefined
  const capabilities: string[] = []
  if (typeof plugin.install === 'function' || agents) capabilities.push('install')
  if (typeof plugin.uninstall === 'function' || agents) capabilities.push('uninstall')
  return capabilities
}
