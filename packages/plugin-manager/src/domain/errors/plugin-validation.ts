import { SpecdError } from '@specd/core'
import { describeThrown } from './describe-thrown.js'

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
   * @param cause - Original thrown value when this wraps a failure. Presence is decided by
   *   argument count, so an explicit `undefined` (a `throw undefined`) is still recorded.
   */
  constructor(pluginName: string, fields: readonly string[], ...cause: [cause?: unknown]) {
    super(buildMessage(pluginName, fields, cause))
    this._pluginName = pluginName
    this._fields = fields
    if (cause.length > 0) this.cause = cause[0]
  }
}

/**
 * Builds the error message, including the cause message when one is wrapped.
 *
 * @param pluginName - Plugin package name.
 * @param fields - Invalid field names.
 * @param cause - Zero or one original thrown value.
 * @returns The actionable message.
 */
function buildMessage(
  pluginName: string,
  fields: readonly string[],
  cause: readonly unknown[],
): string {
  const base = `Plugin '${pluginName}' failed validation (${fields.join(', ')})`
  if (cause.length === 0) {
    return `${base}; fix these fields in the plugin package or its specd-plugin.json to match the plugin contract`
  }
  return `${base}: ${describeThrown(cause[0])}; fix the plugin package or its specd-plugin.json and retry`
}
