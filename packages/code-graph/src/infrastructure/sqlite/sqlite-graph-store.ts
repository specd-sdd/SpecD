import {
  GraphStore,
  type IndexWriteSession,
  type IndexWriteSessionMetadata,
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
  type StorageGenerationSnapshot,
} from '../../domain/ports/graph-store.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import {
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import { type IndexCoverage } from '../../domain/value-objects/index-session.js'
import {
  type SourceContentCandidatePage,
  type SourceContentCandidateQuery,
} from '../../domain/value-objects/source-search.js'
import {
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../domain/value-objects/indexed-input-freshness.js'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { SQLiteWorkerClient } from './sqlite-worker-client.js'
import { type SQLiteGraphStoreOptions } from './sqlite-runtime-descriptor.js'
import { type BulkIndexPayload } from './sqlite-worker-protocol.js'
import { rotateStorageGeneration } from '../storage-generation.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'

/**
 * Options for direct bulk load operation in SQLite graph store.
 */
export interface SqliteBulkLoadOptions {
  /** File nodes to bulk load. */
  readonly files: FileNode[]
  /** Optional document nodes to bulk load. */
  readonly documents?: DocumentNode[] | undefined
  /** Symbol nodes to bulk load. */
  readonly symbols: SymbolNode[]
  /** Spec nodes to bulk load. */
  readonly specs: SpecNode[]
  /** Relations to bulk load. */
  readonly relations: Relation[]
  /** Optional callback for stage progress. */
  readonly onProgress?: ((step: string) => void) | undefined
  /** Optional VCS ref identifier. */
  readonly vcsRef?: string | undefined
  /** Optional graph content fingerprint. */
  readonly graphFingerprint?: string | undefined
  /** Optional input observations. */
  readonly observations?: readonly IndexedInputObservation[] | undefined
  /** Optional indexed workspace list. */
  readonly indexedWorkspaces?: readonly string[] | undefined
  /** Whether to clear graph stale latch. */
  readonly clearGraphStaleLatch?: boolean | undefined
  /** Whether to rebuild search indexes. */
  readonly rebuildSearchIndexes?: boolean | undefined
}

/**
 * SQLite-backed GraphStore implementation.
 * Delegates all SQLite persistence, queries, transactions, and search indexing
 * to a dedicated persistent worker thread over asynchronous RPC.
 */
export class SQLiteGraphStore extends GraphStore {
  private readonly client = new SQLiteWorkerClient()
  private readonly options: SQLiteGraphStoreOptions | undefined
  private bulkSessionActive = false

  /**
   * Creates a new SQLite-backed graph store under the provided storage root.
   *
   * @param storagePath - Root path owning `graph/` and `tmp/` directories.
   * @param options - Optional runtime configuration and max pending operation options.
   */
  constructor(storagePath: string, options?: SQLiteGraphStoreOptions) {
    super(storagePath)
    this.options = options
  }

  /**
   * Opens the graph store by spawning the worker thread and initializing SQLite.
   *
   * @returns Promise resolving when the store is open.
   */
  async open(): Promise<void> {
    await this.client.open(this.storagePath, this.options)
  }

  /**
   * Closes the graph store connection and terminates the worker thread.
   *
   * @returns Promise resolving when the store is closed.
   */
  async close(): Promise<void> {
    await this.client.close()
  }

  /**
   * Atomically upserts a file and replaces its associated symbols and relations.
   *
   * @param file - File node to persist.
   * @param symbols - Symbol nodes defined in the file.
   * @param relations - Outgoing relations originating from the file or its symbols.
   * @returns Promise resolving when the file is upserted.
   */
  async upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void> {
    await this.client.sendRequest('upsertFile', { file, symbols, relations })
  }

  /**
   * Removes a file and cascades deletion of its symbols and relations.
   *
   * @param filePath - Canonical path of the file to remove.
   * @returns Promise resolving when the file is removed.
   */
  async removeFile(filePath: string): Promise<void> {
    await this.client.sendRequest('removeFile', { filePath })
  }

  /**
   * Upserts a documentation node into the graph store.
   *
   * @param document - Document node to persist.
   * @returns Promise resolving when the document is upserted.
   */
  async upsertDocument(document: DocumentNode): Promise<void> {
    await this.client.sendRequest('upsertDocument', { document })
  }

  /**
   * Removes a document from the graph store.
   *
   * @param documentPath - Canonical path of the document to remove.
   * @returns Promise resolving when the document is removed.
   */
  async removeDocument(documentPath: string): Promise<void> {
    await this.client.sendRequest('removeDocument', { documentPath })
  }

  /**
   * Upserts a spec node and updates its spec-level relationships.
   *
   * @param spec - Spec node to persist.
   * @param relations - Outgoing relations from the spec.
   * @returns Promise resolving when the spec is upserted.
   */
  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    await this.client.sendRequest('upsertSpec', { spec, relations })
  }

  /**
   * Removes a spec and its relations from the graph store.
   *
   * @param specId - Identifier of the spec to remove.
   * @returns Promise resolving when the spec is removed.
   */
  async removeSpec(specId: string): Promise<void> {
    await this.client.sendRequest('removeSpec', { specId })
  }

  /**
   * Removes multiple specs in a single operation.
   *
   * @param specIds - Array of spec IDs to remove.
   * @returns Promise resolving when the specs are removed.
   */
  async removeSpecs(specIds: readonly string[]): Promise<void> {
    await this.client.sendRequest('removeSpecs', { specIds })
  }

  /**
   * Adds relations to the graph store.
   *
   * @param relations - Relations to insert.
   * @returns Promise resolving when the relations are added.
   */
  async addRelations(relations: Relation[]): Promise<void> {
    await this.client.sendRequest('addRelations', { relations })
  }

  /**
   * Retrieves a file node by its canonical path.
   *
   * @param path - Canonical path of the file.
   * @returns Promise resolving to the file node, or undefined if not found.
   */
  async getFile(path: string): Promise<FileNode | undefined> {
    return this.client.sendRequest<FileNode | undefined>('getFile', { filePath: path })
  }

  /**
   * Retrieves a document node by its canonical path.
   *
   * @param path - Canonical path of the document.
   * @returns Promise resolving to the document node, or undefined if not found.
   */
  async getDocument(path: string): Promise<DocumentNode | undefined> {
    return this.client.sendRequest<DocumentNode | undefined>('getDocument', { documentId: path })
  }

  /**
   * Finds files matching a config-relative path.
   *
   * @param configRelativePath - Workspace/config relative path.
   * @returns Promise resolving to matching file nodes.
   */
  async findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]> {
    return this.client.sendRequest<FileNode[]>('findFilesByConfigRelativePath', {
      configRelativePath,
    })
  }

  /**
   * Finds documents matching a config-relative path.
   *
   * @param configRelativePath - Workspace/config relative path.
   * @returns Promise resolving to matching document nodes.
   */
  async findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]> {
    return this.client.sendRequest<DocumentNode[]>('findDocumentsByConfigRelativePath', {
      configRelativePath,
    })
  }

  /**
   * Retrieves a symbol node by its unique identifier.
   *
   * @param id - Unique symbol ID.
   * @returns Promise resolving to the symbol node, or undefined if not found.
   */
  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    return this.client.sendRequest<SymbolNode | undefined>('getSymbol', { symbolId: id })
  }

  /**
   * Retrieves a spec node by its unique identifier.
   *
   * @param specId - Unique spec ID.
   * @returns Promise resolving to the spec node, or undefined if not found.
   */
  async getSpec(specId: string): Promise<SpecNode | undefined> {
    return this.client.sendRequest<SpecNode | undefined>('getSpec', { specId })
  }

  /**
   * Retrieves incoming Call relations targeting the specified symbol.
   *
   * @param symbolId - Target symbol ID.
   * @returns Promise resolving to calling relations.
   */
  async getCallers(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCallers', { symbolId })
  }

  /**
   * Retrieves outgoing Call relations originating from the specified symbol.
   *
   * @param symbolId - Source symbol ID.
   * @returns Promise resolving to callee relations.
   */
  async getCallees(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCallees', { symbolId })
  }

  /**
   * Retrieves incoming Import relations targeting the specified file.
   *
   * @param filePath - Target file path.
   * @returns Promise resolving to importing relations.
   */
  async getImporters(filePath: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getImporters', { filePath })
  }

  /**
   * Retrieves outgoing Import relations from the specified file.
   *
   * @param filePath - Source file path.
   * @returns Promise resolving to imported relations.
   */
  async getImportees(filePath: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getImportees', { filePath })
  }

  /**
   * Finds files directly affected by changes to the given files.
   *
   * @param filePaths - Changed file paths.
   * @returns Promise resolving to affected file paths.
   */
  override async findDirectlyAffectedFiles(filePaths: readonly string[]): Promise<string[]> {
    return this.client.sendRequest<string[]>('findDirectlyAffectedFiles', { filePaths })
  }

  /**
   * Retrieves relations for symbols that extend the given symbol.
   *
   * @param symbolId - Extended target symbol ID.
   * @returns Promise resolving to extender relations.
   */
  async getExtenders(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getExtenders', { symbolId })
  }

  /**
   * Retrieves relations for symbols extended by the given symbol.
   *
   * @param symbolId - Source symbol ID.
   * @returns Promise resolving to extended target relations.
   */
  async getExtendedTargets(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getExtendedTargets', { symbolId })
  }

  /**
   * Retrieves relations for symbols that implement the given interface/type.
   *
   * @param symbolId - Implemented target symbol ID.
   * @returns Promise resolving to implementor relations.
   */
  async getImplementors(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getImplementors', { symbolId })
  }

  /**
   * Retrieves relations for interfaces implemented by the given symbol.
   *
   * @param symbolId - Source symbol ID.
   * @returns Promise resolving to implemented target relations.
   */
  async getImplementedTargets(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getImplementedTargets', { symbolId })
  }

  /**
   * Retrieves relations for methods that override the given symbol.
   *
   * @param symbolId - Overridden target symbol ID.
   * @returns Promise resolving to overrider relations.
   */
  async getOverriders(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getOverriders', { symbolId })
  }

  /**
   * Retrieves relations for methods overridden by the given symbol.
   *
   * @param symbolId - Source symbol ID.
   * @returns Promise resolving to overridden target relations.
   */
  async getOverriddenTargets(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getOverriddenTargets', { symbolId })
  }

  /**
   * Retrieves dependencies for a given spec.
   *
   * @param specId - Source spec ID.
   * @returns Promise resolving to dependency relations.
   */
  async getSpecDependencies(specId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getSpecDependencies', { specId })
  }

  /**
   * Retrieves dependents for a given spec.
   *
   * @param specId - Target spec ID.
   * @returns Promise resolving to dependent relations.
   */
  async getSpecDependents(specId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getSpecDependents', { specId })
  }

  /**
   * Retrieves files covered by the given spec.
   *
   * @param specId - Spec ID.
   * @returns Promise resolving to covered file relations.
   */
  async getCoveredFiles(specId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveredFiles', { specId })
  }

  /**
   * Retrieves specs covering the given file.
   *
   * @param filePath - Canonical file path.
   * @returns Promise resolving to covering spec relations.
   */
  async getCoveringSpecsForFile(filePath: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveringSpecsForFile', { filePath })
  }

  /**
   * Retrieves specs covering any of the given files.
   *
   * @param filePaths - Canonical file paths.
   * @returns Promise resolving to covering spec relations.
   */
  async getCoveringSpecsForFiles(filePaths: readonly string[]): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveringSpecsForFiles', { filePaths })
  }

  /**
   * Retrieves symbols covered by the given spec.
   *
   * @param specId - Spec ID.
   * @returns Promise resolving to covered symbol relations.
   */
  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveredSymbols', { specId })
  }

  /**
   * Retrieves specs covering the given symbol.
   *
   * @param symbolId - Symbol ID.
   * @returns Promise resolving to covering spec relations.
   */
  async getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveringSpecsForSymbol', { symbolId })
  }

  /**
   * Retrieves specs covering any of the given symbols.
   *
   * @param symbolIds - Symbol IDs.
   * @returns Promise resolving to covering spec relations.
   */
  async getCoveringSpecsForSymbols(symbolIds: readonly string[]): Promise<Relation[]> {
    return this.client.sendRequest<Relation[]>('getCoveringSpecsForSymbols', { symbolIds })
  }

  /**
   * Retrieves symbols exported by the given file.
   *
   * @param filePath - Canonical file path.
   * @returns Promise resolving to exported symbol nodes.
   */
  async getExportedSymbols(filePath: string): Promise<SymbolNode[]> {
    return this.client.sendRequest<SymbolNode[]>('getExportedSymbols', { filePath })
  }

  /**
   * Finds symbols matching query criteria.
   *
   * @param query - Symbol query criteria.
   * @returns Promise resolving to matching symbol nodes.
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    return this.client.sendRequest<SymbolNode[]>('findSymbols', { query })
  }

  /**
   * Returns aggregated graph statistics.
   *
   * @returns Promise resolving to graph statistics.
   */
  async getStatistics(): Promise<GraphStatistics> {
    return this.client.sendRequest<GraphStatistics>('getStatistics', {})
  }

  /**
   * Retrieves all file nodes in the graph.
   *
   * @returns Promise resolving to all file nodes.
   */
  async getAllFiles(): Promise<FileNode[]> {
    return this.client.sendRequest<FileNode[]>('getAllFiles', {})
  }

  /**
   * Retrieves all document nodes in the graph.
   *
   * @returns Promise resolving to all document nodes.
   */
  async getAllDocuments(): Promise<DocumentNode[]> {
    return this.client.sendRequest<DocumentNode[]>('getAllDocuments', {})
  }

  /**
   * Retrieves all spec nodes in the graph.
   *
   * @returns Promise resolving to all spec nodes.
   */
  async getAllSpecs(): Promise<SpecNode[]> {
    return this.client.sendRequest<SpecNode[]>('getAllSpecs', {})
  }

  /**
   * Searches symbols using full-text search and ranking.
   *
   * @param options - Search options including query and limit.
   * @returns Promise resolving to ranked symbol search hits.
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
    return this.client.sendRequest('searchSymbols', {
      query: options.query,
      options,
    })
  }

  /**
   * Searches specs using full-text search and ranking.
   *
   * @param options - Search options including query and limit.
   * @returns Promise resolving to ranked spec search hits.
   */
  async searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  > {
    return this.client.sendRequest('searchSpecs', {
      query: options.query,
      options,
    })
  }

  /**
   * Searches documents using full-text search and ranking.
   *
   * @param options - Search options including query and limit.
   * @returns Promise resolving to ranked document search hits.
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
    return this.client.sendRequest('searchDocuments', {
      query: options.query,
      options,
    })
  }

  /**
   * Searches source code occurrences for candidate substrings.
   *
   * @param query - Source content candidate query.
   * @returns Promise resolving to a page of source content candidates.
   */
  async searchSourceContentCandidates(
    query: SourceContentCandidateQuery,
  ): Promise<SourceContentCandidatePage> {
    return this.client.sendRequest<SourceContentCandidatePage>('searchSourceCandidates', { query })
  }

  /**
   * Retrieves all symbol callers across the graph.
   *
   * @returns Promise resolving to symbol-caller tuples.
   */
  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    return this.client.sendRequest('getSymbolCallers', {})
  }

  /**
   * Retrieves incoming importer counts per file.
   *
   * @returns Promise resolving to a map from file path to count.
   */
  async getFileImporterCounts(): Promise<Map<string, number>> {
    return this.client.sendRequest<Map<string, number>>('getFileImporterCounts', {})
  }

  /**
   * Clears all graph data while maintaining schema tables.
   *
   * @returns Promise resolving when data is cleared.
   */
  async clear(): Promise<void> {
    await this.client.sendRequest('clear', {})
  }

  /**
   * Recreates the database schema destructively.
   *
   * @returns Promise resolving when recreation completes.
   */
  override async recreate(): Promise<void> {
    if (!this.client.isOpen) {
      const graphDir = join(this.storagePath, 'graph')
      rmSync(graphDir, { recursive: true, force: true })
      rotateStorageGeneration(this.storagePath)
      await this.open()
      return
    }
    await this.client.sendRequest('recreate', {})
  }

  /**
   * Reads current storage generation snapshot.
   *
   * @returns Promise resolving to the generation snapshot.
   */
  async getStorageGeneration(): Promise<StorageGenerationSnapshot> {
    return this.client.sendRequest<StorageGenerationSnapshot>('readStorageGenerationSnapshot', {})
  }

  /**
   * Retrieves indexed input observations for given resource keys.
   *
   * @param resources - Resource keys to query.
   * @returns Promise resolving to observations.
   */
  override async getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    return this.client.sendRequest<readonly IndexedInputObservation[]>(
      'getIndexedInputObservations',
      { resources },
    )
  }

  /**
   * Marks specified indexed inputs as stale.
   *
   * @param updates - Updates marking inputs stale.
   * @returns Promise resolving when updates are applied.
   */
  override async markIndexedInputsStale(
    updates: readonly MarkIndexedInputStaleInput[],
  ): Promise<void> {
    await this.client.sendRequest('markIndexedInputsStale', { updates })
  }

  /**
   * Updates observation records for indexed inputs.
   *
   * @param updates - Observations to record.
   * @returns Promise resolving when observations are updated.
   */
  override async updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    await this.client.sendRequest('updateIndexedInputObservation', { updates })
  }

  /**
   * Reads freshness latches for specified workspaces.
   *
   * @param workspaces - Workspace names.
   * @returns Promise resolving to freshness latches.
   */
  override async getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    return this.client.sendRequest<FreshnessLatches>('readFreshnessLatches', { workspaces })
  }

  /**
   * Marks workspaces and graph state stale since last index run.
   *
   * @param workspaces - Workspace names to mark.
   * @returns Promise resolving when marked stale.
   */
  override async markWorkspacesAndGraphStaleSinceLastIndex(
    workspaces: readonly string[],
  ): Promise<void> {
    await this.client.sendRequest('markWorkspacesAndGraphStaleSinceLastIndex', { workspaces })
  }

  /**
   * Replaces semantic reference facts in the store.
   *
   * @param facts - Reference facts payload to write.
   * @returns Promise resolving when facts are replaced.
   */
  override async replaceReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    await this.client.sendRequest('replaceReferenceFacts', { facts })
  }

  /**
   * Looks up logical symbols matching specified lookups.
   *
   * @param lookups - Logical symbol lookup criteria.
   * @returns Promise resolving to matching logical symbols.
   */
  override async findLogicalSymbols(
    lookups: readonly LogicalSymbolLookup[],
  ): Promise<LogicalSymbol[]> {
    return this.client.sendRequest<LogicalSymbol[]>('findLogicalSymbols', { lookups })
  }

  /**
   * Retrieves all reference facts stored in the graph.
   *
   * @returns Promise resolving to all reference facts.
   */
  override async getAllReferenceFacts(): Promise<ReferenceFactsWrite> {
    return this.client.sendRequest<ReferenceFactsWrite>('getAllReferenceFacts', {})
  }

  /**
   * Finds logical symbols by their unique IDs.
   *
   * @param ids - Logical symbol IDs.
   * @returns Promise resolving to found logical symbols.
   */
  override async findLogicalSymbolsByIds(ids: readonly string[]): Promise<LogicalSymbol[]> {
    return this.client.sendRequest<LogicalSymbol[]>('findLogicalSymbolsByIds', { ids })
  }

  /**
   * Finds declarations for specified logical symbol IDs.
   *
   * @param logicalSymbolIds - Logical symbol IDs.
   * @returns Promise resolving to declarations.
   */
  override async findDeclarations(
    logicalSymbolIds: readonly string[],
  ): Promise<LogicalDeclaration[]> {
    return this.client.sendRequest<LogicalDeclaration[]>('findDeclarations', { logicalSymbolIds })
  }

  /**
   * Finds public bindings matching lookups.
   *
   * @param lookups - Public binding lookup criteria.
   * @returns Promise resolving to matching public bindings.
   */
  override async findPublicBindings(
    lookups: readonly PublicBindingLookup[],
  ): Promise<PublicBinding[]> {
    return this.client.sendRequest<PublicBinding[]>('findPublicBindings', { lookups })
  }

  /**
   * Finds public bindings matching exported names.
   *
   * @param exportedNames - Exported binding names.
   * @returns Promise resolving to public bindings.
   */
  override async findPublicBindingsByExportedNames(
    exportedNames: readonly string[],
  ): Promise<PublicBinding[]> {
    return this.client.sendRequest<PublicBinding[]>('findPublicBindingsByExportedNames', {
      exportedNames,
    })
  }

  /**
   * Finds local bindings matching lookups.
   *
   * @param lookups - Local binding lookup criteria.
   * @returns Promise resolving to local bindings.
   */
  override async findLocalBindings(
    lookups: readonly LocalBindingLookup[],
  ): Promise<LocalBinding[]> {
    return this.client.sendRequest<LocalBinding[]>('findLocalBindings', { lookups })
  }

  /**
   * Finds reference resolution steps from source IDs.
   *
   * @param fromIds - Source identifier list.
   * @returns Promise resolving to resolution steps.
   */
  override async findResolutionSteps(fromIds: readonly string[]): Promise<ResolutionStep[]> {
    return this.client.sendRequest<ResolutionStep[]>('findResolutionSteps', { fromIds })
  }

  /**
   * Finds index coverage for specified file paths.
   *
   * @param filePaths - File paths to inspect.
   * @returns Promise resolving to index coverage records.
   */
  override async findIndexCoverage(filePaths: readonly string[]): Promise<IndexCoverage[]> {
    return this.client.sendRequest<IndexCoverage[]>('findIndexCoverage', { filePaths })
  }

  /**
   * Retrieves index coverage for all indexed files.
   *
   * @returns Promise resolving to all index coverage records.
   */
  override async getAllIndexCoverage(): Promise<IndexCoverage[]> {
    return this.client.sendRequest<IndexCoverage[]>('findIndexCoverage', {})
  }

  /**
   * Rebuilds full-text search indexes on the database.
   *
   * @returns Promise resolving when FTS indexes are rebuilt.
   */
  override async rebuildFtsIndexes(): Promise<void> {
    await this.client.sendRequest<void>('rebuildFtsIndexes', {})
  }

  /**
   * Begins one indexing generation with host staging and atomic worker commit.
   *
   * @param metadata - Metadata committed with the indexed generation.
   * @returns An atomic write session staging items on the host and committing in worker.
   * @throws {StoreNotOpenError} When the graph store is not open.
   * @throws {Error} When another bulk index session is already active.
   */
  override beginBulkIndexSession(metadata: IndexWriteSessionMetadata = {}): IndexWriteSession {
    if (!this.client.isOpen) {
      throw new StoreNotOpenError()
    }
    if (this.bulkSessionActive) {
      throw new Error('A bulk index session is already active')
    }
    this.bulkSessionActive = true

    const files: FileNode[] = []
    const documents: DocumentNode[] = []
    const symbols: SymbolNode[] = []
    const specs: SpecNode[] = []
    const observations: IndexedInputObservation[] = []
    const relations = new Map<string, Relation>()
    const removedFiles = new Set<string>()
    const removedDocuments = new Set<string>()
    const removedSpecs = new Set<string>()
    let referenceFacts: ReferenceFactsWrite | undefined
    let finished = false

    const assertActive = (): void => {
      if (finished) throw new Error('Bulk index session is already finished')
    }
    const finish = (): void => {
      finished = true
      this.bulkSessionActive = false
    }

    return {
      writeFiles: (chunk) => {
        assertActive()
        files.push(...chunk)
        return Promise.resolve()
      },
      writeDocuments: (chunk) => {
        assertActive()
        documents.push(...chunk)
        return Promise.resolve()
      },
      writeSymbols: (chunk) => {
        assertActive()
        symbols.push(...chunk)
        return Promise.resolve()
      },
      writeSpecs: (chunk) => {
        assertActive()
        specs.push(...chunk)
        return Promise.resolve()
      },
      writeReferenceFacts: (chunk) => {
        assertActive()
        referenceFacts = mergeReferenceFactChunks(referenceFacts, chunk)
        return Promise.resolve()
      },
      writeObservations: (chunk) => {
        assertActive()
        observations.push(...chunk)
        return Promise.resolve()
      },
      writeRelations: (chunk) => {
        assertActive()
        for (const relation of chunk) {
          relations.set(sqliteRelationKey(relation), relation)
        }
        return Promise.resolve()
      },
      removeFiles: (paths) => {
        assertActive()
        for (const path of paths) removedFiles.add(path)
        return Promise.resolve()
      },
      removeDocuments: (paths) => {
        assertActive()
        for (const path of paths) removedDocuments.add(path)
        return Promise.resolve()
      },
      removeSpecs: (ids) => {
        assertActive()
        for (const id of ids) removedSpecs.add(id)
        return Promise.resolve()
      },
      commit: async () => {
        assertActive()
        const payload: BulkIndexPayload = {
          files,
          documents,
          symbols,
          specs,
          relations: [...relations.values()],
          removedFilePaths: [...removedFiles],
          removedDocumentPaths: [...removedDocuments],
          removedSpecIds: [...removedSpecs],
          referenceFacts,
          observations,
          vcsRef: metadata.vcsRef,
          graphFingerprint: metadata.graphFingerprint,
          indexedWorkspaces: metadata.indexedWorkspaces,
          clearGraphStaleLatch: metadata.clearGraphStaleLatch,
          replaceCodeGraph: metadata.replaceCodeGraph,
          rebuildSearchIndexes: metadata.rebuildSearchIndexes,
        }

        try {
          await this.client.sendRequest('commitBulkIndex', payload, metadata.onProgress)
          finish()
        } catch (error) {
          finish()
          throw error
        }
      },
      rollback: () => {
        assertActive()
        finish()
        return Promise.resolve()
      },
    }
  }

  /**
   * Bulk loads graph entities directly into the SQLite worker.
   *
   * @param options - Bulk data payload and options.
   * @returns Promise resolving when the bulk load commits.
   */
  async bulkLoad(options: SqliteBulkLoadOptions): Promise<void> {
    const payload: BulkIndexPayload = {
      files: options.files,
      documents: options.documents,
      symbols: options.symbols,
      specs: options.specs,
      relations: options.relations,
      vcsRef: options.vcsRef,
      graphFingerprint: options.graphFingerprint,
      observations: options.observations,
      indexedWorkspaces: options.indexedWorkspaces,
      clearGraphStaleLatch: options.clearGraphStaleLatch,
      rebuildSearchIndexes: options.rebuildSearchIndexes,
    }
    await this.client.sendRequest('commitBulkIndex', payload, options.onProgress)
  }
}

/**
 * Merges reference fact write chunks into a single aggregated payload.
 *
 * @param current - Existing reference facts accumulator.
 * @param next - Next chunk to append.
 * @returns Combined reference facts write payload.
 */
function mergeReferenceFactChunks(
  current: ReferenceFactsWrite | undefined,
  next: ReferenceFactsWrite,
): ReferenceFactsWrite {
  if (current === undefined) return next
  return {
    logicalSymbols: [...current.logicalSymbols, ...next.logicalSymbols],
    declarations: [...current.declarations, ...next.declarations],
    publicBindings: [...current.publicBindings, ...next.publicBindings],
    localBindings: [...current.localBindings, ...next.localBindings],
    steps: [...current.steps, ...next.steps],
    coverage: [...current.coverage, ...next.coverage],
  }
}

/**
 * Generates a stable key for relation deduplication in SQLite persistence.
 *
 * @param relation - Relation to generate a key for.
 * @returns JSON string representing the relation uniqueness tuple.
 */
function sqliteRelationKey(relation: Relation): string {
  return JSON.stringify([relation.source, relation.target, relation.type])
}
