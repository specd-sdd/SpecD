import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a language adapter fails registration-time validation.
 *
 * `LanguageAdapter` is public API and adapters may be written outside this repository, so the
 * registry validates the adapter shape before changing any state.
 */
export class InvalidLanguageAdapterError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'INVALID_LANGUAGE_ADAPTER'.
   */
  get code(): string {
    return 'INVALID_LANGUAGE_ADAPTER'
  }

  /**
   * Creates a new InvalidLanguageAdapterError.
   * @param languageIds - Language identifiers declared by the adapter, empty when unknown.
   * @param rule - The validation rule that failed, in plain words.
   * @param member - The offending adapter or facet member, when the rule concerns one.
   */
  constructor(languageIds: readonly string[], rule: string, member?: string) {
    super(
      `Invalid language adapter [${languageIds.length > 0 ? languageIds.join(', ') : 'unknown'}]: ${rule}` +
        (member === undefined ? '' : ` (member "${member}")`),
    )
  }
}
