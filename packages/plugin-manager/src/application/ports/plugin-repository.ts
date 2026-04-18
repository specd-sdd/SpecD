/**
 * Plugin declaration stored in project config.
 */
export interface DeclaredPlugin {
  /**
   * Plugin package name.
   */
  readonly name: string

  /**
   * Optional plugin-specific config block.
   */
  readonly config?: Record<string, unknown>
}

/**
 * Storage port for plugin declarations.
 */
export interface PluginRepository {
  /**
   * Adds a plugin declaration to a plugin type.
   *
   * @param type - Plugin type key (e.g. `agents`).
   * @param name - Plugin package name.
   * @param config - Optional plugin config.
   * @returns A promise that resolves when persistence completes.
   */
  addPlugin(type: string, name: string, config?: Record<string, unknown>): Promise<void>

  /**
   * Removes a plugin declaration by name.
   *
   * @param type - Plugin type key.
   * @param name - Plugin package name.
   * @returns A promise that resolves when persistence completes.
   */
  removePlugin(type: string, name: string): Promise<void>

  /**
   * Lists plugin declarations, optionally filtered by type.
   *
   * @param type - Optional plugin type filter.
   * @returns Declared plugins.
   */
  listPlugins(type?: string): Promise<readonly DeclaredPlugin[]>
}
