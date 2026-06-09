import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when the specd.yaml configuration file is missing.
 */
export class ConfigNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CONFIG_NOT_FOUND'
  }

  /**
   * Creates a new `ConfigNotFoundError` instance.
   *
   * @param path - The expected path of the config file
   */
  constructor(path: string) {
    super(`Config file not found at ${path}`)
  }
}
