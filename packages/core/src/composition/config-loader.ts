import { type ConfigLoader } from '../application/ports/config-loader.js'
import { FsConfigLoader, type FsConfigLoaderOptions } from '../infrastructure/fs/config-loader.js'
import { createVcsAdapter } from './vcs-adapter.js'
import { NullVcsAdapter } from '../infrastructure/null/vcs-adapter.js'

export { type FsConfigLoaderOptions } from '../infrastructure/fs/config-loader.js'

/**
 * Creates a filesystem-backed `ConfigLoader` that discovers and parses
 * `specd.yaml`.
 *
 * @param options - Either `{ startDir }` for discovery mode or `{ configPath }` for forced mode
 * @returns A `ConfigLoader` instance backed by the filesystem
 */
export async function createDefaultConfigLoader(
  options: FsConfigLoaderOptions,
): Promise<ConfigLoader> {
  const probeDir = 'startDir' in options ? options.startDir : options.configPath
  const vcsAdapter = await createVcsAdapter(probeDir)
  const rootPath =
    vcsAdapter instanceof NullVcsAdapter
      ? null
      : (() => {
          try {
            return vcsAdapter.rootDir()
          } catch {
            return null
          }
        })()
  return new FsConfigLoader(rootPath, options)
}
