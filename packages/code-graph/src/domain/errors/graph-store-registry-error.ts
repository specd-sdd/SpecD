import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Thrown when a graph store registration fails or a requested store is not found.
 */
export class GraphStoreRegistryError extends SpecdCodeGraphError {
  /** Machine-readable error code. */
  override get code(): string {
    return 'GRAPH_STORE_REGISTRY_ERROR'
  }

  /**
   * Creates a new GraphStoreRegistryError.
   * @param message - Human-readable message.
   */
  constructor(message: string) {
    super(message)
  }

  /**
   * Helper to create a "not found" error.
   * @param id - The store ID.
   * @returns A new GraphStoreRegistryError instance.
   */
  static notFound(id: string): GraphStoreRegistryError {
    return new GraphStoreRegistryError(`graph store '${id}' is not registered`)
  }

  /**
   * Helper to create an "already registered" error.
   * @param id - The store ID.
   * @returns A new GraphStoreRegistryError instance.
   */
  static alreadyRegistered(id: string): GraphStoreRegistryError {
    return new GraphStoreRegistryError(`graph store '${id}' is already registered`)
  }
}
