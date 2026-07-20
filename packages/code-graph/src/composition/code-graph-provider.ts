import { type GraphStore, type StorageGenerationSnapshot } from '../domain/ports/graph-store.js'
import { type IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { type IndexOptions } from '../domain/value-objects/index-options.js'
import { type IndexResult } from '../domain/value-objects/index-result.js'
import { type SymbolNode } from '../domain/value-objects/symbol-node.js'
import { type FileNode } from '../domain/value-objects/file-node.js'
import { type DocumentNode } from '../domain/value-objects/document-node.js'
import { type SpecNode } from '../domain/value-objects/spec-node.js'
import { type SymbolQuery } from '../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../domain/value-objects/graph-statistics.js'
import { type TraversalOptions } from '../domain/value-objects/traversal-options.js'
import { type TraversalResult } from '../domain/value-objects/traversal-result.js'
import {
  type ImpactResult,
  type FileImpactResult,
  type SpecImpactResult,
} from '../domain/value-objects/impact-result.js'
import { type ChangeDetectionResult } from '../domain/value-objects/change-detection-result.js'
import { type HotspotOptions, type HotspotResult } from '../domain/value-objects/hotspot-result.js'
import { type Relation } from '../domain/value-objects/relation.js'
import { type SearchOptions } from '../domain/value-objects/search-options.js'
import {
  resolveFileSelector,
  resolveSymbolSelector,
  type ResolvedFileSelector,
  type ResolvedSymbolSelector,
} from '../application/services/resolve-graph-selector.js'
import { getUpstream } from '../domain/services/get-upstream.js'
import { getDownstream } from '../domain/services/get-downstream.js'
import { analyzeImpact } from '../domain/services/analyze-impact.js'
import { analyzeFileImpact } from '../domain/services/analyze-file-impact.js'
import { analyzeSpecImpact } from '../domain/services/analyze-spec-impact.js'
import { detectChanges } from '../domain/services/detect-changes.js'
import { computeHotspots } from '../domain/services/compute-hotspots.js'
import { analyzeFilesImpact } from '../domain/services/analyze-files-impact.js'
import { StoreNotOpenError } from '../domain/errors/store-not-open-error.js'
import { GraphProviderStaleError } from '../domain/errors/graph-provider-stale-error.js'
import {
  assertGraphIndexUnlockedByStoragePath,
  acquireGraphIndexLockByStoragePath,
} from '../infrastructure/index-lock.js'

/**
 * Public, factory-created facade for the code graph subsystem.
 *
 * This is intentionally a type-only contract. The concrete implementation and
 * its store/indexer constructor dependencies remain inside composition.
 */
export interface CodeGraphProvider {
  open(): Promise<void>
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
  index(options: IndexOptions): Promise<IndexResult>
  getSymbol(id: string): Promise<SymbolNode | undefined>
  findSymbols(query: SymbolQuery): Promise<SymbolNode[]>
  getFile(path: string): Promise<FileNode | undefined>
  getDocument(path: string): Promise<DocumentNode | undefined>
  findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]>
  findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]>
  resolveFileSelector(input: string): Promise<ResolvedFileSelector[]>
  resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelector[]>
  getSpec(specId: string): Promise<SpecNode | undefined>
  getSpecDependencies(specId: string): Promise<Relation[]>
  getSpecDependents(specId: string): Promise<Relation[]>
  getCoveredFiles(specId: string): Promise<Relation[]>
  getCoveringSpecsForFile(filePath: string): Promise<Relation[]>
  getCoveredSymbols(specId: string): Promise<Relation[]>
  getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]>
  getStatistics(): Promise<GraphStatistics>
  getUpstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult>
  getDownstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult>
  analyzeImpact(
    target: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<ImpactResult>
  analyzeFileImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<FileImpactResult>
  analyzeFilesImpact(
    filePaths: string[],
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<FileImpactResult>
  analyzeSpecImpact(
    specId: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<SpecImpactResult>
  clear(): Promise<void>
  detectChanges(changedFiles: string[], maxDepth?: number): Promise<ChangeDetectionResult>
  getHotspots(options?: HotspotOptions): Promise<HotspotResult>
  searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  >
  searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  >
  searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  >
}

/**
 * Internal implementation of the factory-created graph provider.
 */
export class CodeGraphProviderImpl implements CodeGraphProvider {
  private _isOpen = false
  private _storageGeneration: StorageGenerationSnapshot | null = null

  /**
   * Creates a new internal graph provider.
   * @param store - The underlying graph store.
   * @param indexer - The indexing use case.
   * @param projectRoot - Optional project root path to make configuration paths relative.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly indexer: IndexCodeGraph,
    private readonly projectRoot?: string,
  ) {}

  /**
   * Opens the underlying graph store.
   */
  async open(): Promise<void> {
    if (this._isOpen) {
      return
    }

    await this.store.open()
    this._storageGeneration = await this.store.getStorageGeneration()
    this._isOpen = true
  }

  /**
   * Closes the underlying graph store and releases resources.
   */
  async close(): Promise<void> {
    if (!this._isOpen) {
      return
    }

    await this.store.close()
    this._isOpen = false
    this._storageGeneration = null
  }

  /**
   * Releases provider resources when used with `await using`.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  /**
   * Indexes files and specs in the workspace into the code graph.
   * @param options - Options controlling the indexing run.
   * @returns A summary of the indexing result.
   */
  async index(options: IndexOptions): Promise<IndexResult> {
    this.assertProviderOpen()
    return this.withIndexLock(async () => {
      if (options.force === true) {
        await this.store.recreate()
      }
      const result = await this.indexer.execute(options)
      this._storageGeneration = await this.store.getStorageGeneration()
      return result
    })
  }

  /**
   * Retrieves a symbol node by its unique identifier.
   * @param id - The symbol identifier.
   * @returns The symbol node, or undefined if not found.
   */
  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    await this.assertAvailable()
    return this.store.getSymbol(id)
  }

  /**
   * Searches for symbols matching the given query criteria.
   * @param query - The symbol query with optional filters.
   * @returns An array of matching symbol nodes.
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    await this.assertAvailable()
    return this.store.findSymbols(query)
  }

  /**
   * Retrieves a file node by its path.
   * @param path - The file path.
   * @returns The file node, or undefined if not found.
   */
  async getFile(path: string): Promise<FileNode | undefined> {
    await this.assertAvailable()
    return this.store.getFile(path)
  }

  /**
   * Retrieves a document node by its path.
   * @param path - The document path.
   * @returns The document node, or undefined if not found.
   */
  async getDocument(path: string): Promise<DocumentNode | undefined> {
    await this.assertAvailable()
    return this.store.getDocument(path)
  }

  /**
   * Finds files by their config-relative path.
   * @param configRelativePath - The config-relative path to search for.
   * @returns Matching file nodes.
   */
  async findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]> {
    await this.assertAvailable()
    return this.store.findFilesByConfigRelativePath(configRelativePath)
  }

  /**
   * Finds documents by their config-relative path.
   * @param configRelativePath - The config-relative path to search for.
   * @returns Matching document nodes.
   */
  async findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]> {
    await this.assertAvailable()
    return this.store.findDocumentsByConfigRelativePath(configRelativePath)
  }

  /**
   * Resolves a file-bearing selector into canonical graph identities.
   * @param input - The raw selector string.
   * @returns Matching canonical file or document entries.
   */
  async resolveFileSelector(input: string): Promise<ResolvedFileSelector[]> {
    await this.assertAvailable()
    return resolveFileSelector(input, {
      store: this.store,
      ...(this.projectRoot !== undefined ? { projectRoot: this.projectRoot } : {}),
    })
  }

  /**
   * Resolves a symbol selector into canonical graph identities.
   * @param input - The raw selector string.
   * @returns Matching canonical symbol entries.
   */
  async resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelector[]> {
    await this.assertAvailable()
    return resolveSymbolSelector(input, {
      store: this.store,
      ...(this.projectRoot !== undefined ? { projectRoot: this.projectRoot } : {}),
    })
  }

  /**
   * Retrieves a spec node by its identifier.
   * @param specId - The spec identifier.
   * @returns The spec node, or undefined if not found.
   */
  async getSpec(specId: string): Promise<SpecNode | undefined> {
    await this.assertAvailable()
    return this.store.getSpec(specId)
  }

  /**
   * Returns all specs that the given spec depends on.
   * @param specId - The spec identifier.
   * @returns An array of dependency relations.
   */
  async getSpecDependencies(specId: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getSpecDependencies(specId)
  }

  /**
   * Returns all specs that depend on the given spec.
   * @param specId - The spec identifier.
   * @returns An array of dependent relations.
   */
  async getSpecDependents(specId: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getSpecDependents(specId)
  }

  /**
   * Returns file coverage relations emitted by a spec.
   * @param specId - The spec identifier.
   * @returns File coverage relations.
   */
  async getCoveredFiles(specId: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getCoveredFiles(specId)
  }

  /**
   * Returns specs that cover the given file.
   * @param filePath - Canonical file path.
   * @returns File coverage relations keyed by spec.
   */
  async getCoveringSpecsForFile(filePath: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getCoveringSpecsForFile(filePath)
  }

  /**
   * Returns symbol coverage relations emitted by a spec.
   * @param specId - The spec identifier.
   * @returns Symbol coverage relations.
   */
  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getCoveredSymbols(specId)
  }

  /**
   * Returns specs that cover the given symbol.
   * @param symbolId - Canonical symbol identifier.
   * @returns Symbol coverage relations keyed by spec.
   */
  async getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]> {
    await this.assertAvailable()
    return this.store.getCoveringSpecsForSymbol(symbolId)
  }

  /**
   * Returns aggregate statistics about the code graph.
   * @returns The graph statistics.
   */
  async getStatistics(): Promise<GraphStatistics> {
    await this.assertAvailable()
    return this.store.getStatistics()
  }

  /**
   * Traverses upstream (callers/importers) from a symbol.
   * @param symbolId - The symbol identifier to start from.
   * @param options - Optional traversal depth and filtering options.
   * @returns The traversal result with visited nodes and edges.
   */
  async getUpstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult> {
    await this.assertAvailable()
    return getUpstream(this.store, symbolId, options)
  }

  /**
   * Traverses downstream (callees/importees) from a symbol.
   * @param symbolId - The symbol identifier to start from.
   * @param options - Optional traversal depth and filtering options.
   * @returns The traversal result with visited nodes and edges.
   */
  async getDownstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult> {
    await this.assertAvailable()
    return getDownstream(this.store, symbolId, options)
  }

  /**
   * Analyzes the impact (blast radius) of changes to a symbol.
   * @param target - The symbol identifier to analyze.
   * @param direction - Direction of impact analysis.
   * @param maxDepth - Maximum traversal depth.
   * @returns The impact result with affected symbols and risk levels.
   */
  async analyzeImpact(
    target: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<ImpactResult> {
    await this.assertAvailable()
    return analyzeImpact(this.store, target, direction, maxDepth)
  }

  /**
   * Analyzes the impact (blast radius) of changes to a file.
   * @param filePath - The file path to analyze.
   * @param direction - Direction of impact analysis.
   * @param maxDepth - Maximum traversal depth.
   * @returns The file impact result with affected files and risk levels.
   */
  async analyzeFileImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<FileImpactResult> {
    await this.assertAvailable()
    return analyzeFileImpact(this.store, filePath, direction, maxDepth)
  }

  /**
   * Analyzes the aggregate impact (blast radius) of changes to multiple files.
   * @param filePaths - The file paths to analyze.
   * @param direction - Direction of impact analysis.
   * @param maxDepth - Maximum traversal depth.
   * @returns The combined files impact result.
   */
  async analyzeFilesImpact(
    filePaths: string[],
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<FileImpactResult> {
    await this.assertAvailable()
    return analyzeFilesImpact(this.store, filePaths, direction, maxDepth)
  }

  /**
   * Analyzes requirement-aware impact for a spec.
   * @param specId - Spec identifier to analyze.
   * @param direction - Direction of impact analysis.
   * @param maxDepth - Maximum traversal depth.
   * @returns Requirement-aware spec impact result.
   */
  async analyzeSpecImpact(
    specId: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<SpecImpactResult> {
    await this.assertAvailable()
    return analyzeSpecImpact(this.store, specId, direction, maxDepth)
  }

  /**
   * Removes all data from the graph store.
   * @returns A promise that resolves when the store is cleared.
   */
  async clear(): Promise<void> {
    this.assertProviderOpen()
    await this.withIndexLock(async () => {
      await this.store.clear()
      this._storageGeneration = await this.store.getStorageGeneration()
    })
  }

  /**
   * Detects the scope of changes given a set of modified files.
   * @param changedFiles - Array of file paths that have changed.
   * @param maxDepth - Maximum traversal depth.
   * @returns The change detection result with affected symbols and flows.
   */
  async detectChanges(changedFiles: string[], maxDepth?: number): Promise<ChangeDetectionResult> {
    await this.assertAvailable()
    return detectChanges(this.store, changedFiles, maxDepth)
  }

  /**
   * Computes hotspot scores for all symbols in the graph.
   * @param options - Optional filtering and limiting options.
   * @returns The hotspot result with ranked entries.
   */
  async getHotspots(options?: HotspotOptions): Promise<HotspotResult> {
    await this.assertAvailable()
    return computeHotspots(this.store, options)
  }

  /**
   * Full-text search across symbols (name and comment).
   * @param options - Search options including query, limit, and filters.
   * @returns Matching symbols with BM25 scores, ordered by relevance.
   */
  async searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    await this.assertAvailable()
    return this.store.searchSymbols(options)
  }

  /**
   * Full-text search across specs (title, description, and content).
   * @param options - Search options including query, limit, and filters.
   * @returns Matching specs with BM25 scores and snippets, ordered by relevance.
   */
  async searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  > {
    await this.assertAvailable()
    return this.store.searchSpecs(options)
  }

  /**
   * Full-text search across documents (path and content).
   * @param options - Search options including query, limit, and filters.
   * @returns Matching documents with scores and snippets, ordered by relevance.
   */
  async searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    await this.assertAvailable()
    return this.store.searchDocuments(options)
  }

  /**
   * Throws when the provider has not been opened.
   * @throws {StoreNotOpenError} When the provider has not been opened.
   */
  private assertProviderOpen(): void {
    if (!this._isOpen) {
      throw new StoreNotOpenError()
    }
  }

  /**
   * Ensures the provider is open, not busy, and still bound to the current storage generation.
   * @throws {StoreNotOpenError} When the provider has not been opened.
   * @throws {GraphProviderStaleError} When the storage generation changed after open.
   */
  private async assertAvailable(): Promise<void> {
    this.assertProviderOpen()
    assertGraphIndexUnlockedByStoragePath(this.store.storagePath)

    const currentGeneration = await this.store.getStorageGeneration()
    const cachedGeneration = this._storageGeneration

    if (cachedGeneration === null) {
      this._storageGeneration = currentGeneration
      return
    }

    if (currentGeneration.mtimeMs !== cachedGeneration.mtimeMs) {
      if (currentGeneration.token !== cachedGeneration.token) {
        throw new GraphProviderStaleError()
      }
      this._storageGeneration = currentGeneration
    }
  }

  /**
   * Runs a provider-maintenance operation while holding the shared graph index lock.
   * @param fn - Operation to execute while the lock is held.
   * @returns The operation result.
   */
  private async withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = acquireGraphIndexLockByStoragePath(this.store.storagePath)
    try {
      return await fn()
    } finally {
      release()
    }
  }
}
