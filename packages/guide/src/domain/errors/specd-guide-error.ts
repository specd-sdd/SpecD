/**
 * Base error class for all @specd/guide errors.
 * Conforms to the SpecD Error Contract via duck typing without importing from @specd/core.
 */
export abstract class SpecdGuideError extends Error {
  /**
   * SpecD error discriminator.
   *
   * @returns true
   */
  get specd(): true {
    return true
  }

  /**
   * Machine-readable error code in UPPER_SNAKE_CASE.
   *
   * @returns The error code
   */
  abstract get code(): string

  /**
   * Creates a new SpecdGuideError.
   *
   * @param message - Human-readable error description
   */
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
