import { SpecdError } from './specd-error.js'

/** Thrown when `InitializePersistedSpecState` targets a spec that already has persisted state. */
export class SpecAlreadyInitializedError extends SpecdError {
  /**
   * Creates a new SpecAlreadyInitializedError.
   * @param specId - The spec that already has persisted state.
   */
  constructor(readonly specId: string) {
    super(`Spec "${specId}" already has persisted semantic state`)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'SPEC_ALREADY_INITIALIZED'
  }
}
