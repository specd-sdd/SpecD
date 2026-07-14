import { type SpecdConfig, UiPluginNotConfiguredError, UiPluginTypeMismatchError } from '@specd/sdk'
import { LoadPlugin, createPluginLoader, isUiPlugin, type UiPlugin } from '@specd/plugin-manager'

/**
 * Resolves the active UI plugin name from project config.
 *
 * @param config - Loaded project configuration.
 * @returns NPM package name of the first `plugins.ui` entry.
 * @throws {UiPluginNotConfiguredError} When no UI plugin is declared.
 */
export function resolveActiveUiPluginName(config: SpecdConfig): string {
  const entry = config.plugins?.ui?.[0]
  if (entry === undefined) {
    throw new UiPluginNotConfiguredError()
  }
  return entry.name
}

/**
 * Loads the active UI plugin from config.
 *
 * @param config - Loaded project configuration.
 * @returns Loaded {@link UiPlugin} instance.
 * @throws {UiPluginNotConfiguredError} When no UI plugin is declared.
 * @throws {UiPluginTypeMismatchError} When the loaded plugin is not a UI plugin.
 */
export async function loadActiveUiPlugin(config: SpecdConfig): Promise<UiPlugin> {
  const pluginName = resolveActiveUiPluginName(config)
  const loader = createPluginLoader({ config })
  const load = new LoadPlugin(loader)
  const { plugin } = await load.execute({ pluginName })
  if (!isUiPlugin(plugin)) {
    throw new UiPluginTypeMismatchError(pluginName)
  }
  return plugin
}
