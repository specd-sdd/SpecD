import { SpecdCodeGraphError } from './specd-code-graph-error.js'

/** Raised when one physical declaration is assigned to competing logical targets. */
export class DuplicateDeclarationMappingError extends SpecdCodeGraphError {
  /** Machine-readable invariant failure code. */
  override get code(): string {
    return 'DUPLICATE_DECLARATION_MAPPING'
  }

  /**
   * Creates the mapping invariant error.
   * @param declarationSymbolId - Conflicting physical declaration id.
   * @param existingLogicalId - Logical id already registered.
   * @param requestedLogicalId - Competing logical id being registered.
   */
  constructor(declarationSymbolId: string, existingLogicalId: string, requestedLogicalId: string) {
    super(
      `Declaration "${declarationSymbolId}" is already mapped to "${existingLogicalId}" and cannot also map to "${requestedLogicalId}".`,
    )
  }
}
