import { type SpecdConfig } from '../specd-config.js'

/**
 * Port for loading and resolving the active `specd.yaml` configuration.
 *
 * Implementations live in `infrastructure/`:
 * - `FsConfigLoader` — discovers `specd.yaml` by walking up from a directory,
 *   honours `specd.local.yaml` overrides, and validates the parsed YAML before
 *   constructing a {@link SpecdConfig}.
 *
 * Delivery mechanisms receive a `ConfigLoader` instance and call `load()` once
 * at startup, then pass the resulting `SpecdConfig` to `createKernel()` or
 * individual use-case factory functions.
 */
export interface ConfigLoader {
  /**
   * Loads, validates, and returns the fully-resolved project configuration.
   *
   * @returns The resolved `SpecdConfig` with all paths made absolute
   * @throws {@link ConfigValidationError} When no config file is found or the YAML is invalid
   */
  load(): Promise<SpecdConfig>
}
