import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a requested spec id is not present in the graph store.
 */
export class SpecNotFoundError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code `SPEC_NOT_FOUND`.
   */
  get code(): string {
    return 'SPEC_NOT_FOUND'
  }

  /**
   * Creates a new SpecNotFoundError.
   * @param specId - The requested spec identifier.
   */
  constructor(specId: string) {
    super(`No spec found matching "${specId}".`)
  }
}
