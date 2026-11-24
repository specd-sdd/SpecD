import { SpecdError } from '@specd/core'

/**
 * Thrown when plugin config or `defaultConfig` violates the manifest schema.
 */
export class InvalidPluginConfigError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'INVALID_PLUGIN_CONFIG' {
    return 'INVALID_PLUGIN_CONFIG'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin whose config failed
   * @param issues - `path: message` entries
   */
  constructor(
    readonly pluginName: string,
    readonly issues: readonly string[],
  ) {
    super(
      `Plugin '${pluginName}' has invalid config: ${issues.join('; ')}; fix the plugin config so it matches the plugin configSchema`,
    )
  }
}
