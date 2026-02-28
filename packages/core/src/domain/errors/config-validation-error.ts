import { SpecdError } from './specd-error.js'

/**
 * Thrown when `specd.yaml` (or `specd.local.yaml`) fails structural validation.
 *
 * Distinct from {@link SchemaValidationError}: config errors indicate a problem
 * with `specd.yaml` itself; schema errors indicate a problem with the referenced
 * schema file.
 */
export class ConfigValidationError extends SpecdError {
  private readonly _configPath: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'CONFIG_VALIDATION_ERROR'
  }

  /** The config file path where the error was detected. */
  get configPath(): string {
    return this._configPath
  }

  /**
   * Creates a new `ConfigValidationError`.
   *
   * @param configPath - The path to the config file that failed validation
   * @param reason - Human-readable description of the constraint violation
   */
  constructor(configPath: string, reason: string) {
    super(`Config validation failed in '${configPath}': ${reason}`)
    this._configPath = configPath
  }
}
