import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Error thrown when a persisted SQLite graph storage schema is incompatible
 * with the expected schema version, requiring a destructive reindex.
 */
export class GraphSchemaIncompatibleError extends SpecdCodeGraphError {
  /**
   * Returns the machine-readable error code.
   * @returns The error code 'GRAPH_SCHEMA_INCOMPATIBLE'.
   */
  get code(): string {
    return 'GRAPH_SCHEMA_INCOMPATIBLE'
  }

  /**
   * Creates a new GraphSchemaIncompatibleError.
   * @param message - Human-readable message describing the incompatible schema.
   */
  constructor(message: string) {
    super(message)
  }
}
