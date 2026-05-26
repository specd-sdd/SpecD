import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PluginValidationError,
  createServerUiPlugin,
  type PluginLoaderOptions,
  type UiPlugin,
} from '@specd/plugin-manager'

/**
 * @param packageRoot - Absolute package root.
 * @returns Manifest name and version.
 */
async function readManifest(packageRoot: string): Promise<{ name: string; version: string }> {
  const manifestPath = path.join(packageRoot, 'specd-plugin.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    return JSON.parse(raw) as { name: string; version: string }
  } catch {
    throw new PluginValidationError('@specd/studio-web', ['specd-plugin.json'])
  }
}

/**
 * Creates the Studio web UI plugin with its own HTTP server (Vite).
 *
 * @param _options - Loader options (unused).
 * @returns Own-server {@link UiPlugin} (`hasServer() === true`).
 */
export async function create(_options: PluginLoaderOptions): Promise<UiPlugin> {
  void _options
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = await readManifest(packageRoot)
  return createServerUiPlugin({
    name: manifest.name,
    version: manifest.version,
    packageRoot,
    serverPort: 5174,
  })
}
