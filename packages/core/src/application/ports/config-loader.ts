import { type SpecdConfig } from '../specd-config.js'

/**
 * Port for loading and resolving the active `specd.yaml` configuration.
 *
 * Implementations live in `infrastructure/`:
 * - `FsConfigLoader` — discovers config candidates by walking up from a
 *   directory, resolves an active chain from `specd.yaml`, named variants
 *   (`specd.*.yaml`), local variants (`specd.local.yaml`, `specd.local.*.yaml`),
 *   and validates the merged result before constructing a {@link SpecdConfig}.
 *
 * Delivery mechanisms receive a `ConfigLoader` instance and call `load()` once
 * at startup, then pass the resulting `SpecdConfig` to `createKernel()` or
 * individual use-case factory functions.
 *
 * Two modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir`, bounded by
 *   the nearest git repository root, collects discoverable candidates, and
 *   resolves the active chain. A file without `extends` becomes a standalone
 *   root; `extends: true` inherits from the previous active layer; `extends:
 *   <path>` attaches only when the explicit base is already active.
 * - **Forced mode** (`{ configPath }`) — treats the specified file as a single
 *   explicit entrypoint and resolves only its own `extends` chain as a closed
 *   set. Normal filename discovery does not add additional layers.
 */
export abstract class ConfigLoader {
  /**
   * Creates a new `ConfigLoader`.
   *
   * @param rootPath - Resolved VCS root boundary, or `null` outside a repository
   */
  protected constructor(protected readonly rootPath: string | null) {}

  /**
   * Loads, validates, and returns the fully-resolved project configuration.
   *
   * @returns The resolved `SpecdConfig` with all paths made absolute
   * @throws {@link ConfigValidationError} When no config file is found or the YAML is invalid
   */
  abstract load(): Promise<SpecdConfig>

  /**
   * Resolves the path to the active config file without loading or parsing it.
   *
   * - **Discovery mode**: resolves the active chain's root config path by
   *   walking up from `startDir` (bounded by git root). Returns the root path
   *   of the resolved chain, or `null` if no candidates are found. Never throws.
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
  abstract resolvePath(): Promise<string | null>
}
