import { GraphStore } from '../../src/domain/ports/graph-store.js'
import { type FileNode } from '../../src/domain/value-objects/file-node.js'
import { type SymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../src/domain/value-objects/spec-node.js'
import { type Relation } from '../../src/domain/value-objects/relation.js'
import { type SymbolQuery } from '../../src/domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../src/domain/value-objects/graph-statistics.js'
import { RelationType } from '../../src/domain/value-objects/relation-type.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'

export class InMemoryGraphStore extends GraphStore {
  private _isOpen = false
  private files = new Map<string, FileNode>()
  private symbols = new Map<string, SymbolNode>()
  private specs = new Map<string, SpecNode>()
  private relations: Relation[] = []
  private _lastIndexedAt: string | undefined

  constructor() {
    super(':memory:')
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
          (r.type === RelationType.Covers && r.source === specId)
        ),
    )
  }

  async getFile(path: string): Promise<FileNode | undefined> {
    this.ensureOpen()
    return this.files.get(path)
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
    return this.relations.filter((r) => r.type === RelationType.Calls && r.target === symbolId)
  }

  async getCallees(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.relations.filter((r) => r.type === RelationType.Calls && r.source === symbolId)
  }

  async getImporters(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.relations.filter((r) => r.type === RelationType.Imports && r.target === filePath)
  }

  async getImportees(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.relations.filter((r) => r.type === RelationType.Imports && r.source === filePath)
  }

  async getSpecDependencies(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.relations.filter((r) => r.type === RelationType.DependsOn && r.source === specId)
  }

  async getSpecDependents(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.relations.filter((r) => r.type === RelationType.DependsOn && r.target === specId)
  }

  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    this.ensureOpen()
    let results = [...this.symbols.values()]

    if (query.kind !== undefined) {
      results = results.filter((s) => s.kind === query.kind)
    }

    if (query.filePath !== undefined) {
      if (query.filePath.includes('*')) {
        const pattern = new RegExp('^' + query.filePath.replaceAll('*', '.*') + '$')
        results = results.filter((s) => pattern.test(s.filePath))
      } else {
        results = results.filter((s) => s.filePath === query.filePath)
      }
    }

    if (query.name !== undefined) {
      if (query.name.includes('*')) {
        const pattern = new RegExp('^' + query.name.replaceAll('*', '.*') + '$')
        results = results.filter((s) => pattern.test(s.name))
      } else {
        results = results.filter((s) => s.name === query.name)
      }
    }

    if (query.comment !== undefined) {
      results = results.filter((s) => s.comment !== undefined && s.comment.includes(query.comment!))
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
      symbolCount: this.symbols.size,
      specCount: this.specs.size,
      relationCounts: relationCounts as Record<
        (typeof RelationType)[keyof typeof RelationType],
        number
      >,
      languages,
      lastIndexedAt: this._lastIndexedAt,
    }
  }

  async getAllFiles(): Promise<FileNode[]> {
    this.ensureOpen()
    return [...this.files.values()]
  }

  async getAllSpecs(): Promise<SpecNode[]> {
    this.ensureOpen()
    return [...this.specs.values()]
  }

  async clear(): Promise<void> {
    this.ensureOpen()
    this.files.clear()
    this.symbols.clear()
    this.specs.clear()
    this.relations = []
    this._lastIndexedAt = undefined
  }
}
