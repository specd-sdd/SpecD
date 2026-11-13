import { ConfigValidationError } from './config-validation-error.js'

/**
 * Thrown when `specd.yaml` still uses the removed `plugins.agents` object.
 *
 * The message includes a copy-pasteable flat-list replacement.
 */
export class LegacyConfigFormatError extends ConfigValidationError {
  /** Machine-readable error code identifying this error class. */
  override get code(): 'LEGACY_CONFIG_FORMAT' {
    return 'LEGACY_CONFIG_FORMAT'
  }

  /**
   * Creates a new `LegacyConfigFormatError`.
   *
   * @param configPath - Path of the config layer that used the legacy shape
   * @param suggestedSnippet - Replacement `configVersion` and `plugins` YAML
   */
  constructor(
    configPath: string,
    readonly suggestedSnippet: string,
  ) {
    super(configPath, "'plugins.agents' is no longer supported")
    this.message = `${configPath}: 'plugins.agents' is no longer supported (LEGACY_CONFIG_FORMAT).\nReplace the 'plugins' section with:\n\n${suggestedSnippet}`
  }
}
