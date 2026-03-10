import { type Kernel, type SpecdConfig } from '@specd/core'
import { createCliKernel } from '../kernel.js'
import { loadConfig } from '../load-config.js'

/**
 * The resolved CLI context containing config and kernel.
 */
export interface ChangeContext {
  /** The loaded specd configuration. */
  readonly config: SpecdConfig
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
export async function resolveChangeContext(options?: {
  configPath?: string | undefined
}): Promise<ChangeContext> {
  const config = await loadConfig({ configPath: options?.configPath })
  const kernel = createCliKernel(config)
  return { config, kernel }
}
