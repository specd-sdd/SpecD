import { createConfigLoader, type SpecdConfig } from '@specd/sdk'

/**
 * Loads the project configuration using `createConfigLoader`.
 *
 * If `configPath` is provided (from `--config`), loads that file directly.
 * Otherwise, discovers `specd.yaml` by walking up from `process.cwd()`.
 *
 * @param options - Load options
 * @param options.configPath - Optional absolute path to `specd.yaml`
 * @returns The fully-resolved project configuration
 * @throws {ConfigValidationError} If the config file fails validation
 */
export async function loadConfig(options?: {
  configPath?: string | undefined
}): Promise<SpecdConfig> {
  const loader = createConfigLoader(
    options?.configPath !== undefined
      ? { configPath: options.configPath }
      : { startDir: process.cwd() },
  )
  const config = await loader.load()
  if (config.warnings !== undefined && config.warnings.length > 0) {
    for (const warning of config.warnings) {
      console.warn(`warning: ${warning}`)
    }
  }
  return config
}

/**
 * Resolves the path to the active config file without loading it.
 *
 * @param options - Resolution options
 * @param options.configPath - Optional absolute path to `specd.yaml`
 * @returns Absolute path to the config file, or `null` if not locatable
 */
export function resolveConfigPath(options?: {
  configPath?: string | undefined
}): Promise<string | null> {
  const loader = createConfigLoader(
    options?.configPath !== undefined
      ? { configPath: options.configPath }
      : { startDir: process.cwd() },
  )
  return loader.resolvePath()
}
