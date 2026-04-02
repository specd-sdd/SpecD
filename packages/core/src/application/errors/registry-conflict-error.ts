import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when additive kernel registry inputs would overwrite an existing entry.
 */
export class RegistryConflictError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'REGISTRY_CONFLICT'
  }

  /**
   * Creates a new `RegistryConflictError` instance.
   *
   * @param registry - The registry namespace that contains the conflict
   * @param key - The conflicting name or accepted type
   */
  constructor(registry: string, key: string) {
    super(`Duplicate registration '${key}' in kernel registry '${registry}'`)
  }
}
