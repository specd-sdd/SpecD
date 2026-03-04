import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when `initProject` is called but a `specd.yaml` already exists
 * and `force` is not set.
 */
export class AlreadyInitialisedError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'ALREADY_INITIALISED'
  }

  /**
   * Creates a new `AlreadyInitialisedError` instance.
   *
   * @param configPath - The path of the existing config file
   */
  constructor(configPath: string) {
    super(`Project already initialised at '${configPath}'`)
  }
}
