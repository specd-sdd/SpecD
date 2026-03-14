import { CodeGraphError } from './code-graph-error.js'

/**
 * Error thrown when an unrecognized relation type string is encountered.
 */
export class InvalidRelationTypeError extends CodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'INVALID_RELATION_TYPE'.
   */
  get code(): string {
    return 'INVALID_RELATION_TYPE'
  }

  /**
   * Creates a new InvalidRelationTypeError.
   * @param type - The invalid relation type string that was provided.
   */
  constructor(type: string) {
    super(`Invalid relation type: "${type}"`)
  }
}
