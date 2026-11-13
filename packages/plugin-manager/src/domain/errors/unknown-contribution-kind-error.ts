import { SpecdError } from '@specd/core'

/**
 * Thrown when a manifest kind has no registered handler.
 */
export class UnknownContributionKindError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'UNKNOWN_CONTRIBUTION_KIND' {
    return 'UNKNOWN_CONTRIBUTION_KIND'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin that declared the kind
   * @param kind - Kind with no handler
   */
  constructor(
    readonly pluginName: string,
    readonly kind: string,
  ) {
    super(
      `Plugin '${pluginName}' declares unknown contribution kind '${kind}'; register a handler for it or remove it from 'contributes'`,
    )
  }
}
