import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/** The derived-storage failure kinds that may be repaired by physical recreation. */
export type GraphStorageRecoveryReason = 'SCHEMA_INCOMPATIBLE' | 'CORRUPT'

/**
 * Signals that a graph store could not be opened because its derived SQLite
 * storage is incompatible or corrupt. Callers must explicitly opt into a
 * closed-store recreation; ordinary open and query paths propagate this error.
 */
export class GraphStorageRecoveryRequiredError extends SpecdCodeGraphError {
  private readonly recoveryReason: GraphStorageRecoveryReason

  /** Returns the classified recoverable storage failure. */
  get reason(): GraphStorageRecoveryReason {
    return this.recoveryReason
  }

  /** Returns the stable machine-readable error code. */
  override get code(): string {
    return 'GRAPH_STORAGE_RECOVERY_REQUIRED'
  }

  /**
   * Creates a recoverable graph-storage open error.
   * @param message - Human-readable storage failure detail.
   * @param reason - The recoverable failure classification.
   */
  constructor(message: string, reason: GraphStorageRecoveryReason) {
    super(message)
    this.recoveryReason = reason
  }
}
