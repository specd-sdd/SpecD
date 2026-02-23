import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when attempting to create a change whose name is already in use.
 */
export class ChangeAlreadyExistsError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'CHANGE_ALREADY_EXISTS'
  }

  /**
   * @param name - The change name that already exists
   */
  constructor(name: string) {
    super(`Change '${name}' already exists`)
  }
}
