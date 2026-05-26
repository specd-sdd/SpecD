import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when the configured `plugins.ui` package loads but is not a UI plugin.
 */
export class UiPluginTypeMismatchError extends SpecdError {
  private readonly _pluginName: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'UI_PLUGIN_TYPE_MISMATCH'
  }

  /** Configured npm package name. */
  get pluginName(): string {
    return this._pluginName
  }

  /**
   * Creates a {@link UiPluginTypeMismatchError}.
   *
   * @param pluginName - Package name from `plugins.ui`.
   */
  constructor(pluginName: string) {
    super(`Configured plugin '${pluginName}' is not a UI plugin`)
    this._pluginName = pluginName
  }
}
