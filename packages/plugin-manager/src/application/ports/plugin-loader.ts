import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'

/**
 * Port for loading runtime plugin instances.
 */
export interface PluginLoader {
  /**
   * Loads a plugin by package name.
   *
   * @param pluginName - Plugin package name.
   * @returns Validated plugin instance.
   * @throws {PluginNotFoundError} When the package cannot be resolved.
   * @throws {PluginValidationError} When the manifest or runtime contract is invalid.
   */
  load(pluginName: string): Promise<SpecdPlugin>
}
