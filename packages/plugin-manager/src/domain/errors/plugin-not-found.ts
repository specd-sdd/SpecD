import { SpecdError } from '@specd/core'

/**
 * Error thrown when a plugin package cannot be found.
 */
export class PluginNotFoundError extends SpecdError {
  private readonly _pluginName: string

  /**
   * Machine-readable error code.
   */
  get code(): string {
    return 'PLUGIN_NOT_FOUND'
  }

  /**
   * Plugin package name that was not found.
   */
  get pluginName(): string {
    return this._pluginName
  }

  /**
   * Creates a new plugin-not-found error.
   *
   * @param pluginName - Missing plugin package name.
   */
  constructor(pluginName: string) {
    super(`Plugin '${pluginName}' was not found`)
    this._pluginName = pluginName
  }
}
