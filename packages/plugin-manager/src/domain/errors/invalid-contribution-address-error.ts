import { SpecdError } from '@specd/core'

/**
 * Thrown when a contribution address cannot be split into a plugin name and an id.
 *
 * The address is not stored as a plugin name.
 */
export class InvalidContributionAddressError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'INVALID_CONTRIBUTION_ADDRESS' {
    return 'INVALID_CONTRIBUTION_ADDRESS'
  }

  /**
   * Creates the error.
   *
   * @param address - The value that was parsed
   */
  constructor(readonly address: string) {
    super(`Contribution address '${address}' must be '<plugin name>.<id>' with exactly one '.'`)
  }
}
