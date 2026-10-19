import {
  type GraphStore,
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
} from '../../domain/ports/graph-store.js'
import {
  type IndexCoverage,
  type IndexSession,
  IndexCoverageStatus,
} from '../../domain/value-objects/index-session.js'
import {
  deriveQualifiedName,
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'

/**
 * Read-only graph-store view over an index session for coverage resolution.
 */
export class SessionReferenceStore {
  /**
   * Creates a store view.
   * @param session - Index session that already contains reference facts.
   */
  constructor(private readonly session: IndexSession) {}

  /**
   * Finds logical symbols matching structured lookups.
   * @param lookups - Structured lookups.
   * @returns Matching logical symbols.
   */
  findLogicalSymbols(lookups: readonly LogicalSymbolLookup[]): Promise<readonly LogicalSymbol[]> {
    const symbols = this.session.getLogicalSymbols()
    return Promise.resolve(
      symbols.filter((symbol) => lookups.some((lookup) => matchesLogical(symbol, lookup))),
    )
  }

  /**
   * Finds logical symbols by id.
   * @param ids - Logical ids.
   * @returns Matching logical symbols.
   */
  findLogicalSymbolsByIds(ids: readonly string[]): Promise<readonly LogicalSymbol[]> {
    const wanted = new Set(ids)
    return Promise.resolve(
      this.session.getLogicalSymbols().filter((symbol) => wanted.has(symbol.id)),
    )
  }

  /**
   * Finds logical symbols by stored or derived qualified spelling.
   * @param qualifiedNames - Generic dotted spellings.
   * @returns Every equal logical symbol.
   */
  findLogicalSymbolsByQualifiedNames(
    qualifiedNames: readonly string[],
  ): Promise<readonly LogicalSymbol[]> {
    const names = new Set(qualifiedNames)
    const symbols = this.session.getLogicalSymbols()
    const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
    return Promise.resolve(
      symbols.flatMap((symbol) => {
        const spelling = symbol.qualifiedName ?? deriveQualifiedName(symbol, byId)
        if (spelling === undefined || !names.has(spelling)) return []
        return [symbol.qualifiedName === spelling ? symbol : { ...symbol, qualifiedName: spelling }]
      }),
    )
  }

  /**
   * Finds public bindings.
   * @param lookups - Binding lookups.
   * @returns Matching bindings.
   */
  findPublicBindings(lookups: readonly PublicBindingLookup[]): Promise<readonly PublicBinding[]> {
    return Promise.resolve(
      this.session
        .getPublicBindings()
        .filter((binding) => lookups.some((lookup) => matchesPublic(binding, lookup))),
    )
  }

  /**
   * Finds local bindings.
   * @param lookups - Local lookups.
   * @returns Matching bindings.
   */
  findLocalBindings(lookups: readonly LocalBindingLookup[]): Promise<readonly LocalBinding[]> {
    return Promise.resolve(
      this.session
        .getLocalBindings()
        .filter((binding) =>
          lookups.some(
            (lookup) =>
              binding.filePath === lookup.filePath &&
              binding.localName === lookup.localName &&
              (lookup.scopeId === undefined || binding.scopeId === lookup.scopeId) &&
              (lookup.space === undefined || binding.space === lookup.space),
          ),
        ),
    )
  }

  /**
   * Finds resolution steps that start at one of the sources.
   * @param sources - Step source ids.
   * @returns Matching steps.
   */
  findResolutionSteps(sources: readonly string[]): Promise<readonly ResolutionStep[]> {
    const wanted = new Set(sources)
    return Promise.resolve(
      this.session.getResolutionSteps().filter((step) => wanted.has(step.fromId)),
    )
  }

  /**
   * Finds declarations for logical ids.
   * @param logicalIds - Logical symbol ids.
   * @returns Logical declarations.
   */
  findDeclarations(logicalIds: readonly string[]): Promise<readonly LogicalDeclaration[]> {
    const orderedIds = [...new Set(logicalIds)]
    const grouped = this.session.getDeclarationsByLogicalId()
    return Promise.resolve(
      orderedIds.flatMap((logicalSymbolId) =>
        [...(grouped.get(logicalSymbolId) ?? [])]
          .sort(compareDeclarations)
          .map((declaration) => ({ logicalSymbolId, declaration })),
      ),
    )
  }

  /**
   * Finds logical mappings for physical declaration ids.
   * @param declarationSymbolIds - Physical declaration ids.
   * @returns Mapped declarations in first-request order.
   */
  findLogicalDeclarationsByDeclarationIds(
    declarationSymbolIds: readonly string[],
  ): Promise<readonly LogicalDeclaration[]> {
    const requested = [...new Set(declarationSymbolIds)]
    const mappings = new Map<string, LogicalDeclaration>()
    for (const [logicalSymbolId, declarations] of this.session.getDeclarationsByLogicalId()) {
      for (const declaration of declarations) {
        mappings.set(declaration.symbolId, { logicalSymbolId, declaration })
      }
    }
    return Promise.resolve(
      requested.flatMap((declarationId) => {
        const mapping = mappings.get(declarationId)
        return mapping === undefined ? [] : [mapping]
      }),
    )
  }

  /**
   * Reports indexed coverage for files present in the session.
   * @param filePaths - File ids.
   * @returns Coverage rows.
   */
  findIndexCoverage(filePaths: readonly string[]): Promise<readonly IndexCoverage[]> {
    return Promise.resolve(
      filePaths
        .filter((filePath) => this.session.getFileId(filePath) !== undefined)
        .map((filePath) => ({
          filePath,
          contentHash: undefined,
          status: IndexCoverageStatus.Indexed,
          reason: undefined,
          capabilities: ['declarations', 'members', 'publicBindings'],
        })),
    )
  }
}

/**
 * Orders declarations deterministically by source position and identity.
 * @param left - First declaration to compare.
 * @param right - Second declaration to compare.
 * @returns Negative, zero, or positive ordering value.
 */
function compareDeclarations(
  left: LogicalDeclaration['declaration'],
  right: LogicalDeclaration['declaration'],
): number {
  return (
    left.location.filePath.localeCompare(right.location.filePath) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.symbolId.localeCompare(right.symbolId)
  )
}

/**
 * Tests one logical symbol against one structured lookup.
 * @param symbol - Stored logical symbol.
 * @param lookup - Requested lookup. An omitted axis does not filter.
 * @returns Whether the symbol matches the lookup.
 */
function matchesLogical(
  symbol: ReturnType<IndexSession['getLogicalSymbols']>[number],
  lookup: LogicalSymbolLookup,
): boolean {
  return (
    symbol.workspace === lookup.workspace &&
    symbol.name === lookup.name &&
    (lookup.surface === undefined || symbol.surface === lookup.surface) &&
    (lookup.space === undefined || symbol.space === lookup.space) &&
    (lookup.ownerId === undefined || symbol.ownerId === lookup.ownerId) &&
    (lookup.memberKind === undefined || symbol.memberSemantics?.kind === lookup.memberKind) &&
    (lookup.memberDispatch === undefined ||
      symbol.memberSemantics?.dispatch === lookup.memberDispatch) &&
    (lookup.memberAccessor === undefined ||
      symbol.memberSemantics?.accessor === lookup.memberAccessor) &&
    (lookup.nativeKind === undefined || symbol.memberSemantics?.nativeKind === lookup.nativeKind)
  )
}

/**
 * Tests one public binding against one surface lookup.
 * @param binding - Stored public binding.
 * @param lookup - Requested surface, name, and optional space.
 * @returns Whether the binding matches the lookup.
 */
function matchesPublic(
  binding: ReturnType<IndexSession['getPublicBindings']>[number],
  lookup: PublicBindingLookup,
): boolean {
  return (
    binding.surface === lookup.surface &&
    binding.exportedName === lookup.exportedName &&
    (lookup.space === undefined || binding.space === lookup.space)
  )
}

/**
 * Cast helper so the session view satisfies the resolver's store port.
 * @param store - Session-backed store view.
 * @returns The same object typed as a graph store.
 */
export function asGraphStore(store: SessionReferenceStore): GraphStore {
  return store as unknown as GraphStore
}
