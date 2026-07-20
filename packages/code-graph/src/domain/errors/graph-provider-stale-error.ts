import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error raised when a provider was opened against an older storage generation.
 */
export class GraphProviderStaleError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code string.
   */
  override get code(): string {
    return 'GRAPH_PROVIDER_STALE'
  }

  /**
   * Creates a new GraphProviderStaleError.
   *
   * @param message - Human-readable message.
   */
  constructor(message: string = 'The graph provider is stale and must be reopened.') {
    super(message)
  }
}
