import { SpecdError } from '@specd/core'

/**
 * Thrown when two contribution-kind handlers register the same kind.
 *
 * This is a host wiring error, not a plugin error, so it carries the kind
 * and no plugin name.
 */
export class DuplicateHandlerKindError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'DUPLICATE_HANDLER_KIND' {
    return 'DUPLICATE_HANDLER_KIND'
  }

  /**
   * Creates the error.
   *
   * @param kind - Contribution kind registered more than once
   */
  constructor(readonly kind: string) {
    super(
      `Contribution kind '${kind}' has more than one handler; register at most one handler per kind (the built-in 'agents' handler is always present)`,
    )
  }
}
