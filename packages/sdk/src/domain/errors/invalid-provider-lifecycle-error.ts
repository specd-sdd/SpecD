import { SpecdError } from '@specd/core'

/**
 * Thrown when `runIndexProjectGraph` receives an existing `provider` alongside
 * transient lifecycle hooks (`beforeOpen` or `afterClose`).
 */
export class InvalidProviderLifecycleError extends SpecdError {
  /**
   * Machine-readable error code used for programmatic handling.
   *
   * @returns The error code string
   */
  get code(): string {
    return 'INVALID_PROVIDER_LIFECYCLE'
  }

  /**
   * Creates a new `InvalidProviderLifecycleError` instance.
   */
  constructor() {
    super(
      "Cannot specify 'beforeOpen' or 'afterClose' lifecycle hooks when providing an existing open 'provider' instance to runIndexProjectGraph.",
    )
  }
}
