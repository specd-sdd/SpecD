import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/**
 * Raised before any write when the stored graph was derived with an incompatible fingerprint
 * and the caller asked to repair it by recreating storage instead of rebuilding in place.
 */
export class GraphDerivationMismatchError extends SpecdCodeGraphError {
  private readonly derivationReason: string

  /**
   * Returns the human-readable reason the derivation is incompatible.
   * @returns The visible rebuild reason.
   */
  get reason(): string {
    return this.derivationReason
  }

  /**
   * Returns the machine-readable error code.
   * @returns The error code 'GRAPH_DERIVATION_MISMATCH'.
   */
  get code(): string {
    return 'GRAPH_DERIVATION_MISMATCH'
  }

  /**
   * Creates a new GraphDerivationMismatchError.
   * @param reason - Visible explanation of the incompatible derivation.
   */
  constructor(reason: string) {
    super(`Graph derivation is incompatible: ${reason}`)
    this.derivationReason = reason
  }
}
