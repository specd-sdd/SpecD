import { SpecdError } from './specd-error.js'

/** Thrown when `applyPersistedSpecStatePatch()` attempts schema replacement on an existing base. */
export class PersistedSpecStateSchemaReplacementError extends SpecdError {
  /**
   * Creates a new PersistedSpecStateSchemaReplacementError.
   * @param specId - The spec whose schema replacement was rejected.
   */
  constructor(readonly specId: string) {
    super(
      `applyPersistedSpecStatePatch() cannot replace the schema of an existing persisted state for "${specId}" — use UpdatePersistedSpecSchema`,
    )
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'PERSISTED_SPEC_STATE_SCHEMA_REPLACEMENT'
  }
}
