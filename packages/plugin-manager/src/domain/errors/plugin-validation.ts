import { SpecdError } from '@specd/core'

/**
 * Error thrown when plugin metadata or runtime contract validation fails.
 */
export class PluginValidationError extends SpecdError {
  private readonly _pluginName: string
  private readonly _fields: readonly string[]

  /**
   * Machine-readable error code.
   */
  get code(): string {
    return 'PLUGIN_VALIDATION_ERROR'
  }

  /**
   * Plugin package name that failed validation.
   */
  get pluginName(): string {
    return this._pluginName
  }

  /**
   * Fields that failed validation.
   */
  get fields(): readonly string[] {
    return this._fields
  }

  /**
   * Creates a new plugin-validation error.
   *
   * @param pluginName - Plugin package name.
   * @param fields - Invalid field names.
   */
  constructor(pluginName: string, fields: readonly string[]) {
    super(`Plugin '${pluginName}' failed validation: ${fields.join(', ')}`)
    this._pluginName = pluginName
    this._fields = fields
  }
}
