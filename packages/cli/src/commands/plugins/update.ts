import { type Command } from 'commander'
import type { Kernel, SpecdConfig } from '@specd/core'
import { UpdatePlugin, createPluginLoader } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * One plugin-update command result entry.
 */
export interface PluginUpdateEntry {
  /** Plugin package name. */
  readonly name: string
  /** Result status. */
  readonly status: 'updated' | 'skipped' | 'error'
  /** Human-readable detail. */
  readonly detail: string
}

/**
 * Batch plugin-update result.
 */
export interface PluginUpdateBatchResult {
  /** Per-plugin entries. */
  readonly plugins: PluginUpdateEntry[]
  /** Whether at least one plugin failed. */
  readonly hasErrors: boolean
}

/**
 * Updates declared plugins with optional name filtering.
 *
 * @param input - Update input.
 * @param input.kernel - CLI kernel.
 * @param input.config - Fully-resolved project configuration.
 * @param input.configPath - Absolute path to `specd.yaml`.
 * @param input.pluginNames - Optional plugin-name filter.
 * @returns Batch update results.
 */
export async function updatePluginsWithKernel(input: {
  readonly kernel: Kernel
  readonly config: SpecdConfig
  readonly configPath: string
  readonly pluginNames?: readonly string[]
}): Promise<PluginUpdateBatchResult> {
  const declared = await input.kernel.project.listPlugins.execute({
    configPath: input.configPath,
    type: 'agents',
  })
  const declaredMap = new Map(declared.map((plugin) => [plugin.name, plugin]))

  const selectedNames =
    input.pluginNames !== undefined && input.pluginNames.length > 0
      ? [...input.pluginNames]
      : declared.map((plugin) => plugin.name)

  const loader = createPluginLoader({ config: input.config })
  const update = new UpdatePlugin(loader)
  const plugins: PluginUpdateEntry[] = []
  let hasErrors = false

  for (const pluginName of selectedNames) {
    const declaration = declaredMap.get(pluginName)
    if (declaration === undefined) {
      plugins.push({
        name: pluginName,
        status: 'skipped',
        detail: `plugin '${pluginName}' is not declared in specd.yaml`,
      })
      continue
    }

    try {
      await update.execute({
        pluginName,
        config: input.config,
        ...(declaration.config !== undefined ? { options: declaration.config } : {}),
      })
      plugins.push({
        name: pluginName,
        status: 'updated',
        detail: `updated '${pluginName}'`,
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
 * Registers the `plugins update` subcommand.
 *
 * @param parent - Parent command.
 */
export function registerPluginsUpdate(parent: Command): void {
  parent
    .command('update [plugin...]')
    .allowExcessArguments(false)
    .description('Update declared plugins (all by default).')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (pluginNames: string[], opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath, kernel } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const result = await updatePluginsWithKernel({
          kernel,
          config,
          configPath,
          ...(pluginNames.length > 0 ? { pluginNames } : {}),
        })

        renderUpdateOutput(result, fmt)
        if (result.hasErrors) {
          process.exit(1)
        }
      } catch (error) {
        handleError(error, opts.format)
      }
    })
}

/**
 * Renders update command output.
 *
 * @param result - Update batch result.
 * @param format - Selected output format.
 */
function renderUpdateOutput(result: PluginUpdateBatchResult, format: OutputFormat): void {
  if (format === 'text') {
    if (result.plugins.length === 0) {
      output('no plugins to update', 'text')
      return
    }
    for (const entry of result.plugins) {
      output(`${entry.name}  ${entry.status}  ${entry.detail}`, 'text')
    }
    return
  }
  output(result, format)
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
