import type { AddPluginOptions, ConfigDeclaredPlugin } from '@specd/core/ports'

/** One declared plugin entry, identical to the core config-writer entry. */
export type DeclaredPlugin = ConfigDeclaredPlugin

/**
 * Persistence port for declared plugins.
 *
 * Method order matches `ConfigWriter`: `configPath` first.
 */
export interface PluginRepositoryPort {
  /**
   * Merges a plugin entry into the project config.
   *
   * @param configPath - Project config path
   * @param name - Scoped plugin name
   * @param options - Contributions and config to merge
   */
  addPlugin(configPath: string, name: string, options?: AddPluginOptions): Promise<void>

  /**
   * Removes a declared plugin.
   *
   * @param configPath - Project config path
   * @param name - Scoped plugin name
   */
  removePlugin(configPath: string, name: string): Promise<void>

  /**
   * Lists declared plugins.
   *
   * @param configPath - Project config path
   * @returns Declared plugin entries
   */
  listPlugins(configPath: string): Promise<readonly DeclaredPlugin[]>
}
