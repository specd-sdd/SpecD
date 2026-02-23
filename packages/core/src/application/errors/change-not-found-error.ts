import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a requested change does not exist in the repository.
 */
export class ChangeNotFoundError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CHANGE_NOT_FOUND'
  }

  /**
   * @param name - The change name that was not found
   */
  constructor(name: string) {
    super(`Change '${name}' not found`)
  }
}
