import { type Kernel, type SpecdConfig } from '@specd/core'
import { createCliKernel } from '../kernel.js'
import { loadConfig } from '../load-config.js'
import { buildWorkspaceSchemasPaths } from './workspace-map.js'

/**
 * The resolved CLI context containing config, kernel, and workspace schema paths.
 */
export interface ChangeContext {
  /** The loaded specd configuration. */
  readonly config: SpecdConfig
  /** The wired kernel instance. */
  readonly kernel: Kernel
  /** Map of workspace name to absolute schemas path. */
  readonly workspaceSchemasPaths: Map<string, string>
}

/**
 * Loads config, creates the CLI kernel, and builds workspace schema paths.
 *
 * This consolidates the repeated `loadConfig` + `createCliKernel` +
 * `buildWorkspaceSchemasPaths` boilerplate found across CLI commands.
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
  const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
  return { config, kernel, workspaceSchemasPaths }
}
