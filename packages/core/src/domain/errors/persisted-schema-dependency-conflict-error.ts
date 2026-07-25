import { SpecdError } from './specd-error.js'

/** Thrown when schema reassignment extracts dependencies that disagree with persisted dependsOn. */
export class PersistedSchemaDependencyConflictError extends SpecdError {
  /**
   * Creates a new PersistedSchemaDependencyConflictError.
   * @param specId - The spec whose dependencies conflict.
   * @param currentDependsOn - Persisted dependency list.
   * @param extractedDependsOn - Dependencies extracted from the target schema.
   */
  constructor(
    readonly specId: string,
    readonly currentDependsOn: readonly string[],
    readonly extractedDependsOn: readonly string[],
  ) {
    super(
      `Spec "${specId}" schema reassignment found dependencies [${extractedDependsOn.join(', ')}] ` +
        `extracted from the target schema that disagree with persisted dependencies [${currentDependsOn.join(', ')}]`,
    )
  }

  /**
   * Machine-readable error code.
   * @returns The error code.
   */
  override get code(): string {
    return 'PERSISTED_SCHEMA_DEPENDENCY_CONFLICT'
  }
}
