import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type FileAnalysis } from '../../domain/value-objects/file-analysis.js'
import {
  type DeclarationOccurrence,
  type HierarchyFact,
  type LocalBinding,
  type LogicalSymbol,
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

/**
 * Concrete in-memory implementation of the IndexSession interface.
 * Coordinates lookup structures, file-level analyses, and deduplicated relations.
 */
export class InMemoryIndexSession implements IndexSession {
  private nextFileId = 1
  private readonly files = new Map<
    string,
    {
      fileId: number
      configRelativePath: string
      language: string
      contentHash: string
      workspace: string
    }
  >()
  private readonly filePathsSet = new Set<string>()
  private readonly analyses = new Map<string, FileAnalysis>()
  private readonly declarationsByLogicalId = new Map<string, DeclarationOccurrence[]>()
  private readonly logicalSymbolsById = new Map<string, LogicalSymbol>()
  private readonly publicBindingsById = new Map<string, PublicBinding>()
  private readonly localBindingsById = new Map<string, LocalBinding>()
  private readonly resolutionStepsByKey = new Map<string, ResolutionStep>()
  private readonly hierarchyFactsByKey = new Map<string, HierarchyFact>()
  private readonly logicalIdByDeclarationSymbolId = new Map<string, string>()

  // Symbol lookups
  private readonly symbolsById = new Map<string, SymbolNode>()
  private readonly symbolsByFile = new Map<string, SymbolNode[]>()
  private readonly symbolsByName = new Map<string, SymbolNode[]>()
  private readonly qualifiedNameSymbolMap = new Map<string, string>()

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
      configRelativePath: input.configRelativePath,
      language: input.language,
      contentHash: input.contentHash,
      workspace: input.workspace,
    })
    this.filePathsSet.add(input.filePath)
    return fileId
  }

  /**
   * Hydrates an unchanged persisted file and its symbols without parser analysis.
   * @param file - Persisted file node.
   * @param file.path - Canonical file path.
   * @param file.configRelativePath - Config-relative selector path.
   * @param file.language - Persisted language id.
   * @param file.contentHash - Indexed content hash.
   * @param file.workspace - Owning workspace.
   * @param symbols - Persisted symbols owned by the file.
   */
  hydratePersistedFile(
    file: {
      readonly path: string
      readonly configRelativePath: string
      readonly language: string
      readonly contentHash: string
      readonly workspace: string
    },
    symbols: readonly SymbolNode[],
  ): void {
    this.registerFile({
      filePath: file.path,
      configRelativePath: file.configRelativePath,
      language: file.language,
      contentHash: file.contentHash,
      workspace: file.workspace,
    })
    this.symbolsByFile.set(file.path, [...symbols])
    for (const symbol of symbols) {
      this.symbolsById.set(symbol.id, symbol)
      const named = this.symbolsByName.get(symbol.name) ?? []
      named.push(symbol)
      this.symbolsByName.set(symbol.name, named)
    }
  }

  /**
   * Hydrates unchanged logical, binding, and provenance facts into the run session.
   * @param facts - Persisted facts filtered to unaffected owners.
   */
  hydrateReferenceFacts(facts: ReferenceFactsWrite): void {
    for (const logical of facts.logicalSymbols) this.logicalSymbolsById.set(logical.id, logical)
    for (const item of facts.declarations) {
      this.logicalIdByDeclarationSymbolId.set(item.declaration.symbolId, item.logicalSymbolId)
      const declarations = this.declarationsByLogicalId.get(item.logicalSymbolId) ?? []
      declarations.push(item.declaration)
      this.declarationsByLogicalId.set(item.logicalSymbolId, declarations)
    }
    for (const binding of facts.publicBindings) this.publicBindingsById.set(binding.id, binding)
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
      configRelativePath: fileInfo.configRelativePath,
    }

    this.analyses.set(input.filePath, fileAnalysis)
    for (const declaration of input.analysis.referenceFacts?.declarations ?? []) {
      this.logicalIdByDeclarationSymbolId.set(declaration.symbolId, declaration.logicalId)
      const declarations = this.declarationsByLogicalId.get(declaration.logicalId) ?? []
      if (!declarations.some((existing) => existing.symbolId === declaration.symbolId)) {
        declarations.push(declaration)
      }
      this.declarationsByLogicalId.set(declaration.logicalId, declarations)
      const logicalSymbol = parseLogicalSymbol(declaration.logicalId)
      if (logicalSymbol) this.logicalSymbolsById.set(logicalSymbol.id, logicalSymbol)
    }
    for (const binding of input.analysis.referenceFacts?.publicBindings ?? []) {
      this.publicBindingsById.set(binding.id, binding)
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
      for (const symbol of input.analysis.symbols) {
        const separator = input.analysis.language === 'php' ? '\\' : '.'
        const qualifiedName = `${input.analysis.namespace}${separator}${symbol.name}`
        this.qualifiedNameSymbolMap.set(qualifiedName, symbol.id)
      }
    }

    return fileAnalysis
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
   * Returns logical targets reconstructed from adapter-provided grouping identities.
   * @returns Logical symbols in deterministic order.
   */
  getLogicalSymbols(): readonly LogicalSymbol[] {
    return [...this.logicalSymbolsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
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
   * Returns ordered, deduplicated alias/export/hierarchy provenance.
   * @returns Resolution steps.
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
   * @returns The symbol ID, or undefined if not found.
   */
  findSymbolByQualifiedName(qualifiedName: string): string | undefined {
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

      if (rel.type === RelationType.Extends || rel.type === RelationType.Implements) {
        const childId = this.logicalIdByDeclarationSymbolId.get(rel.source)
        const parentId = this.logicalIdByDeclarationSymbolId.get(rel.target)
        if (childId && parentId) {
          const rawPrecedence = rel.metadata?.['precedence']
          const precedence = typeof rawPrecedence === 'number' ? rawPrecedence : 0
          const kind = rel.type === RelationType.Extends ? 'extends' : 'implements'
          const fact: HierarchyFact = { childId, parentId, kind, precedence }
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
   * @returns Readonly map of qualified name to symbol ID.
   */
  getQualifiedNames(): ReadonlyMap<string, string> {
    return this.qualifiedNameSymbolMap
  }
}
