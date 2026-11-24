import { ConfigValidationError } from './config-validation-error.js'

/** Highest `configVersion` this build of specd can load. */
export const CURRENT_CONFIG_VERSION = 2

/**
 * Thrown when a config layer declares a `configVersion` newer than this build.
 */
export class UnsupportedConfigVersionError extends ConfigValidationError {
  /** Machine-readable error code identifying this error class. */
  override get code(): 'UNSUPPORTED_CONFIG_VERSION' {
    return 'UNSUPPORTED_CONFIG_VERSION'
  }

  /**
   * Creates a new `UnsupportedConfigVersionError`.
   *
   * @param configPath - Path of the config layer that declared the version
   * @param found - Version declared in the file
   * @param supported - Highest version this build accepts
   */
  constructor(
    configPath: string,
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      configPath,
      `configVersion ${found} is newer than supported (${supported}); upgrade specd`,
    )
    this.message = `${configPath}: specd.yaml configVersion ${found} is newer than supported (${supported}); upgrade specd`
  }
}
