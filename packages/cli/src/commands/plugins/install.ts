import { type Command } from 'commander'
import type { SpecdConfig } from '@specd/sdk'
import { createConfigWriter, isPluginName } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'
import { getDeclaredPlugins } from './get-declared-plugins.js'
import { InstallPlugin, createPluginLoader, type InstallPluginOutput } from '@specd/plugin-manager'
import { CliExitError } from '../../helpers/cli-exit-error.js'

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
 * @param input.contributions - Optional contribution allowlist for a single plugin.
 * @returns Batch result entries and aggregate error state.
 */
export async function installPluginsWithKernel(input: {
  readonly config: SpecdConfig
  readonly configPath: string
  readonly pluginNames: readonly string[]
  readonly contributions?: readonly string[]
}): Promise<PluginInstallBatchResult> {
  const loader = createPluginLoader({ config: input.config })
  const install = new InstallPlugin(loader)
  const writer = createConfigWriter()
  const declaredSet = new Set(getDeclaredPlugins(input.config).map((entry) => entry.name))

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

    if (declaredSet.has(pluginName)) {
      const detail = `${pluginName} already installed; use 'specd plugins update'`
      process.stderr.write(`warning: ${detail}\n`)
      plugins.push({
        name: pluginName,
        status: 'skipped',
        detail,
      })
      continue
    }

    try {
      const installResult: InstallPluginOutput = await install.execute({
        pluginName,
        config: input.config,
        ...(input.contributions !== undefined ? { contributions: input.contributions } : {}),
      })
      await writer.addPlugin(input.configPath, pluginName, {
        ...(installResult.defaultConfig !== undefined
          ? { config: installResult.defaultConfig }
          : {}),
        ...(input.contributions !== undefined ? { contributions: input.contributions } : {}),
      })
      declaredSet.add(pluginName)
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
    .option(
      '--contributions <ids>',
      'comma-separated contribution ids (one plugin only; an empty value is rejected)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        pluginNames: string[],
        opts: { format: string; config?: string; contributions?: string },
      ) => {
        try {
          const fmt = parseFormat(opts.format)
          const contributions =
            opts.contributions === undefined
              ? undefined
              : opts.contributions
                  .split(',')
                  .map((id) => id.trim())
                  .filter((id) => id.length > 0)
          if (contributions !== undefined && contributions.length === 0) {
            cliError('--contributions requires at least one contribution id', opts.format)
          }
          if (contributions !== undefined && pluginNames.length !== 1) {
            cliError('--contributions requires exactly one plugin', opts.format)
          }
          const { config, configFilePath } = await resolveCliContext({
            configPath: opts.config,
            plugins: false,
          })
          const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
          const result = await installPluginsWithKernel({
            config,
            configPath,
            pluginNames,
            ...(contributions !== undefined ? { contributions } : {}),
          })

          renderInstallOutput(result, fmt)
          if (result.hasErrors) {
            throw new CliExitError(1)
          }
        } catch (error) {
          handleError(error, opts.format)
        }
      },
    )
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
 * Validates a scoped plugin package name.
 *
 * @param pluginName - Candidate package name
 * @returns `true` when the name matches the shared plugin-name rule
 */
function isValidPluginName(pluginName: string): boolean {
  return isPluginName(pluginName)
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
