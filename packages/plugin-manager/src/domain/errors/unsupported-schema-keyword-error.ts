import { SpecdError } from '@specd/core'

/**
 * Thrown when a config schema uses a keyword outside the supported subset.
 */
export class UnsupportedSchemaKeywordError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'UNSUPPORTED_SCHEMA_KEYWORD' {
    return 'UNSUPPORTED_SCHEMA_KEYWORD'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin that declared the schema
   * @param keyword - Offending keyword
   * @param reason - Why a supported keyword is invalid; omit when the keyword itself is unsupported
   */
  constructor(
    readonly pluginName: string,
    readonly keyword: string,
    reason?: string,
  ) {
    super(
      reason === undefined
        ? `Plugin '${pluginName}' config schema uses unsupported keyword '${keyword}'; use only the supported JSON Schema subset (type, properties, required, items, enum, default, additionalProperties)`
        : `Plugin '${pluginName}' config schema has an invalid '${keyword}': ${reason}; fix it in the manifest, which accepts only the supported JSON Schema subset (type, properties, required, items, enum, default, additionalProperties)`,
    )
  }
}
