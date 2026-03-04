import { createConfigLoader, type SpecdConfig } from '@specd/core'

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
export function loadConfig(options?: { configPath?: string | undefined }): Promise<SpecdConfig> {
  const loader = createConfigLoader(
    options?.configPath !== undefined
      ? { configPath: options.configPath }
      : { startDir: process.cwd() },
  )
  return loader.load()
}
