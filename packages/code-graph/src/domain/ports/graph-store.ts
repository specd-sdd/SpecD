import { type FileNode } from '../value-objects/file-node.js'
import { type DocumentNode } from '../value-objects/document-node.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type SpecNode } from '../value-objects/spec-node.js'
import { type Relation } from '../value-objects/relation.js'
import { type RelationType } from '../value-objects/relation-type.js'
import { type SymbolQuery } from '../value-objects/symbol-query.js'
import { type GraphStatistics } from '../value-objects/graph-statistics.js'
import { type SearchOptions } from '../value-objects/search-options.js'
import {
  type DeclarationOccurrence,
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../value-objects/symbol-reference.js'
import { type IndexCoverage } from '../value-objects/index-session.js'
import {
  type SourceContentCandidatePage,
  type SourceContentCandidateQuery,
} from '../value-objects/source-search.js'
import {
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../value-objects/indexed-input-freshness.js'

/** Backend-neutral replacement payload for semantic reference facts derived during indexing. */
export interface ReferenceFactsWrite {
  readonly logicalSymbols: readonly LogicalSymbol[]
  readonly declarations: readonly LogicalDeclaration[]
  readonly publicBindings: readonly PublicBinding[]
  readonly localBindings: readonly LocalBinding[]
  readonly steps: readonly ResolutionStep[]
  readonly coverage: readonly IndexCoverage[]
}

/** Metadata committed atomically with one bulk-index generation. */
export interface IndexWriteSessionMetadata {
  readonly vcsRef?: string
  readonly graphFingerprint?: string
  readonly indexedWorkspaces?: readonly string[]
  readonly clearGraphStaleLatch?: boolean
  /** Replaces the complete derived code/document subgraph while preserving spec state. */
  readonly replaceCodeGraph?: boolean
  /** Rebuilds full-text search indexes when staged searchable content changed. */
  readonly rebuildSearchIndexes?: boolean
  readonly onProgress?: (step: string) => void
}

/**
 * Backend-neutral writer for one atomic indexing generation.
 *
 * Chunk methods only stage data. A backend makes staged changes visible when
 * {@link commit} succeeds; {@link rollback} discards the complete session.
 */
export interface IndexWriteSession {
  writeFiles(files: readonly FileNode[]): Promise<void>
  writeDocuments(documents: readonly DocumentNode[]): Promise<void>
  writeSymbols(symbols: readonly SymbolNode[]): Promise<void>
  writeSpecs(specs: readonly SpecNode[]): Promise<void>
  writeReferenceFacts(facts: ReferenceFactsWrite): Promise<void>
  writeObservations(observations: readonly IndexedInputObservation[]): Promise<void>
  writeRelations(relations: readonly Relation[]): Promise<void>
  removeFiles(filePaths: readonly string[]): Promise<void>
  removeDocuments(documentPaths: readonly string[]): Promise<void>
  removeSpecs(specIds: readonly string[]): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}

/** Associates a location-backed declaration with its stable logical target. */
export interface LogicalDeclaration {
  readonly logicalSymbolId: string
  readonly declaration: DeclarationOccurrence
}

/** Structured canonical lookup keys for logical targets. */
export interface LogicalSymbolLookup {
  readonly workspace: string
  readonly surface: string | undefined
  readonly name: string
  readonly space: string | undefined
  readonly ownerId: string | undefined
  readonly memberForm: string | undefined
}

/** Indexed lookup key for a named public route. */
export interface PublicBindingLookup {
  readonly surface: string
  readonly exportedName: string
  readonly space: string | undefined
}

/** Indexed lookup key for a lexical binding. */
export interface LocalBindingLookup {
  readonly filePath: string
  readonly scopeId: string | undefined
  readonly localName: string
  readonly space: string | undefined
}

/**
 * Persisted graph-storage generation snapshot used for stale-provider detection.
 */
export interface StorageGenerationSnapshot {
  /** Opaque generation token persisted by the backend. */
  readonly token: string
  /** Sidecar modification time in milliseconds since epoch. */
  readonly mtimeMs: number
}

/**
 * Abstract base class defining the contract for graph storage backends.
 */
export abstract class GraphStore {
  private readonly _storagePath: string

  /**
   * Returns the file-system path where the graph data is stored.
   * @returns The storage path string.
   */
  get storagePath(): string {
    return this._storagePath
  }

  /**
   * Creates a new GraphStore instance.
   * @param storagePath - The file-system path for graph data storage.
   */
  constructor(storagePath: string) {
    this._storagePath = storagePath
  }

  /**
   * Opens the store, preparing it for read/write operations.
   * @returns A promise that resolves when the store is ready.
   */
  abstract open(): Promise<void>

  /**
   * Closes the store, releasing any held resources.
   * @returns A promise that resolves when the store is closed.
   */
  abstract close(): Promise<void>

  /**
   * Inserts or updates a file node along with its symbols and relations.
   * @param file - The file node to upsert.
   * @param symbols - The symbols defined in the file.
   * @param relations - The relations originating from the file.
   * @returns A promise that resolves when the upsert is complete.
   */
  abstract upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void>

  /**
   * Removes a file and its associated symbols and relations from the store.
   * @param filePath - The path of the file to remove.
   * @returns A promise that resolves when the removal is complete.
   */
  abstract removeFile(filePath: string): Promise<void>

  /**
   * Inserts or updates a document node in the store.
   * @param document - The document node to upsert.
   * @returns A promise that resolves when the upsert is complete.
   */
  abstract upsertDocument(document: DocumentNode): Promise<void>

  /**
   * Removes a document from the store.
   * @param documentPath - The canonical document path to remove.
   * @returns A promise that resolves when the removal is complete.
   */
  abstract removeDocument(documentPath: string): Promise<void>

  /**
   * Inserts or updates a spec node along with its relations.
   * @param spec - The spec node to upsert.
   * @param relations - The relations associated with the spec.
   * @returns A promise that resolves when the upsert is complete.
   */
  abstract upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void>

  /**
   * Removes a spec and its associated relations from the store.
   * @param specId - The identifier of the spec to remove.
   * @returns A promise that resolves when the removal is complete.
   */
  abstract removeSpec(specId: string): Promise<void>

  /**
   * Removes multiple specs and their associated relations from the store.
   * Implementations should batch internal cleanup and rebuild derived indexes once.
   * @param specIds - The spec identifiers to remove.
   * @returns A promise that resolves when the removal is complete.
   */
  abstract removeSpecs(specIds: readonly string[]): Promise<void>

  /**
   * Retrieves a file node by its path.
   * @param path - The file path to look up.
   * @returns The matching file node, or undefined if not found.
   */
  /**
   * Adds relations to the store without removing existing data.
   * Used for cross-file relations (e.g. CALLS) that must survive file re-upserts.
   * @param relations - The relations to add.
   * @returns A promise that resolves when all relations are added.
   */
  abstract addRelations(relations: Relation[]): Promise<void>

  /**
   * Bulk loads files, symbols, specs, and relations into the store.
   * Much faster than individual upserts for large datasets.
   * Implementations should use native bulk import mechanisms when available.
   * @param data - The data to load.
   * @returns A promise that resolves when loading is complete.
   */
  abstract bulkLoad(data: {
    files: FileNode[]
    documents?: DocumentNode[]
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
    graphFingerprint?: string
    observations?: readonly IndexedInputObservation[]
    indexedWorkspaces?: readonly string[]
    clearGraphStaleLatch?: boolean
    rebuildSearchIndexes?: boolean
  }): Promise<void>

  /**
   * Reads every persisted input observation for the requested logical resources.
   * @param resources - Deduplicated resource identities to retrieve.
   * @returns Matching observations in deterministic identity order.
   */
  getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    void resources
    return Promise.reject(new Error('Indexed input freshness is not supported by this graph store'))
  }

  /**
   * Monotonically marks observations stale using indexed-evidence compare-and-set guards.
   * @param updates - Expected evidence for observations proven stale.
   * @returns A promise resolved after guarded updates complete.
   */
  markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void> {
    void updates
    return Promise.reject(new Error('Indexed input freshness is not supported by this graph store'))
  }

  /**
   * Refreshes filesystem stamps only when indexed evidence is unchanged and current.
   * @param updates - Equal-content observation refreshes.
   * @returns A promise resolved after guarded refreshes complete.
   */
  updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    void updates
    return Promise.reject(new Error('Indexed input freshness is not supported by this graph store'))
  }

  /**
   * Reads the aggregate and requested workspace monotonic stale latches.
   * @param workspaces - Workspace names to project.
   * @returns Persisted graph and workspace latch state.
   */
  getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    void workspaces
    return Promise.reject(new Error('Indexed input freshness is not supported by this graph store'))
  }

  /**
   * Atomically sets affected workspace latches and the aggregate graph latch.
   * @param workspaces - Workspace names proven stale; may be empty for global input staleness.
   * @returns A promise resolved after latch persistence completes.
   */
  markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void> {
    void workspaces
    return Promise.reject(new Error('Indexed input freshness is not supported by this graph store'))
  }

  /**
   * Begins one backend-neutral bulk indexing session.
   *
   * Concrete persisted backends override this compatibility implementation with
   * a native atomic transaction. The fallback retains compatibility for custom
   * stores while presenting the same bounded writer surface.
   * @param metadata - Metadata and progress callback committed with the generation.
   * @returns A new, initially empty write session.
   */
  beginBulkIndexSession(metadata: IndexWriteSessionMetadata = {}): IndexWriteSession {
    return new CompatibilityIndexWriteSession(this, metadata)
  }

  /**
   * Atomically replaces all derived logical-reference, binding, provenance, and
   * coverage facts. Backends that do not yet support semantic facts reject this
   * operation explicitly rather than partially persisting a replacement.
   * @param facts - Complete replacement snapshot for derived semantic facts.
   * @returns A promise that rejects when the backend lacks semantic-fact support.
   */
  replaceReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    void facts
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Returns the complete persisted semantic-reference snapshot for incremental hydration.
   * @returns Deterministically ordered reference facts.
   */
  getAllReferenceFacts(): Promise<ReferenceFactsWrite> {
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-looks up logical symbols by their structured canonical identity.
   * Results must use the canonical logical-symbol ordering.
   * @param lookups - Keys to resolve in one backend operation.
   * @returns Matching logical symbols in deterministic order.
   */
  findLogicalSymbols(lookups: readonly LogicalSymbolLookup[]): Promise<LogicalSymbol[]> {
    void lookups
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-retrieves logical symbols by canonical ids.
   * @param ids - Canonical logical-symbol identifiers.
   * @returns Matching logical symbols in deterministic order.
   */
  findLogicalSymbolsByIds(ids: readonly string[]): Promise<LogicalSymbol[]> {
    void ids
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-retrieves all declaration occurrences for logical targets.
   * @param logicalSymbolIds - Logical target identifiers to retrieve.
   * @returns Matching logical declarations in deterministic order.
   */
  findDeclarations(logicalSymbolIds: readonly string[]): Promise<LogicalDeclaration[]> {
    void logicalSymbolIds
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-looks up public bindings by surface, exported spelling, and space.
   * @param lookups - Public route keys to resolve in one backend operation.
   * @returns Matching public bindings in deterministic order.
   */
  findPublicBindings(lookups: readonly PublicBindingLookup[]): Promise<PublicBinding[]> {
    void lookups
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-looks up public bindings by exported spelling across all public surfaces.
   * @param exportedNames - Exported spellings to resolve in one backend operation.
   * @returns Matching public bindings in deterministic order.
   */
  findPublicBindingsByExportedNames(exportedNames: readonly string[]): Promise<PublicBinding[]> {
    void exportedNames
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-looks up lexical bindings by file, scope, spelling, and space.
   * @param lookups - Lexical binding keys to resolve in one backend operation.
   * @returns Matching lexical bindings in deterministic order.
   */
  findLocalBindings(lookups: readonly LocalBindingLookup[]): Promise<LocalBinding[]> {
    void lookups
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-retrieves ordered provenance steps whose source is one of the given ids.
   * @param fromIds - Binding or logical ids from which to retrieve steps.
   * @returns Matching provenance steps in deterministic order.
   */
  findResolutionSteps(fromIds: readonly string[]): Promise<ResolutionStep[]> {
    void fromIds
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Batch-retrieves current coverage evidence for source targets.
   * @param filePaths - Workspace-prefixed source paths to retrieve.
   * @returns Matching coverage facts in deterministic order.
   */
  findIndexCoverage(filePaths: readonly string[]): Promise<IndexCoverage[]> {
    void filePaths
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  /**
   * Returns every persisted source-coverage fact for aggregate health projection.
   * @returns Deterministically ordered coverage facts.
   */
  getAllIndexCoverage(): Promise<IndexCoverage[]> {
    return Promise.reject(new Error('Reference facts are not supported by this graph store'))
  }

  abstract getFile(path: string): Promise<FileNode | undefined>

  /**
   * Retrieves a document node by its path.
   * @param path - The document path to look up.
   * @returns The matching document node, or undefined if not found.
   */
  abstract getDocument(path: string): Promise<DocumentNode | undefined>

  /**
   * Retrieves all file nodes whose configRelativePath exactly matches the given path.
   * @param configRelativePath - The normalized config-relative path to search.
   * @returns An array of matching file nodes.
   */
  abstract findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]>

  /**
   * Retrieves all document nodes whose configRelativePath exactly matches the given path.
   * @param configRelativePath - The normalized config-relative path to search.
   * @returns An array of matching document nodes.
   */
  abstract findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]>

  /**
   * Retrieves a symbol node by its id.
   * @param id - The symbol id to look up.
   * @returns The matching symbol node, or undefined if not found.
   */
  abstract getSymbol(id: string): Promise<SymbolNode | undefined>

  /**
   * Retrieves existing symbols for a logical batch of identifiers.
   * Duplicate identifiers are ignored, unknown identifiers are omitted, and
   * results follow the first requested-id order.
   * @param symbolIds - Symbol identifiers to retrieve.
   * @returns Existing symbols in deterministic requested-id order.
   */
  abstract getSymbolsByIds(symbolIds: readonly string[]): Promise<SymbolNode[]>

  /**
   * Retrieves traversal relations targeting any requested symbol.
   * @param symbolIds - Target symbol identifiers to match.
   * @param relationTypes - Relation types to include.
   * @returns Matching relations ordered by source, type, then target.
   */
  abstract getIncomingSymbolRelations(
    symbolIds: readonly string[],
    relationTypes: readonly RelationType[],
  ): Promise<Relation[]>

  /**
   * Retrieves traversal relations originating from any requested symbol.
   * @param symbolIds - Source symbol identifiers to match.
   * @param relationTypes - Relation types to include.
   * @returns Matching relations ordered by source, type, then target.
   */
  abstract getOutgoingSymbolRelations(
    symbolIds: readonly string[],
    relationTypes: readonly RelationType[],
  ): Promise<Relation[]>

  /**
   * Retrieves existing files for an exact batch of canonical paths.
   * Duplicate paths are ignored, unknown paths are omitted, and results follow
   * the first requested-path order.
   * @param paths - Canonical file paths to retrieve.
   * @returns Existing files in deterministic requested-path order.
   */
  abstract getFilesByPaths(paths: readonly string[]): Promise<FileNode[]>

  /**
   * Retrieves existing documents for an exact batch of canonical paths.
   * Duplicate paths are ignored, unknown paths are omitted, and results follow
   * the first requested-path order.
   * @param paths - Canonical document paths to retrieve.
   * @returns Existing documents in deterministic requested-path order.
   */
  abstract getDocumentsByPaths(paths: readonly string[]): Promise<DocumentNode[]>

  /**
   * Retrieves existing specs for an exact batch of identifiers.
   * Duplicate identifiers are ignored, unknown identifiers are omitted, and
   * results follow the first requested-id order.
   * @param specIds - Spec identifiers to retrieve.
   * @returns Existing specs in deterministic requested-id order.
   */
  abstract getSpecsByIds(specIds: readonly string[]): Promise<SpecNode[]>

  /**
   * Retrieves a spec node by its id.
   * @param specId - The spec id to look up.
   * @returns The matching spec node, or undefined if not found.
   */
  abstract getSpec(specId: string): Promise<SpecNode | undefined>

  /**
   * Returns all relations where the given symbol is the target (i.e. its callers).
   * @param symbolId - The symbol id to find callers for.
   * @returns An array of relations pointing to this symbol.
   */
  abstract getCallers(symbolId: string): Promise<Relation[]>

  /**
   * Returns all relations where the given symbol is the source (i.e. its callees).
   * @param symbolId - The symbol id to find callees for.
   * @returns An array of relations originating from this symbol.
   */
  abstract getCallees(symbolId: string): Promise<Relation[]>

  /**
   * Returns all relations representing imports of the given file.
   * @param filePath - The file path to find importers for.
   * @returns An array of import relations targeting this file.
   */
  abstract getImporters(filePath: string): Promise<Relation[]>

  /**
   * Returns all relations representing files imported by the given file.
   * @param filePath - The file path to find importees for.
   * @returns An array of import relations originating from this file.
   */
  abstract getImportees(filePath: string): Promise<Relation[]>

  /**
   * Finds files whose persisted derived relations depend directly on any supplied file.
   * Implementations SHALL batch this lookup rather than query once per relation.
   * @param filePaths - Workspace-prefixed target file identities.
   * @returns Deterministically ordered dependent file paths.
   */
  async findDirectlyAffectedFiles(filePaths: readonly string[]): Promise<string[]> {
    const affected = new Set<string>()
    for (const filePath of new Set(filePaths)) {
      for (const relation of await this.getImporters(filePath)) affected.add(relation.source)
    }
    const symbols = await this.findSymbols({ filePaths })
    for (const symbol of symbols) {
      for (const relation of await this.getCallers(symbol.id)) {
        const source = await this.getSymbol(relation.source)
        if (source !== undefined) affected.add(source.filePath)
      }
      for (const relation of await this.getExtenders(symbol.id)) {
        const source = await this.getSymbol(relation.source)
        if (source !== undefined) affected.add(source.filePath)
      }
      for (const relation of await this.getImplementors(symbol.id)) {
        const source = await this.getSymbol(relation.source)
        if (source !== undefined) affected.add(source.filePath)
      }
      for (const relation of await this.getOverriders(symbol.id)) {
        const source = await this.getSymbol(relation.source)
        if (source !== undefined) affected.add(source.filePath)
      }
    }
    return [...affected].sort()
  }

  /**
   * Returns all hierarchy relations where the given type is the target of EXTENDS.
   * @param symbolId - The type symbol identifier to find extenders for.
   * @returns An array of EXTENDS relations targeting this symbol.
   */
  abstract getExtenders(symbolId: string): Promise<Relation[]>

  /**
   * Returns all hierarchy relations where the given type is the source of EXTENDS.
   * @param symbolId - The type symbol identifier to find extended targets for.
   * @returns An array of EXTENDS relations originating from this symbol.
   */
  abstract getExtendedTargets(symbolId: string): Promise<Relation[]>

  /**
   * Returns all hierarchy relations where the given contract is the target of IMPLEMENTS.
   * @param symbolId - The contract symbol identifier to find implementors for.
   * @returns An array of IMPLEMENTS relations targeting this symbol.
   */
  abstract getImplementors(symbolId: string): Promise<Relation[]>

  /**
   * Returns all hierarchy relations where the given type is the source of IMPLEMENTS.
   * @param symbolId - The type symbol identifier to find implemented targets for.
   * @returns An array of IMPLEMENTS relations originating from this symbol.
   */
  abstract getImplementedTargets(symbolId: string): Promise<Relation[]>

  /**
   * Returns all hierarchy relations where the given method is the target of OVERRIDES.
   * @param symbolId - The method symbol identifier to find overriding methods for.
   * @returns An array of OVERRIDES relations targeting this symbol.
   */
  abstract getOverriders(symbolId: string): Promise<Relation[]>

  /**
   * Returns all hierarchy relations where the given method is the source of OVERRIDES.
   * @param symbolId - The method symbol identifier to find overridden targets for.
   * @returns An array of OVERRIDES relations originating from this symbol.
   */
  abstract getOverriddenTargets(symbolId: string): Promise<Relation[]>

  /**
   * Returns all dependency relations for a given spec.
   * @param specId - The spec id to find dependencies for.
   * @returns An array of dependency relations originating from this spec.
   */
  abstract getSpecDependencies(specId: string): Promise<Relation[]>

  /**
   * Returns all specs that depend on the given spec.
   * @param specId - The spec id to find dependents for.
   * @returns An array of dependency relations targeting this spec.
   */
  abstract getSpecDependents(specId: string): Promise<Relation[]>

  /**
   * Returns all file-coverage relations originating from the given spec.
   * @param specId - The spec id to find covered files for.
   * @returns An array of COVERS_FILE relations.
   */
  abstract getCoveredFiles(specId: string): Promise<Relation[]>

  /**
   * Returns all file-coverage relations targeting the given file.
   * @param filePath - The canonical workspace-prefixed file path.
   * @returns An array of COVERS_FILE relations.
   */
  abstract getCoveringSpecsForFile(filePath: string): Promise<Relation[]>

  /**
   * Returns file-coverage relations targeting any requested file in one batch.
   * Empty input must return without backend work.
   * @param filePaths - Canonical workspace-prefixed file paths.
   * @returns Deterministically ordered COVERS_FILE relations.
   */
  abstract getCoveringSpecsForFiles(filePaths: readonly string[]): Promise<Relation[]>

  /**
   * Returns all symbol-coverage relations originating from the given spec.
   * @param specId - The spec id to find covered symbols for.
   * @returns An array of COVERS_SYMBOL relations.
   */
  abstract getCoveredSymbols(specId: string): Promise<Relation[]>

  /**
   * Returns all symbol-coverage relations targeting the given symbol.
   * @param symbolId - The symbol id to find covering specs for.
   * @returns An array of COVERS_SYMBOL relations.
   */
  abstract getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]>

  /**
   * Returns symbol-coverage relations targeting any requested symbol in one batch.
   * Empty input must return without backend work.
   * @param symbolIds - Symbol identifiers.
   * @returns Deterministically ordered COVERS_SYMBOL relations.
   */
  abstract getCoveringSpecsForSymbols(symbolIds: readonly string[]): Promise<Relation[]>

  /**
   * Returns all symbols exported by the given file.
   * @param filePath - The file path to find exports for.
   * @returns An array of exported symbol nodes.
   */
  abstract getExportedSymbols(filePath: string): Promise<SymbolNode[]>

  /**
   * Finds symbols matching the given query criteria.
   * @param query - The symbol query with optional name, kind, and filePath filters.
   * @returns An array of matching symbol nodes.
   */
  abstract findSymbols(query: SymbolQuery): Promise<SymbolNode[]>

  /**
   * Returns aggregate statistics about the graph contents.
   * @returns The graph statistics.
   */
  abstract getStatistics(): Promise<GraphStatistics>

  /**
   * Returns all file nodes in the store.
   * @returns An array of all file nodes.
   */
  abstract getAllFiles(): Promise<FileNode[]>

  /**
   * Returns all document nodes in the store.
   * @returns An array of all document nodes.
   */
  abstract getAllDocuments(): Promise<DocumentNode[]>

  /**
   * Returns all spec nodes in the store.
   * @returns An array of all spec nodes.
   */
  abstract getAllSpecs(): Promise<SpecNode[]>

  /**
   * Full-text search across symbols (name and comment).
   * Filters (kind, filePattern, workspace, excludePaths, excludeWorkspaces) are applied
   * before LIMIT in the query — no post-query filtering needed.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching symbols with BM25 scores and snippets, ordered by relevance.
   */
  abstract searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  >

  /**
   * Full-text search across specs (title, description, and content).
   * Filters (workspace, excludePaths, excludeWorkspaces) are applied
   * before LIMIT in the query — no post-query filtering needed.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching specs with BM25 scores and snippets, ordered by relevance.
   */
  abstract searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  >

  /**
   * Full-text search across documents (path and content).
   * Filters (filePattern, workspace, excludePaths, excludeWorkspaces) are applied
   * before LIMIT in the query — no post-query filtering needed.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching documents with scores and snippets, ordered by relevance.
   */
  abstract searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  >

  /**
   * Returns one filtered, deterministic page of source-content candidates.
   *
   * The Store supplies candidates only. Exact occurrence verification, symbol-aware
   * suppression, grouping, ranking, and final limits belong to SearchCodeGraph.
   * @param query - Expanded query, filters, cursor, and bounded page size.
   * @returns One candidate page and an optional opaque continuation cursor.
   */
  abstract searchSourceContentCandidates(
    query: SourceContentCandidateQuery,
  ): Promise<SourceContentCandidatePage>

  /**
   * Rebuilds full-text search indexes after data changes.
   * Must be called after bulk load or significant data mutations.
   * @returns A promise that resolves when indexes are rebuilt.
   */
  abstract rebuildFtsIndexes(): Promise<void>

  /**
   * Returns all (symbol, caller) pairs in the graph, one row per caller.
   * Used for batch hotspot computation — avoids N+1 per-symbol queries.
   * @returns An array of objects containing the target symbol and its caller's file path.
   */
  abstract getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>>

  /**
   * Returns the number of files that import each file in the graph.
   * Used for batch hotspot computation.
   * @returns A map from file path to importer count.
   */
  abstract getFileImporterCounts(): Promise<Map<string, number>>

  /**
   * Removes all data from the store.
   * @returns A promise that resolves when the store is cleared.
   */
  abstract clear(): Promise<void>

  /**
   * Recreates the backend's persisted graph storage from scratch.
   * @returns A promise that resolves when persistent state has been reset.
   */
  abstract recreate(): Promise<void>

  /**
   * Returns the current persisted storage-generation snapshot.
   * @returns Current generation token and modification time.
   */
  abstract getStorageGeneration(): Promise<StorageGenerationSnapshot>
}

/** Compatibility buffer used by custom stores that have not adopted native sessions. */
class CompatibilityIndexWriteSession implements IndexWriteSession {
  private readonly files: FileNode[] = []
  private readonly documents: DocumentNode[] = []
  private readonly symbols: SymbolNode[] = []
  private readonly specs: SpecNode[] = []
  private readonly relations = new Map<string, Relation>()
  private readonly observations: IndexedInputObservation[] = []
  private readonly removedFiles = new Set<string>()
  private readonly removedDocuments = new Set<string>()
  private readonly removedSpecs = new Set<string>()
  private referenceFacts: ReferenceFactsWrite | undefined
  private finished = false

  /**
   * Creates a compatibility session for a store without native session support.
   * @param store - Store receiving buffered writes on commit.
   * @param metadata - Generation metadata forwarded during commit.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly metadata: IndexWriteSessionMetadata,
  ) {}

  /**
   * Stages file nodes.
   * @param files - File nodes to stage.
   * @returns A promise resolved after staging.
   */
  writeFiles(files: readonly FileNode[]): Promise<void> {
    this.assertActive()
    this.files.push(...files)
    return Promise.resolve()
  }

  /**
   * Stages document nodes.
   * @param documents - Document nodes to stage.
   * @returns A promise resolved after staging.
   */
  writeDocuments(documents: readonly DocumentNode[]): Promise<void> {
    this.assertActive()
    this.documents.push(...documents)
    return Promise.resolve()
  }

  /**
   * Stages symbol nodes.
   * @param symbols - Symbol nodes to stage.
   * @returns A promise resolved after staging.
   */
  writeSymbols(symbols: readonly SymbolNode[]): Promise<void> {
    this.assertActive()
    this.symbols.push(...symbols)
    return Promise.resolve()
  }

  /**
   * Stages spec nodes.
   * @param specs - Spec nodes to stage.
   * @returns A promise resolved after staging.
   */
  writeSpecs(specs: readonly SpecNode[]): Promise<void> {
    this.assertActive()
    this.specs.push(...specs)
    return Promise.resolve()
  }

  /**
   * Stages semantic facts.
   * @param facts - Semantic fact chunk to append.
   * @returns A promise resolved after staging.
   */
  writeReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    this.assertActive()
    this.referenceFacts = appendReferenceFacts(this.referenceFacts, facts)
    return Promise.resolve()
  }

  /**
   * Stages freshness observations.
   * @param observations - Observations to stage.
   * @returns A promise resolved after staging.
   */
  writeObservations(observations: readonly IndexedInputObservation[]): Promise<void> {
    this.assertActive()
    this.observations.push(...observations)
    return Promise.resolve()
  }

  /**
   * Stages deduplicated relations.
   * @param relations - Relations to stage.
   * @returns A promise resolved after staging.
   */
  writeRelations(relations: readonly Relation[]): Promise<void> {
    this.assertActive()
    for (const relation of relations) {
      this.relations.set(relationKey(relation), relation)
    }
    return Promise.resolve()
  }

  /**
   * Stages file removals.
   * @param filePaths - File identities to remove.
   * @returns A promise resolved after staging.
   */
  removeFiles(filePaths: readonly string[]): Promise<void> {
    this.assertActive()
    for (const filePath of filePaths) this.removedFiles.add(filePath)
    return Promise.resolve()
  }

  /**
   * Stages document removals.
   * @param documentPaths - Document identities to remove.
   * @returns A promise resolved after staging.
   */
  removeDocuments(documentPaths: readonly string[]): Promise<void> {
    this.assertActive()
    for (const documentPath of documentPaths) this.removedDocuments.add(documentPath)
    return Promise.resolve()
  }

  /**
   * Stages spec removals.
   * @param specIds - Spec identities to remove.
   * @returns A promise resolved after staging.
   */
  removeSpecs(specIds: readonly string[]): Promise<void> {
    this.assertActive()
    for (const specId of specIds) this.removedSpecs.add(specId)
    return Promise.resolve()
  }

  /** Commits all staged compatibility writes. */
  async commit(): Promise<void> {
    this.assertActive()
    this.finished = true
    if (this.metadata.replaceCodeGraph === true) {
      for (const file of await this.store.getAllFiles()) this.removedFiles.add(file.path)
      for (const document of await this.store.getAllDocuments()) {
        this.removedDocuments.add(document.path)
      }
    }
    for (const filePath of this.removedFiles) await this.store.removeFile(filePath)
    for (const documentPath of this.removedDocuments) {
      await this.store.removeDocument(documentPath)
    }
    await this.store.removeSpecs([...this.removedSpecs])
    await this.store.bulkLoad({
      files: this.files,
      documents: this.documents,
      symbols: this.symbols,
      specs: this.specs,
      relations: [],
      ...(this.metadata.onProgress === undefined ? {} : { onProgress: this.metadata.onProgress }),
      ...(this.metadata.vcsRef === undefined ? {} : { vcsRef: this.metadata.vcsRef }),
      ...(this.metadata.graphFingerprint === undefined
        ? {}
        : { graphFingerprint: this.metadata.graphFingerprint }),
      ...(this.observations.length === 0 ? {} : { observations: this.observations }),
      ...(this.metadata.indexedWorkspaces === undefined
        ? {}
        : { indexedWorkspaces: this.metadata.indexedWorkspaces }),
      ...(this.metadata.clearGraphStaleLatch === undefined
        ? {}
        : { clearGraphStaleLatch: this.metadata.clearGraphStaleLatch }),
      ...(this.metadata.rebuildSearchIndexes === undefined
        ? {}
        : { rebuildSearchIndexes: this.metadata.rebuildSearchIndexes }),
    })
    if (this.referenceFacts !== undefined) {
      await this.store.replaceReferenceFacts(this.referenceFacts)
    }
    await this.store.addRelations([...this.relations.values()])
    if (this.metadata.rebuildSearchIndexes !== false) {
      this.metadata.onProgress?.('search-indexes')
      await this.store.rebuildFtsIndexes()
    }
  }

  /**
   * Discards all staged compatibility writes.
   * @returns A promise resolved after the buffers are cleared.
   */
  rollback(): Promise<void> {
    this.assertActive()
    this.finished = true
    this.clear()
    return Promise.resolve()
  }

  /**
   * Ensures the session has not already completed.
   * @throws When the session already completed.
   */
  private assertActive(): void {
    if (this.finished) throw new Error('Bulk index session is already finished')
  }

  /** Clears every staged buffer. */
  private clear(): void {
    this.files.length = 0
    this.documents.length = 0
    this.symbols.length = 0
    this.specs.length = 0
    this.relations.clear()
    this.observations.length = 0
    this.removedFiles.clear()
    this.removedDocuments.clear()
    this.removedSpecs.clear()
    this.referenceFacts = undefined
  }
}

/**
 * Appends bounded semantic-fact chunks into one replacement snapshot.
 * @param current - Existing optional replacement snapshot.
 * @param next - Next semantic-fact chunk.
 * @returns Merged replacement snapshot.
 */
function appendReferenceFacts(
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
 * Returns the persisted relation uniqueness key.
 * @param relation - Relation to identify.
 * @returns Stable uniqueness key.
 */
function relationKey(relation: Relation): string {
  return JSON.stringify([relation.source, relation.target, relation.type])
}
