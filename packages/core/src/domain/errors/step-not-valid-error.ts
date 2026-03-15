import { SpecdError } from './specd-error.js'

/**
 * Thrown when a step name does not correspond to a valid lifecycle state.
 */
export class StepNotValidError extends SpecdError {
  private readonly _step: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'STEP_NOT_VALID'
  }

  /**
   * Creates a new `StepNotValidError` for the given step name.
   *
   * @param step - The invalid step name
   */
  constructor(step: string) {
    super(`Step '${step}' is not a valid lifecycle state`)
    this._step = step
  }

  /** The invalid step name. */
  get step(): string {
    return this._step
  }
}
