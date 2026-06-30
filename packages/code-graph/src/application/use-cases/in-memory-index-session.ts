import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type FileAnalysis } from '../../domain/value-objects/file-analysis.js'
import {
  type IndexSession,
  type RegisterFileInput,
  type RegisterAnalysisInput,
} from '../../domain/value-objects/index-session.js'

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
