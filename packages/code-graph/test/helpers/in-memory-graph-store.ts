import { GraphStore } from '../../src/domain/ports/graph-store.js'
import { type DocumentNode } from '../../src/domain/value-objects/document-node.js'
import { type FileNode } from '../../src/domain/value-objects/file-node.js'
import { type SymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../src/domain/value-objects/spec-node.js'
import { type Relation } from '../../src/domain/value-objects/relation.js'
import { type SymbolQuery } from '../../src/domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../src/domain/value-objects/graph-statistics.js'
import { RelationType } from '../../src/domain/value-objects/relation-type.js'
import { type SearchOptions } from '../../src/domain/value-objects/search-options.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'
import { expandSymbolName } from '../../src/domain/services/expand-symbol-name.js'
import { matchesExclude } from '../../src/domain/services/matches-exclude.js'

const SYMBOL_DEPENDENCY_RELATION_TYPES = [
  RelationType.Calls,
  RelationType.Constructs,
  RelationType.UsesType,
] as const

/**
 * Returns whether a relation type is a symbol-level dependency edge.
 * @param relationType - Relation type to inspect.
 * @returns True for CALLS, CONSTRUCTS, and USES_TYPE.
 */
function isSymbolDependencyRelationType(relationType: RelationType): boolean {
  return SYMBOL_DEPENDENCY_RELATION_TYPES.some((type) => type === relationType)
}

export class InMemoryGraphStore extends GraphStore {
  private _isOpen = false
  private files = new Map<string, FileNode>()
  private documents = new Map<string, DocumentNode>()
  private symbols = new Map<string, SymbolNode>()
  private specs = new Map<string, SpecNode>()
  private relations: Relation[] = []
  private _lastIndexedAt: string | undefined
  private _lastIndexedRef: string | null = null
  private _graphFingerprint: string | null = null

  constructor() {
    super(':memory:')
  }

  /**
   * Returns all relations of a specific type where the source matches the provided id.
   * @param relationType - The relation type to filter by.
   * @param source - The source identifier to match.
   * @returns Matching relations originating from the source.
   */
  private getRelationsBySource(relationType: RelationType, source: string): Relation[] {
    return this.relations.filter((r) => r.type === relationType && r.source === source)
  }

  /**
   * Returns all relations of a specific type where the target matches the provided id.
   * @param relationType - The relation type to filter by.
   * @param target - The target identifier to match.
   * @returns Matching relations targeting the symbol.
   */
  private getRelationsByTarget(relationType: RelationType, target: string): Relation[] {
    return this.relations.filter((r) => r.type === relationType && r.target === target)
  }

  /**
   * Returns all symbol dependency relations where the target matches the provided id.
   * @param target - The target symbol identifier to match.
   * @returns Matching dependency relations targeting the symbol.
   */
  private getSymbolDependencyRelationsByTarget(target: string): Relation[] {
    return this.relations.filter(
      (r) => isSymbolDependencyRelationType(r.type) && r.target === target,
    )
  }

  /**
   * Returns all symbol dependency relations where the source matches the provided id.
   * @param source - The source symbol identifier to match.
   * @returns Matching dependency relations originating from the source.
   */
  private getSymbolDependencyRelationsBySource(source: string): Relation[] {
    return this.relations.filter(
      (r) => isSymbolDependencyRelationType(r.type) && r.source === source,
    )
  }

  private ensureOpen(): void {
    if (!this._isOpen) {
      throw new StoreNotOpenError()
    }
  }

  async open(): Promise<void> {
    this._isOpen = true
  }

  async close(): Promise<void> {
    this._isOpen = false
  }

  async upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void> {
    this.ensureOpen()
    await this.removeFile(file.path)
    this.files.set(file.path, file)
    for (const symbol of symbols) {
      this.symbols.set(symbol.id, symbol)
    }
    this.relations.push(...relations)
    this._lastIndexedAt = new Date().toISOString()
  }

  async removeFile(filePath: string): Promise<void> {
    this.ensureOpen()
    this.files.delete(filePath)

    const symbolIds = new Set<string>()
    for (const [id, symbol] of this.symbols) {
      if (symbol.filePath === filePath) {
        symbolIds.add(id)
        this.symbols.delete(id)
      }
    }

    this.relations = this.relations.filter(
      (r) =>
        r.source !== filePath &&
        r.target !== filePath &&
        !symbolIds.has(r.source) &&
        !symbolIds.has(r.target),
    )
  }

  async upsertDocument(document: DocumentNode): Promise<void> {
    this.ensureOpen()
    this.documents.set(document.path, document)
    this._lastIndexedAt = new Date().toISOString()
  }

  async removeDocument(documentPath: string): Promise<void> {
    this.ensureOpen()
    this.documents.delete(documentPath)
  }

  async addRelations(relations: Relation[]): Promise<void> {
    this.ensureOpen()
    this.relations.push(...relations)
  }

  async bulkLoad(data: {
    files: FileNode[]
    documents?: DocumentNode[]
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
    graphFingerprint?: string
  }): Promise<void> {
    this.ensureOpen()
    for (const f of data.files) this.files.set(f.path, f)
    for (const d of data.documents ?? []) this.documents.set(d.path, d)
    for (const s of data.symbols) this.symbols.set(s.id, s)
    for (const sp of data.specs) this.specs.set(sp.specId, sp)
    this.relations.push(...data.relations)
    this._lastIndexedAt = new Date().toISOString()
    if (data.vcsRef !== undefined) {
      this._lastIndexedRef = data.vcsRef
    }
    if (data.graphFingerprint !== undefined) {
      this._graphFingerprint = data.graphFingerprint
    }
  }

  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    this.ensureOpen()
    await this.removeSpec(spec.specId)
    this.specs.set(spec.specId, spec)
    this.relations.push(...relations)
  }

  async removeSpec(specId: string): Promise<void> {
    this.ensureOpen()
    this.specs.delete(specId)
    this.relations = this.relations.filter(
      (r) =>
        !(
          (r.type === RelationType.DependsOn && (r.source === specId || r.target === specId)) ||
          ((r.type === RelationType.CoversFile || r.type === RelationType.CoversSymbol) &&
            r.source === specId)
        ),
    )
  }

  async removeSpecs(specIds: readonly string[]): Promise<void> {
    this.ensureOpen()
    const ids = new Set(specIds)
    for (const specId of ids) {
      this.specs.delete(specId)
    }
    this.relations = this.relations.filter(
      (r) =>
        !(
          (r.type === RelationType.DependsOn && (ids.has(r.source) || ids.has(r.target))) ||
          ((r.type === RelationType.CoversFile || r.type === RelationType.CoversSymbol) &&
            ids.has(r.source))
        ),
    )
  }

  async getFile(path: string): Promise<FileNode | undefined> {
    this.ensureOpen()
    return this.files.get(path)
  }

  async getDocument(path: string): Promise<DocumentNode | undefined> {
    this.ensureOpen()
    return this.documents.get(path)
  }

  async findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]> {
    this.ensureOpen()
    const results: FileNode[] = []
    for (const file of this.files.values()) {
      if (file.configRelativePath === configRelativePath) {
        results.push(file)
      }
    }
    return results
  }

  async findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]> {
    this.ensureOpen()
    const results: DocumentNode[] = []
    for (const document of this.documents.values()) {
      if (document.configRelativePath === configRelativePath) {
        results.push(document)
      }
    }
    return results
  }

  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    this.ensureOpen()
    return this.symbols.get(id)
  }

  async getSpec(specId: string): Promise<SpecNode | undefined> {
    this.ensureOpen()
    return this.specs.get(specId)
  }

  async getCallers(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getSymbolDependencyRelationsByTarget(symbolId)
  }

  async getCallees(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getSymbolDependencyRelationsBySource(symbolId)
  }

  async getImporters(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.Imports, filePath)
  }

  async getImportees(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.Imports, filePath)
  }

  async getExtenders(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.Extends, symbolId)
  }

  async getExtendedTargets(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.Extends, symbolId)
  }

  async getImplementors(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.Implements, symbolId)
  }

  async getImplementedTargets(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.Implements, symbolId)
  }

  async getOverriders(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.Overrides, symbolId)
  }

  async getOverriddenTargets(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.Overrides, symbolId)
  }

  async getExportedSymbols(filePath: string): Promise<SymbolNode[]> {
    this.ensureOpen()
    const exportRels = this.relations.filter(
      (r) => r.type === RelationType.Exports && r.source === filePath,
    )
    const exportedIds = new Set(exportRels.map((r) => r.target))
    return [...this.symbols.values()].filter((s) => exportedIds.has(s.id))
  }

  async getSpecDependencies(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.DependsOn, specId)
  }

  async getSpecDependents(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.DependsOn, specId)
  }

  async getCoveredFiles(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.CoversFile, specId)
  }

  async getCoveringSpecs(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.CoversFile, filePath)
  }

  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.CoversSymbol, specId)
  }

  async getSymbolCoveringSpecs(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.CoversSymbol, symbolId)
  }

  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    this.ensureOpen()
    let results = [...this.symbols.values()]
    const ci = query.caseSensitive !== true

    if (query.kind !== undefined) {
      results = results.filter((s) => s.kind === query.kind)
    }

    if (query.filePath !== undefined) {
      if (query.filePath.includes('*')) {
        const pattern = new RegExp(
          '^' + query.filePath.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
        )
        results = results.filter((s) => pattern.test(s.filePath))
      } else {
        results = results.filter((s) => s.filePath === query.filePath)
      }
    }

    if (query.filePaths !== undefined && query.filePaths.length > 0) {
      const paths = new Set(query.filePaths)
      results = results.filter((s) => paths.has(s.filePath))
    }

    if (query.parentSymbolId !== undefined) {
      results = results.filter((s) => s.parentId === query.parentSymbolId)
    }

    if (query.name !== undefined) {
      if (query.name.includes('*')) {
        const flags = ci ? 'i' : ''
        const pattern = new RegExp(
          '^' + query.name.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
          flags,
        )
        results = results.filter((s) => pattern.test(s.name))
      } else if (ci) {
        const lower = query.name.toLowerCase()
        results = results.filter((s) => s.name.toLowerCase() === lower)
      } else {
        results = results.filter((s) => s.name === query.name)
      }
    }

    if (query.comment !== undefined) {
      if (ci) {
        const lower = query.comment.toLowerCase()
        results = results.filter(
          (s) => s.comment !== undefined && s.comment.toLowerCase().includes(lower),
        )
      } else {
        results = results.filter(
          (s) => s.comment !== undefined && s.comment.includes(query.comment!),
        )
      }
    }

    return results
  }

  async getStatistics(): Promise<GraphStatistics> {
    this.ensureOpen()
    const relationCounts = {} as Record<string, number>
    for (const type of Object.values(RelationType)) {
      relationCounts[type] = this.relations.filter((r) => r.type === type).length
    }

    const languages = [...new Set([...this.files.values()].map((f) => f.language))]

    return {
      fileCount: this.files.size,
      documentCount: this.documents.size,
      symbolCount: this.symbols.size,
      specCount: this.specs.size,
      relationCounts: relationCounts as Record<
        (typeof RelationType)[keyof typeof RelationType],
        number
      >,
      languages,
      lastIndexedAt: this._lastIndexedAt,
      lastIndexedRef: this._lastIndexedRef,
      graphFingerprint: this._graphFingerprint,
    }
  }

  async getAllFiles(): Promise<FileNode[]> {
    this.ensureOpen()
    return [...this.files.values()]
  }

  async getAllDocuments(): Promise<DocumentNode[]> {
    this.ensureOpen()
    return [...this.documents.values()]
  }

  async getAllSpecs(): Promise<SpecNode[]> {
    this.ensureOpen()
    return [...this.specs.values()]
  }

  async searchSymbols(
    options: SearchOptions,
  ): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const rawQuery = options.query.trim().toLowerCase()
    const terms = options.query.toLowerCase().split(/\s+/)
    const results: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const sym of this.symbols.values()) {
      const text = `${expandSymbolName(sym.name)} ${sym.comment ?? ''}`.toLowerCase()
      if (!terms.some((t) => text.includes(t))) continue
      if (options.kinds && options.kinds.length > 0 && !options.kinds.includes(sym.kind)) continue
      if (options.filePattern) {
        const regex = new RegExp(
          options.filePattern.replaceAll('.', '\\.').replaceAll('*', '.*'),
          'i',
        )
        if (!regex.test(sym.filePath)) continue
      }
      if (options.workspace && !sym.filePath.startsWith(options.workspace + ':')) continue
      if (matchesExclude(sym.filePath, options.excludePaths, options.excludeWorkspaces)) continue
      const score =
        1 +
        (sym.id.toLowerCase() === rawQuery ? 1_000_000 : 0) +
        (sym.name.toLowerCase() === rawQuery ? 1_000 : 0)
      results.push({ symbol: sym, score, snippet: '', startLine: 1, endLine: 1 })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20)
  }

  async searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  > {
    this.ensureOpen()
    const rawQuery = options.query.trim().toLowerCase()
    const terms = options.query.toLowerCase().split(/\s+/)
    const results: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const spec of this.specs.values()) {
      const text = `${spec.specId} ${spec.title} ${spec.description} ${spec.content}`.toLowerCase()
      if (!terms.some((t) => text.includes(t))) continue
      if (options.workspace && spec.workspace !== options.workspace) continue
      if (matchesExclude(spec.path, options.excludePaths, options.excludeWorkspaces)) continue
      if (options.excludeWorkspaces && options.excludeWorkspaces.includes(spec.workspace)) continue
      const score = 1 + (spec.specId.toLowerCase() === rawQuery ? 1_000_000 : 0)
      results.push({ spec, score, snippet: '', startLine: 1, endLine: 1 })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20)
  }

  async searchDocuments(
    options: SearchOptions,
  ): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const rawQuery = options.query.trim().toLowerCase()
    const terms = options.query.toLowerCase().split(/\s+/)
    const results: Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const document of this.documents.values()) {
      const text =
        `${document.path} ${document.configRelativePath} ${document.content}`.toLowerCase()
      if (!terms.some((t) => text.includes(t))) continue
      if (options.workspace && document.workspace !== options.workspace) continue
      if (matchesExclude(document.path, options.excludePaths, options.excludeWorkspaces)) continue
      if (options.excludeWorkspaces && options.excludeWorkspaces.includes(document.workspace)) {
        continue
      }
      const score =
        1 +
        (document.path.toLowerCase() === rawQuery ? 1_000_000 : 0) +
        (document.configRelativePath.toLowerCase() === rawQuery ? 1_000 : 0)
      results.push({ document, score, snippet: '', startLine: 1, endLine: 1 })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20)
  }

  async rebuildFtsIndexes(): Promise<void> {
    this.ensureOpen()
    // No-op for in-memory store — search is always live
  }

  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    this.ensureOpen()
    const results: Array<{ symbol: SymbolNode; callerFilePath: string }> = []
    for (const rel of this.relations) {
      if (isSymbolDependencyRelationType(rel.type)) {
        const targetSymbol = this.symbols.get(rel.target)
        const callerSymbol = this.symbols.get(rel.source)
        if (targetSymbol && callerSymbol) {
          results.push({ symbol: targetSymbol, callerFilePath: callerSymbol.filePath })
        }
      }
    }
    return results
  }

  async getFileImporterCounts(): Promise<Map<string, number>> {
    this.ensureOpen()
    const counts = new Map<string, number>()
    for (const rel of this.relations) {
      if (rel.type === RelationType.Imports) {
        counts.set(rel.target, (counts.get(rel.target) ?? 0) + 1)
      }
    }
    return counts
  }

  async clear(): Promise<void> {
    this.ensureOpen()
    this.files.clear()
    this.documents.clear()
    this.symbols.clear()
    this.specs.clear()
    this.relations = []
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
  }

  async recreate(): Promise<void> {
    this.files.clear()
    this.documents.clear()
    this.symbols.clear()
    this.specs.clear()
    this.relations = []
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
  }
}
