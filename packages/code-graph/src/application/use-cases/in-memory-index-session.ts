import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type FileAnalysis } from '../../domain/value-objects/file-analysis.js'
import { type FileCategory } from '../../domain/value-objects/file-node.js'
import {
  type DeclarationOccurrence,
  DeclarationOccurrenceForm,
  type SymbolSpace,
  type HierarchyFact,
  type HierarchyImportProvenance,
  type LocalBinding,
  type LogicalDeclarationDiagnostic,
  type LogicalSymbol,
  assignQualifiedNames,
  parseLogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import {
  type IndexSession,
  type RegisterFileInput,
  type RegisterAnalysisInput,
} from '../../domain/value-objects/index-session.js'
import { type ReferenceFactsWrite } from '../../domain/ports/graph-store.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { DuplicateDeclarationMappingError } from '../../domain/errors/duplicate-declaration-mapping-error.js'
import { type ParserResourceScope } from '../../domain/value-objects/parser-resource-scope.js'
import { InMemoryParserResourceScope } from './in-memory-parser-resource-scope.js'

/**
 * Builds the lookup key of one public route.
 * @param surface - Public surface id.
 * @param exportedName - Exported spelling.
 * @param space - Symbol space of the export.
 * @returns A collision-free key.
 */
function publicRouteKey(surface: string, exportedName: string, space: SymbolSpace): string {
  return `${surface}\u0000${exportedName}\u0000${space}`
}

/**
 * Concrete in-memory implementation of the IndexSession interface.
 * Coordinates lookup structures, file-level analyses, and deduplicated relations.
 */
export class InMemoryIndexSession implements IndexSession {
  private readonly parserResourceScope: ParserResourceScope = new InMemoryParserResourceScope()

  /**
   * Scope holding the parser-owned resources of the file currently being analysed.
   * @returns The single scope of this session; it cannot be replaced.
   */
  get parserResources(): ParserResourceScope {
    return this.parserResourceScope
  }

  private nextFileId = 1
  private readonly files = new Map<
    string,
    {
      fileId: number
      projectRelativePath: string
      language: string
      contentHash: string
      workspace: string
      category: FileCategory
    }
  >()
  private readonly filePathsSet = new Set<string>()
  private readonly publicBindingsByRoute = new Map<string, Map<string, PublicBinding>>()
  private readonly analyses = new Map<string, FileAnalysis>()
  private readonly declarationsByLogicalId = new Map<string, DeclarationOccurrence[]>()
  private readonly logicalSymbolsById = new Map<string, LogicalSymbol>()
  private readonly publicBindingsById = new Map<string, PublicBinding>()
  private readonly localBindingsById = new Map<string, LocalBinding>()
  private readonly logicalDiagnosticsByKey = new Map<string, LogicalDeclarationDiagnostic>()
  private readonly resolutionStepsByKey = new Map<string, ResolutionStep>()
  private readonly hierarchyFactsByKey = new Map<string, HierarchyFact>()
  private readonly logicalIdByDeclarationSymbolId = new Map<string, string>()

  // Symbol lookups
  private readonly symbolsById = new Map<string, SymbolNode>()
  private readonly symbolsByFile = new Map<string, SymbolNode[]>()
  private readonly symbolsByName = new Map<string, SymbolNode[]>()
  private readonly qualifiedNameSymbolMap = new Map<string, string>()
  private readonly testQualifiedNameSymbolMap = new Map<string, string>()
  private mergedQualifiedNameSymbolMap: Map<string, string> | undefined = undefined

  // Spec and document lookups
  private readonly specs = new Map<string, SpecNode>()
  private readonly documents = new Map<string, DocumentNode>()
  private readonly specsBySymbolId = new Map<string, Set<string>>()
  private readonly symbolsBySpecId = new Map<string, Set<string>>()

  // Relations
  private readonly relationsList: Relation[] = []
  private readonly relationsKeys = new Set<string>()

  // Adapter run-scoped state
  private readonly adapterState = new Map<string, unknown>()

  /**
   * Registers a file and returns its numeric ID.
   * @param input - The file details to register.
   * @returns The registered file ID.
   */
  registerFile(input: RegisterFileInput): number {
    const existing = this.files.get(input.filePath)
    if (existing) {
      return existing.fileId
    }
    const fileId = this.nextFileId++
    this.files.set(input.filePath, {
      fileId,
      projectRelativePath: input.projectRelativePath,
      language: input.language,
      contentHash: input.contentHash,
      workspace: input.workspace,
      category: input.category ?? 'source',
    })
    this.filePathsSet.add(input.filePath)
    return fileId
  }

  /**
   * Finds one registered symbol by its exact id, in any workspace.
   * @param symbolId - Symbol id.
   * @returns The symbol, or `undefined` when it is not registered.
   */
  findSymbolById(symbolId: string): SymbolNode | undefined {
    return this.symbolsById.get(symbolId)
  }

  /**
   * Stores a public binding and keeps the per-route lookup in step with it.
   * @param binding - Binding to store; a binding with the same id replaces the previous one.
   */
  private putPublicBinding(binding: PublicBinding): void {
    const previous = this.publicBindingsById.get(binding.id)
    if (previous !== undefined) {
      this.publicBindingsByRoute
        .get(publicRouteKey(previous.surface, previous.exportedName, previous.space))
        ?.delete(binding.id)
    }
    this.publicBindingsById.set(binding.id, binding)
    const key = publicRouteKey(binding.surface, binding.exportedName, binding.space)
    const routes = this.publicBindingsByRoute.get(key) ?? new Map<string, PublicBinding>()
    routes.set(binding.id, binding)
    this.publicBindingsByRoute.set(key, routes)
  }

  /**
   * Returns the public bindings stored under one surface for an exported name and symbol space.
   * @param surface - Public surface id.
   * @param exportedName - Exported spelling.
   * @param space - Symbol space of the export.
   * @returns Matching bindings in deterministic identity order.
   */
  findPublicBindings(
    surface: string,
    exportedName: string,
    space: SymbolSpace,
  ): readonly PublicBinding[] {
    const routes = this.publicBindingsByRoute.get(publicRouteKey(surface, exportedName, space))
    if (routes === undefined) return []
    return [...routes.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  /**
   * Returns the category of a registered file.
   * @param filePath - Workspace-prefixed file path.
   * @returns The file category, or `undefined` when the file is not registered.
   */
  getFileCategory(filePath: string): FileCategory | undefined {
    return this.files.get(filePath)?.category
  }

  /**
   * Returns the primary declaration symbol id of a logical symbol.
   * @param logicalId - Logical symbol id.
   * @returns The lowest definition symbol id, else the lowest symbol id, else `undefined`.
   */
  getPrimaryDeclarationSymbolId(logicalId: string): string | undefined {
    const declarations = this.declarationsByLogicalId.get(logicalId)
    if (declarations === undefined || declarations.length === 0) return undefined
    const lowest = (items: readonly DeclarationOccurrence[]): string | undefined =>
      items.map((item) => item.symbolId).sort()[0]
    const definitions = declarations.filter(
      (declaration) => declaration.occurrenceForm === DeclarationOccurrenceForm.Definition,
    )
    return lowest(definitions) ?? lowest(declarations)
  }

  /**
   * Hydrates an unchanged persisted file and its symbols without parser analysis.
   * @param file - Persisted file node.
   * @param file.path - Canonical file path.
   * @param file.projectRelativePath - Project-relative selector path.
   * @param file.language - Persisted language id.
   * @param file.contentHash - Indexed content hash.
   * @param file.workspace - Owning workspace.
   * @param file.category - Persisted file category; defaults to `'source'`.
   * @param file.namespace - Optional enclosing namespace.
   * @param file.namespaceSeparator - Optional namespace separator.
   * @param symbols - Persisted symbols owned by the file.
   */
  hydratePersistedFile(
    file: {
      readonly path: string
      readonly projectRelativePath: string
      readonly language: string
      readonly contentHash: string
      readonly workspace: string
      readonly category?: FileCategory | undefined
      readonly namespace?: string | undefined
      readonly namespaceSeparator?: string | undefined
    },
    symbols: readonly SymbolNode[],
  ): void {
    this.registerFile({
      filePath: file.path,
      projectRelativePath: file.projectRelativePath,
      language: file.language,
      contentHash: file.contentHash,
      workspace: file.workspace,
      ...(file.category !== undefined ? { category: file.category } : {}),
    })
    this.symbolsByFile.set(file.path, [...symbols])
    for (const symbol of symbols) {
      this.symbolsById.set(symbol.id, symbol)
      const named = this.symbolsByName.get(symbol.name) ?? []
      named.push(symbol)
      this.symbolsByName.set(symbol.name, named)
    }

    if (file.namespace) {
      const targetMap =
        file.category === 'test' ? this.testQualifiedNameSymbolMap : this.qualifiedNameSymbolMap
      const separator = file.namespaceSeparator ?? '.'
      for (const symbol of symbols) {
        const qualifiedName = `${file.namespace}${separator}${symbol.name}`
        targetMap.set(qualifiedName, symbol.id)
      }
      this.mergedQualifiedNameSymbolMap = undefined
    }
  }

  /**
   * Hydrates unchanged logical, binding, and provenance facts into the run session.
   * @param facts - Persisted facts filtered to unaffected owners.
   */
  hydrateReferenceFacts(facts: ReferenceFactsWrite): void {
    for (const logical of facts.logicalSymbols) this.logicalSymbolsById.set(logical.id, logical)
    for (const item of facts.declarations) {
      this.registerDeclarationMapping(item.declaration, item.logicalSymbolId)
      const declarations = this.declarationsByLogicalId.get(item.logicalSymbolId) ?? []
      if (!declarations.some((existing) => existing.symbolId === item.declaration.symbolId)) {
        declarations.push(item.declaration)
      }
      this.declarationsByLogicalId.set(item.logicalSymbolId, declarations)
    }
    for (const binding of facts.publicBindings) this.putPublicBinding(binding)
    for (const binding of facts.localBindings) this.localBindingsById.set(binding.id, binding)
    for (const step of facts.steps) {
      this.resolutionStepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
    }
  }

  /**
   * Registers a file analysis draft and returns the complete FileAnalysis object.
   * @param input - The file analysis details to register.
   * @returns The registered file analysis.
   * @throws Error if the file has not been registered first.
   */
  registerAnalysis(input: RegisterAnalysisInput): FileAnalysis {
    const fileInfo = this.files.get(input.filePath)
    if (!fileInfo) {
      throw new Error(
        `File ${input.filePath} must be registered using registerFile before registering analysis.`,
      )
    }

    const fileAnalysis: FileAnalysis = {
      ...input.analysis,
      fileId: fileInfo.fileId,
      filePath: input.filePath,
      contentHash: fileInfo.contentHash,
      workspace: fileInfo.workspace,
      projectRelativePath: fileInfo.projectRelativePath,
    }

    this.analyses.set(input.filePath, fileAnalysis)
    for (const declaration of input.analysis.referenceFacts?.declarations ?? []) {
      if (declaration.logicalId === undefined) continue
      this.registerDeclarationMapping(declaration, declaration.logicalId)
      const declarations = this.declarationsByLogicalId.get(declaration.logicalId) ?? []
      if (!declarations.some((existing) => existing.symbolId === declaration.symbolId)) {
        declarations.push(declaration)
      }
      this.declarationsByLogicalId.set(declaration.logicalId, declarations)
      const logicalSymbol = parseLogicalSymbol(declaration.logicalId)
      if (logicalSymbol) this.logicalSymbolsById.set(logicalSymbol.id, logicalSymbol)
    }
    for (const logical of input.analysis.referenceFacts?.logicalSymbols ?? []) {
      this.logicalSymbolsById.set(logical.id, logical)
    }
    for (const diagnostic of input.analysis.referenceFacts?.diagnostics ?? []) {
      this.logicalDiagnosticsByKey.set(
        JSON.stringify([diagnostic.code, diagnostic.logicalId]),
        diagnostic,
      )
    }
    for (const binding of input.analysis.referenceFacts?.publicBindings ?? []) {
      this.putPublicBinding(binding)
    }
    for (const binding of input.analysis.referenceFacts?.localBindings ?? []) {
      this.localBindingsById.set(binding.id, binding)
    }
    for (const step of input.analysis.referenceFacts?.steps ?? []) {
      this.resolutionStepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
    }
    for (const fact of input.analysis.referenceFacts?.hierarchy ?? []) {
      const key = JSON.stringify([fact.childId, fact.parentId, fact.kind, fact.precedence])
      this.hierarchyFactsByKey.set(key, fact)
      const step: ResolutionStep = {
        fromId: fact.childId,
        toId: fact.parentId,
        kind: `${fact.kind}:${String(fact.precedence)}`,
      }
      this.resolutionStepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
    }

    // Index symbols
    this.symbolsByFile.set(input.filePath, [...input.analysis.symbols])
    for (const symbol of input.analysis.symbols) {
      this.symbolsById.set(symbol.id, symbol)

      let nameList = this.symbolsByName.get(symbol.name)
      if (!nameList) {
        nameList = []
        this.symbolsByName.set(symbol.name, nameList)
      }
      nameList.push(symbol)
    }

    // Populate qualified name mappings if a namespace exists
    if (input.analysis.namespace) {
      const targetMap =
        fileInfo.category === 'test' ? this.testQualifiedNameSymbolMap : this.qualifiedNameSymbolMap
      const separator = input.analysis.namespaceSeparator ?? '.'
      for (const symbol of input.analysis.symbols) {
        const qualifiedName = `${input.analysis.namespace}${separator}${symbol.name}`
        targetMap.set(qualifiedName, symbol.id)
      }
      this.mergedQualifiedNameSymbolMap = undefined
    }

    return fileAnalysis
  }

  /**
   * Registers one physical-to-logical declaration mapping without allowing remapping.
   * @param declaration - Physical declaration occurrence.
   * @param logicalId - Canonical logical target id.
   * @throws {DuplicateDeclarationMappingError} When the declaration already maps elsewhere.
   */
  private registerDeclarationMapping(declaration: DeclarationOccurrence, logicalId: string): void {
    const existing = this.logicalIdByDeclarationSymbolId.get(declaration.symbolId)
    if (existing !== undefined && existing !== logicalId) {
      throw new DuplicateDeclarationMappingError(declaration.symbolId, existing, logicalId)
    }
    this.logicalIdByDeclarationSymbolId.set(declaration.symbolId, logicalId)
  }

  /**
   * Retrieves the numeric ID of a registered file path.
   * @param filePath - The path of the file.
   * @returns The file ID, or undefined if not registered.
   */
  getFileId(filePath: string): number | undefined {
    return this.files.get(filePath)?.fileId
  }

  /**
   * Retrieves the analysis of a registered file path.
   * @param filePath - The path of the file.
   * @returns The file analysis, or undefined if not registered or analyzed.
   */
  getAnalysis(filePath: string): FileAnalysis | undefined {
    return this.analyses.get(filePath)
  }

  /**
   * Returns a set of all registered file paths.
   * @returns Readonly set of file paths.
   */
  getAllFilePaths(): ReadonlySet<string> {
    return this.filePathsSet
  }

  /**
   * Returns declaration occurrences grouped by logical identity.
   * @returns Grouped declaration occurrences.
   */
  getDeclarationsByLogicalId(): ReadonlyMap<string, readonly DeclarationOccurrence[]> {
    return this.declarationsByLogicalId
  }

  /**
   * Returns collision diagnostics gathered from every analyzed file.
   * @returns Diagnostics in deterministic order.
   */
  getLogicalDiagnostics(): readonly LogicalDeclarationDiagnostic[] {
    return [...this.logicalDiagnosticsByKey.values()].sort(
      (left, right) =>
        left.logicalId.localeCompare(right.logicalId) || left.code.localeCompare(right.code),
    )
  }

  /**
   * Returns logical targets reconstructed from adapter-provided grouping identities.
   * @returns Logical symbols in deterministic order.
   */
  getLogicalSymbols(): readonly LogicalSymbol[] {
    const symbols = [...this.logicalSymbolsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
    return assignQualifiedNames(symbols)
  }

  /**
   * Returns unique public bindings in deterministic identity order.
   * @returns Public bindings.
   */
  getPublicBindings(): readonly PublicBinding[] {
    return [...this.publicBindingsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
  }

  /**
   * Returns unique lexical bindings in deterministic identity order.
   * @returns Local bindings.
   */
  getLocalBindings(): readonly LocalBinding[] {
    return [...this.localBindingsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
  }

  /**
   * Merges re-export bindings and steps into the session.
   * @param facts - Bindings and steps to add.
   * @param facts.publicBindings - Public bindings emitted by an adapter.
   * @param facts.steps - Resolution steps emitted by an adapter.
   */
  addReferenceFacts(facts: {
    readonly publicBindings: readonly PublicBinding[]
    readonly steps: readonly ResolutionStep[]
  }): void {
    for (const binding of facts.publicBindings) this.putPublicBinding(binding)
    for (const step of facts.steps) {
      this.resolutionStepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
    }
  }

  /**
   * Returns resolution steps in deterministic key order.
   * @returns Resolution steps recorded for this session.
   */
  getResolutionSteps(): readonly ResolutionStep[] {
    return [...this.resolutionStepsByKey.values()].sort((left, right) =>
      JSON.stringify([left.fromId, left.toId, left.kind]).localeCompare(
        JSON.stringify([right.fromId, right.toId, right.kind]),
      ),
    )
  }

  /**
   * Returns deduplicated hierarchy facts for conservative Pass 2 resolution.
   * @returns Hierarchy facts.
   */
  getHierarchyFacts(): readonly HierarchyFact[] {
    return [...this.hierarchyFactsByKey.values()].sort(
      (left, right) =>
        left.precedence - right.precedence ||
        left.childId.localeCompare(right.childId) ||
        left.parentId.localeCompare(right.parentId) ||
        left.kind.localeCompare(right.kind),
    )
  }

  /**
   * Finds all symbols registered for a specific file path.
   * @param filePath - The path of the file.
   * @returns Array of symbol nodes.
   */
  findSymbolsByFile(filePath: string): readonly SymbolNode[] {
    return this.symbolsByFile.get(filePath) ?? []
  }

  /**
   * Finds all symbols matching a simple name, optionally filtered by file path prefix.
   * @param name - The name of the symbol.
   * @param filePrefix - Optional prefix of file path.
   * @returns Array of symbol nodes.
   */
  findSymbolsByName(name: string, filePrefix?: string): readonly SymbolNode[] {
    const list = this.symbolsByName.get(name) ?? []
    if (filePrefix === undefined) {
      return list
    }
    return list.filter((symbol) => symbol.filePath.startsWith(filePrefix))
  }

  /**
   * Finds a symbol's ID by its qualified name.
   * @param qualifiedName - The qualified name of the symbol.
   * @param options - Options; when `includeTests` is true, test symbols are also searched.
   * @param options.includeTests - When true, test symbols are also searched.
   * @returns The symbol ID, or undefined if not found.
   */
  findSymbolByQualifiedName(
    qualifiedName: string,
    options?: { readonly includeTests?: boolean },
  ): string | undefined {
    if (options?.includeTests) {
      return (
        this.qualifiedNameSymbolMap.get(qualifiedName) ??
        this.testQualifiedNameSymbolMap.get(qualifiedName)
      )
    }
    return this.qualifiedNameSymbolMap.get(qualifiedName)
  }

  /**
   * Finds all specifications linked to a symbol.
   * @param symbolId - The ID of the symbol.
   * @returns Array of spec nodes.
   */
  findSpecsBySymbol(symbolId: string): readonly SpecNode[] {
    const specIds = this.specsBySymbolId.get(symbolId)
    if (!specIds) return []
    const result: SpecNode[] = []
    for (const specId of specIds) {
      const spec = this.specs.get(specId)
      if (spec) {
        result.push(spec)
      }
    }
    return result
  }

  /**
   * Finds all symbols covered by a specification.
   * @param specId - The ID of the specification.
   * @returns Array of symbol nodes.
   */
  findSymbolsBySpec(specId: string): readonly SymbolNode[] {
    const symbolIds = this.symbolsBySpecId.get(specId)
    if (!symbolIds) return []
    const result: SymbolNode[] = []
    for (const symbolId of symbolIds) {
      const symbol = this.symbolsById.get(symbolId)
      if (symbol) {
        result.push(symbol)
      }
    }
    return result
  }

  /**
   * Registers a document node in the session.
   * @param document - The document node to register.
   */
  registerDocument(document: DocumentNode): void {
    this.documents.set(document.path, document)
  }

  /**
   * Registers a specification node in the session.
   * @param spec - The specification node to register.
   */
  registerSpec(spec: SpecNode): void {
    this.specs.set(spec.specId, spec)
  }

  /**
   * Adds resolved relations to the session, deduplicating them.
   * @param relations - The array of relations to add.
   */
  addRelations(relations: readonly Relation[]): void {
    for (const rel of relations) {
      const key = `${rel.source}:${rel.type}:${rel.target}`
      if (this.relationsKeys.has(key)) continue
      this.relationsKeys.add(key)
      this.relationsList.push(rel)

      const hierarchyKind =
        rel.type === RelationType.Extends
          ? 'extends'
          : rel.type === RelationType.Implements
            ? 'implements'
            : rel.type === RelationType.UsesType && rel.metadata?.['hierarchyKind'] === 'trait'
              ? 'trait'
              : undefined
      if (hierarchyKind !== undefined) {
        const childId = this.logicalIdByDeclarationSymbolId.get(rel.source)
        const parentId = this.logicalIdByDeclarationSymbolId.get(rel.target)
        if (childId && parentId) {
          const rawPrecedence = rel.metadata?.['precedence']
          const precedence = typeof rawPrecedence === 'number' ? rawPrecedence : 0
          const sourceRange = parseHierarchySourceRange(rel.metadata?.['sourceRange'])
          const importProvenance = parseHierarchyImportProvenance(
            rel.metadata?.['importProvenance'],
          )
          const fact: HierarchyFact = {
            childId,
            parentId,
            kind: hierarchyKind,
            precedence,
            ...(sourceRange === undefined ? {} : { sourceRange }),
            ...(importProvenance === undefined ? {} : { importProvenance }),
          }
          this.hierarchyFactsByKey.set(
            JSON.stringify([fact.childId, fact.parentId, fact.kind, fact.precedence]),
            fact,
          )
          const step: ResolutionStep = {
            fromId: fact.childId,
            toId: fact.parentId,
            kind: `${fact.kind}:${String(fact.precedence)}`,
          }
          this.resolutionStepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
        }
      }

      // Maintain cross-lookups for spec coverage
      if (rel.type === 'COVERS_SYMBOL') {
        const specId = rel.source
        const symbolId = rel.target

        let specIds = this.specsBySymbolId.get(symbolId)
        if (!specIds) {
          specIds = new Set<string>()
          this.specsBySymbolId.set(symbolId, specIds)
        }
        specIds.add(specId)

        let symbolIds = this.symbolsBySpecId.get(specId)
        if (!symbolIds) {
          symbolIds = new Set<string>()
          this.symbolsBySpecId.set(specId, symbolIds)
        }
        symbolIds.add(symbolId)
      }
    }
  }

  /**
   * Retrieves all unique relations registered in the session.
   * @returns Readonly array of relations.
   */
  getRelations(): readonly Relation[] {
    return this.relationsList
  }

  /**
   * Retrieves adapter-specific run-scoped cache state.
   * @param adapterKey - The key identifying the adapter.
   * @returns The adapter state, or undefined if not set.
   */
  getAdapterState<T>(adapterKey: string): T | undefined {
    return this.adapterState.get(adapterKey) as T | undefined
  }

  /**
   * Sets adapter-specific run-scoped cache state.
   * @param adapterKey - The key identifying the adapter.
   * @param state - The state to set.
   */
  setAdapterState<T>(adapterKey: string, state: T): void {
    this.adapterState.set(adapterKey, state)
  }

  /**
   * Retrieves the qualified name mapping.
   * @param options - Options; when `includeTests` is true, returns production and test symbols.
   * @param options.includeTests - When true, returns production and test symbols.
   * @returns Readonly map of qualified name to symbol ID.
   */
  getQualifiedNames(options?: { readonly includeTests?: boolean }): ReadonlyMap<string, string> {
    if (options?.includeTests) {
      if (this.mergedQualifiedNameSymbolMap === undefined) {
        const merged = new Map<string, string>()
        for (const [name, id] of this.testQualifiedNameSymbolMap) {
          merged.set(name, id)
        }
        for (const [name, id] of this.qualifiedNameSymbolMap) {
          merged.set(name, id)
        }
        this.mergedQualifiedNameSymbolMap = merged
      }
      return this.mergedQualifiedNameSymbolMap
    }
    return this.qualifiedNameSymbolMap
  }
}

/**
 * Parses optional hierarchy range metadata without trusting adapter-specific values.
 * @param value - Untrusted relation metadata value.
 * @returns A complete source range, or undefined.
 */
function parseHierarchySourceRange(value: unknown): HierarchyFact['sourceRange'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  const fields = ['startLine', 'startColumn', 'endLine', 'endColumn'] as const
  if (fields.some((field) => typeof candidate[field] !== 'number')) return undefined
  return {
    startLine: candidate['startLine'] as number,
    startColumn: candidate['startColumn'] as number,
    endLine: candidate['endLine'] as number,
    endColumn: candidate['endColumn'] as number,
  }
}

/**
 * Parses optional imported-hierarchy provenance without accepting partial evidence.
 * @param value - Untrusted relation metadata value.
 * @returns Complete import provenance, or undefined.
 */
function parseHierarchyImportProvenance(value: unknown): HierarchyImportProvenance | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (
    candidate['kind'] !== 'import' ||
    typeof candidate['requestedName'] !== 'string' ||
    typeof candidate['resolvedTargetSymbolId'] !== 'string'
  ) {
    return undefined
  }
  return {
    kind: 'import',
    requestedName: candidate['requestedName'],
    resolvedTargetSymbolId: candidate['resolvedTargetSymbolId'],
  }
}
