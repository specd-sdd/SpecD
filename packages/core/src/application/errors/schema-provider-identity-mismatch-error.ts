import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when `SchemaProvider.get` resolves a schema whose name does not
 * match the name requested for a change. Signals the provider returned the
 * wrong schema module rather than a compatible version mismatch.
 */
export class SchemaProviderIdentityMismatchError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'SCHEMA_PROVIDER_IDENTITY_MISMATCH'
  }

  /**
   * Creates a new `SchemaProviderIdentityMismatchError` instance.
   *
   * @param changeName - The name of the change being resolved
   * @param expectedSchemaName - The schema name requested from the provider
   * @param actualSchemaName - The schema name actually returned by the provider
   * @param subject - What `changeName` identifies in the message (`'change'` by default, or `'spec'`)
   */
  constructor(
    readonly changeName: string,
    readonly expectedSchemaName: string,
    readonly actualSchemaName: string,
    subject: 'change' | 'spec' = 'change',
  ) {
    super(
      `Schema provider returned '${actualSchemaName}' for ${subject} '${changeName}' ` +
        `when '${expectedSchemaName}' was requested.`,
    )
  }
}
