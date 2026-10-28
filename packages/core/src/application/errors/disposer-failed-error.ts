import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Wraps the failure of one kernel disposer. The original failure is available as `cause`.
 */
export class DisposerFailedError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'DISPOSER_FAILED'
  }

  private readonly _disposerName: string

  /**
   * Creates a new `DisposerFailedError` instance.
   *
   * @param disposerName - Name the disposer was registered with
   * @param cause - The original failure thrown or rejected by the disposer
   */
  constructor(disposerName: string, cause: unknown) {
    super(`Disposer '${disposerName}' failed`)
    this._disposerName = disposerName
    // `SpecdError` only takes a message, so the cause is attached after `super`.
    this.cause = cause
  }

  /**
   * Name the failing disposer was registered with.
   *
   * @returns The disposer name
   */
  get disposerName(): string {
    return this._disposerName
  }
}
