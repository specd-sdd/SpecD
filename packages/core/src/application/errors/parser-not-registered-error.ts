import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a required artifact parser is not registered.
 */
export class ParserNotRegisteredError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'PARSER_NOT_REGISTERED'
  }

  /**
   * Creates a new `ParserNotRegisteredError` instance.
   *
   * @param format - The format name that has no registered parser
   * @param context - Optional context about why the parser was needed
   */
  constructor(format: string, context?: string) {
    const suffix = context !== undefined ? ` (${context})` : ''
    super(`No parser registered for format '${format}'${suffix}`)
  }
}
