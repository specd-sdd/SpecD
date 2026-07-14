import { SpecdError } from './specd-error.js'

/**
 * Thrown when a storage adapter name is requested but has not been registered.
 */
export class UnknownAdapterError extends SpecdError {
  private readonly _adapter: string
  private readonly _capability: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'UNKNOWN_ADAPTER_ERROR'
  }

  /** The adapter name that was not found. */
  get adapter(): string {
    return this._adapter
  }

  /** The repository capability type (e.g. `'change'`, `'spec'`). */
  get capability(): string {
    return this._capability
  }

  /**
   * Creates a new `UnknownAdapterError`.
   *
   * @param adapter - The name of the unregistered adapter
   * @param capability - The repository type where it was requested
   */
  constructor(adapter: string, capability: string) {
    super(`Unknown storage adapter '${adapter}' for capability '${capability}'`)
    this._adapter = adapter
    this._capability = capability
  }
}
