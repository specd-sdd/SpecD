import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PluginValidationError,
  createBundleUiPlugin,
  type PluginLoaderOptions,
  type UiPlugin,
} from '@specd/plugin-manager'

/**
 * Reads plugin manifest fields from the package root.
 *
 * @param packageRoot - Absolute package root.
 * @returns Manifest name, version, and optional staticDir.
 */
async function readManifest(packageRoot: string): Promise<{
  name: string
  version: string
  staticDir?: string
}> {
  const manifestPath = path.join(packageRoot, 'specd-plugin.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as {
      name: string
      version: string
      staticDir?: string
    }
    return manifest
  } catch {
    throw new PluginValidationError('@specd/plugin-ui-studio', ['specd-plugin.json'])
  }
}

/**
 * Creates the published Studio UI bundle plugin.
 *
 * @param _options - Loader options (unused).
 * @returns Bundle {@link UiPlugin} (`hasServer() === false`).
 */
export async function create(_options: PluginLoaderOptions): Promise<UiPlugin> {
  void _options
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = await readManifest(packageRoot)
  return createBundleUiPlugin({
    name: manifest.name,
    version: manifest.version,
    packageRoot,
    ...(manifest.staticDir !== undefined ? { staticDir: manifest.staticDir } : {}),
  })
}
