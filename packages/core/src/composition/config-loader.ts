import { type ConfigLoader } from '../application/ports/config-loader.js'
import { FsConfigLoader, type FsConfigLoaderOptions } from '../infrastructure/fs/config-loader.js'

export { type FsConfigLoaderOptions } from '../infrastructure/fs/config-loader.js'

/**
 * Creates a filesystem-backed `ConfigLoader` that discovers and parses
 * `specd.yaml`.
 *
 * @param options - Either `{ startDir }` for discovery mode or `{ configPath }` for forced mode
 * @returns A `ConfigLoader` instance backed by the filesystem
 */
export function createConfigLoader(options: FsConfigLoaderOptions): ConfigLoader {
  return new FsConfigLoader(options)
}
