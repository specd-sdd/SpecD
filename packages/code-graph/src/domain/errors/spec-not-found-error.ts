import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a requested spec id is not present in the graph store.
 */
export class SpecNotFoundError extends SpecdCodeGraphError {
  private readonly specIdValue: string

  /**
   * Returns the machine-readable error code.
   * @returns The error code `SPEC_NOT_FOUND`.
   */
  get code(): string {
    return 'SPEC_NOT_FOUND'
  }

  /**
   * Returns the requested spec identifier.
   * @returns The spec identifier that was not found.
   */
  get specId(): string {
    return this.specIdValue
  }

  /**
   * Creates a new SpecNotFoundError.
   * @param specId - The requested spec identifier.
   */
  constructor(specId: string) {
    super(`No spec found matching "${specId}".`)
    this.specIdValue = specId
  }
}
