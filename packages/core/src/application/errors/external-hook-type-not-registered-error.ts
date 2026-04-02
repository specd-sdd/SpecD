import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a workflow references an external hook type that no runner accepts.
 */
export class ExternalHookTypeNotRegisteredError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'EXTERNAL_HOOK_TYPE_NOT_REGISTERED'
  }

  /**
   * Creates a new `ExternalHookTypeNotRegisteredError` instance.
   *
   * @param hookType - The external hook type that could not be dispatched
   * @param hookId - Optional workflow hook identifier for extra context
   */
  constructor(hookType: string, hookId?: string) {
    const suffix = hookId !== undefined ? ` for hook '${hookId}'` : ''
    super(`No external hook runner registered for type '${hookType}'${suffix}`)
  }
}
