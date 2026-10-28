import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a path explanation is requested from a provider created without a `specd.yaml` configuration.
 */
export class GraphWhyRequiresConfigError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code `GRAPH_WHY_REQUIRES_CONFIG`.
   */
  get code(): string {
    return 'GRAPH_WHY_REQUIRES_CONFIG'
  }

  /**
   * Creates a new GraphWhyRequiresConfigError.
   */
  constructor() {
    super('path explanation requires a specd.yaml configuration')
  }
}
