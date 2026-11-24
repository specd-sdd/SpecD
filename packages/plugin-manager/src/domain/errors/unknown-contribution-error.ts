import { SpecdError } from '@specd/core'

/**
 * Thrown when an allowlist names a contribution id the manifest does not declare.
 */
export class UnknownContributionError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'UNKNOWN_CONTRIBUTION' {
    return 'UNKNOWN_CONTRIBUTION'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin whose manifest was checked
   * @param contributionId - Id that is not declared
   */
  constructor(
    readonly pluginName: string,
    readonly contributionId: string,
  ) {
    super(
      `Plugin '${pluginName}' does not declare contribution '${contributionId}'; use only ids listed under 'contributes' in its specd-plugin.json`,
    )
  }
}
