import { type Command } from 'commander'
import type { Kernel } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import {
  InstallPlugin,
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
 * @param input.kernel - CLI kernel.
 * @param input.projectRoot - Absolute project root.
 * @param input.configPath - Absolute path to `specd.yaml`.
 * @param input.pluginNames - Plugin package names to process.
 * @returns Batch result entries and aggregate error state.
 */
export async function installPluginsWithKernel(input: {
  readonly kernel: Kernel
  readonly projectRoot: string
  readonly configPath: string
  readonly pluginNames: readonly string[]
}): Promise<PluginInstallBatchResult> {
  const loader = createPluginLoader({ projectRoot: input.projectRoot })
  const install = new InstallPlugin(loader)
  const load = new LoadPlugin(loader)
  const declared = await input.kernel.project.listPlugins.execute({
    configPath: input.configPath,
    type: 'agents',
  })
  const declaredSet = new Set(declared.map((entry) => entry.name))

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
      const detail = `${pluginName} already installed; use update to reinstall`
      process.stderr.write(`warning: ${detail}\n`)
      plugins.push({
        name: pluginName,
        status: 'skipped',
        detail,
      })
      continue
    }

    try {
      const loaded = await load.execute({ pluginName })
      const installResult: InstallPluginOutput = await install.execute({
        pluginName,
        projectRoot: input.projectRoot,
      })
      const pluginBucket = toPluginBucket(loaded.plugin.type)
      await input.kernel.project.addPlugin.execute({
        configPath: input.configPath,
        type: pluginBucket,
        name: pluginName,
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
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (pluginNames: string[], opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath, kernel } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const result = await installPluginsWithKernel({
          kernel,
          projectRoot: config.projectRoot,
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
 * Maps a plugin runtime type to the config bucket key.
 *
 * @param pluginType - Runtime plugin type.
 * @returns Config bucket name under `plugins`.
 */
function toPluginBucket(pluginType: string): string {
  return pluginType === 'agent' ? 'agents' : `${pluginType}s`
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
