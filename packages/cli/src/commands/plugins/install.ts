import { type Command } from 'commander'
import type { SpecdConfig } from '@specd/sdk'
import { createConfigWriter } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { getDeclaredPlugins } from './get-declared-plugins.js'
import { toPluginBucket } from './plugin-bucket.js'
import {
  InstallPlugin,
  InstallUiPlugin,
  LoadPlugin,
  createPluginLoader,
  type InstallPluginOutput,
} from '@specd/plugin-manager'

/**
 * One plugin-install command result entry.
 */
export interface PluginInstallEntry {
  /** Plugin package name. */
  readonly name: string
  /** Result status. */
  readonly status: 'installed' | 'skipped' | 'error'
  /** Human-readable detail. */
  readonly detail: string
}

/**
 * Batch plugin-install result.
 */
export interface PluginInstallBatchResult {
  /** Per-plugin entries in request order. */
  readonly plugins: PluginInstallEntry[]
  /** Whether at least one plugin failed. */
  readonly hasErrors: boolean
}

/**
 * Orchestrates plugin installation and config persistence.
 *
 * @param input - Installation input.
 * @param input.config - Fully-resolved project configuration.
 * @param input.configPath - Absolute path to `specd.yaml`.
 * @param input.pluginNames - Plugin package names to process.
 * @returns Batch result entries and aggregate error state.
 */
export async function installPluginsWithKernel(input: {
  readonly config: SpecdConfig
  readonly configPath: string
  readonly pluginNames: readonly string[]
}): Promise<PluginInstallBatchResult> {
  const loader = createPluginLoader({ config: input.config })
  const installAgent = new InstallPlugin(loader)
  const installUi = new InstallUiPlugin(loader)
  const load = new LoadPlugin(loader)
  const writer = createConfigWriter()
  const declaredByBucket = new Map<string, Set<string>>([
    ['agents', new Set(getDeclaredPlugins(input.config, 'agents').map((entry) => entry.name))],
    ['ui', new Set(getDeclaredPlugins(input.config, 'ui').map((entry) => entry.name))],
  ])

  const plugins: PluginInstallEntry[] = []
  let hasErrors = false

  for (const pluginName of input.pluginNames) {
    if (!isValidPluginName(pluginName)) {
      hasErrors = true
      plugins.push({
        name: pluginName,
        status: 'error',
        detail: `invalid plugin name '${pluginName}'`,
      })
      continue
    }

    try {
      const loaded = await load.execute({ pluginName })
      const pluginBucket = toPluginBucket(loaded.plugin.type)
      const declaredSet = declaredByBucket.get(pluginBucket) ?? new Set<string>()

      if (declaredSet.has(pluginName)) {
        const detail = `${pluginName} already installed; use update to reinstall`
        process.stderr.write(`warning: ${detail}\n`)
        plugins.push({
          name: pluginName,
          status: 'skipped',
          detail,
        })
        continue
      }

      const installResult: InstallPluginOutput =
        loaded.plugin.type === 'ui'
          ? await installUi.execute({
              pluginName,
              config: input.config,
            })
          : await installAgent.execute({
              pluginName,
              config: input.config,
            })
      await writer.addPlugin(input.configPath, pluginBucket, pluginName)
      declaredSet.add(pluginName)
      declaredByBucket.set(pluginBucket, declaredSet)
      plugins.push({
        name: pluginName,
        status: 'installed',
        detail: installResult.message,
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
 * Registers the `plugins install` subcommand.
 *
 * @param parent - Parent command.
 */
export function registerPluginsInstall(parent: Command): void {
  parent
    .command('install <plugin...>')
    .allowExcessArguments(false)
    .description('Install one or more specd plugins and record them in specd.yaml.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (pluginNames: string[], opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const result = await installPluginsWithKernel({
          config,
          configPath,
          pluginNames,
        })

        renderInstallOutput(result, fmt)
        if (result.hasErrors) {
          process.exit(1)
        }
      } catch (error) {
        handleError(error, opts.format)
      }
    })
}

/**
 * Renders install command output.
 *
 * @param result - Install batch result.
 * @param format - Selected output format.
 */
function renderInstallOutput(result: PluginInstallBatchResult, format: OutputFormat): void {
  if (format === 'text') {
    output('Installed plugins:', 'text')
    for (const entry of result.plugins) {
      output(`${entry.name}  ${entry.status}  ${entry.detail}`, 'text')
    }
    return
  }
  output(result, format)
}

/**
 * Validates npm-like plugin package names.
 *
 * @param pluginName - Candidate package name.
 * @returns `true` when syntax looks valid.
 */
function isValidPluginName(pluginName: string): boolean {
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(pluginName)
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
