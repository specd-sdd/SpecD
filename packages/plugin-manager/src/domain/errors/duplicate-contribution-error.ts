import { SpecdError } from '@specd/core'

/**
 * Thrown when the same contribution id is declared under more than one kind.
 */
export class DuplicateContributionError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'DUPLICATE_CONTRIBUTION_ID' {
    return 'DUPLICATE_CONTRIBUTION_ID'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin that declared the duplicate
   * @param contributionId - Id declared more than once
   */
  constructor(
    readonly pluginName: string,
    readonly contributionId: string,
  ) {
    super(
      `Plugin '${pluginName}' declares contribution id '${contributionId}' more than once; contribution ids must be unique across all kinds`,
    )
  }
}
