import { SpecdError } from './specd-error.js'

/** Thrown when a persisted-state operation targets a spec with no lock yet. */
export class SpecNotInitializedError extends SpecdError {
  /**
   * Creates a new SpecNotInitializedError.
   * @param specId - The spec missing persisted semantic state.
   */
  constructor(readonly specId: string) {
    super(`Spec "${specId}" has no persisted semantic state — run "specs init" first`)
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'SPEC_NOT_INITIALIZED'
  }
}
