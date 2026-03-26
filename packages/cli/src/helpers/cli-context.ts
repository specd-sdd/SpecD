import { type Kernel, type SpecdConfig } from '@specd/core'
import { createCliKernel } from '../kernel.js'
import { loadConfig, resolveConfigPath } from '../load-config.js'

/**
 * The resolved CLI context containing config and kernel.
 */
export interface CliContext {
  /** The loaded specd configuration. */
  readonly config: SpecdConfig
  /** Absolute path to the config file that was loaded, or `null` when not locatable. */
  readonly configFilePath: string | null
  /** The wired kernel instance. */
  readonly kernel: Kernel
}

/**
 * Loads config and creates the CLI kernel.
 *
 * This consolidates the repeated `loadConfig` + `createCliKernel`
 * boilerplate found across CLI commands.
 *
 * @param options - Optional overrides
 * @param options.configPath - Path to specd.yaml config file
 * @returns The resolved CLI context
 */
export async function resolveCliContext(options?: {
  configPath?: string | undefined
}): Promise<CliContext> {
  const [config, configFilePath] = await Promise.all([
    loadConfig(options),
    resolveConfigPath(options),
  ])
  const kernel = await createCliKernel(config)
  return { config, configFilePath, kernel }
}
