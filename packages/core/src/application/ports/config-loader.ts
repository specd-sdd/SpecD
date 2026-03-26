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
 *
 * Two modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir`, bounded by
 *   the nearest git repository root, to find `specd.yaml` or `specd.local.yaml`.
 * - **Forced mode** (`{ configPath }`) — uses the specified file directly.
 */
export interface ConfigLoader {
  /**
   * Loads, validates, and returns the fully-resolved project configuration.
   *
   * @returns The resolved `SpecdConfig` with all paths made absolute
   * @throws {@link ConfigValidationError} When no config file is found or the YAML is invalid
   */
  load(): Promise<SpecdConfig>

  /**
   * Resolves the path to the active config file without loading or parsing it.
   *
   * - **Discovery mode**: runs the same directory walk as `load()` (honouring
   *   `specd.local.yaml`, bounded by git root). Returns the found path, or
   *   `null` if no file is found. Never throws.
   * - **Forced mode**: returns the resolved absolute path directly. Does not
   *   check whether the file exists. Never throws.
   * - **Adapters without a local file** (e.g. remote adapters): return `null`.
   *
   * The purpose of this method is to allow delivery mechanisms to probe for
   * config presence before deciding to dispatch to a default action (such as
   * auto-showing the project dashboard), without paying the cost of a full load
   * and without silencing load errors for explicitly-provided paths.
   *
   * @returns Absolute path to the config file, or `null` if not locatable
   */
  resolvePath(): Promise<string | null>
}
