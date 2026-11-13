import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import type { SpecdPluginManifest } from '../../domain/types/plugin-manifest.js'

/**
 * A plugin whose manifest and runtime contract have been validated.
 */
export interface LoadedPlugin {
  /** Runtime plugin instance. */
  readonly plugin: SpecdPlugin
  /** Parsed manifest, with contribution blocks validated by their handlers. */
  readonly manifest: SpecdPluginManifest
}

/**
 * Port for loading runtime plugin instances.
 */
export interface PluginLoader {
  /**
   * Loads a plugin by package name.
   *
   * @param pluginName - Plugin package name
   * @returns The loaded plugin and its manifest
   * @throws {PluginNotFoundError} When the package cannot be resolved
   * @throws {PluginValidationError} When the manifest or runtime contract is invalid
   */
  load(pluginName: string): Promise<LoadedPlugin>
}
