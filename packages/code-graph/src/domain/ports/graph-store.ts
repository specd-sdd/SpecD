import { type FileNode } from '../value-objects/file-node.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type SpecNode } from '../value-objects/spec-node.js'
import { type Relation } from '../value-objects/relation.js'
import { type SymbolQuery } from '../value-objects/symbol-query.js'
import { type GraphStatistics } from '../value-objects/graph-statistics.js'
import { type SearchOptions } from '../value-objects/search-options.js'

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
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
  }): Promise<void>

  abstract getFile(path: string): Promise<FileNode | undefined>

  /**
   * Retrieves a symbol node by its id.
   * @param id - The symbol id to look up.
   * @returns The matching symbol node, or undefined if not found.
   */
  abstract getSymbol(id: string): Promise<SymbolNode | undefined>

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
   * Returns all spec nodes in the store.
   * @returns An array of all spec nodes.
   */
  abstract getAllSpecs(): Promise<SpecNode[]>

  /**
   * Full-text search across symbols (name and comment).
   * Filters (kind, filePattern, workspace, excludePaths, excludeWorkspaces) are applied
   * before LIMIT in the query — no post-query filtering needed.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching symbols with BM25 scores, ordered by relevance.
   */
  abstract searchSymbols(
    options: SearchOptions,
  ): Promise<Array<{ symbol: SymbolNode; score: number }>>

  /**
   * Full-text search across specs (title, description, and content).
   * Filters (workspace, excludePaths, excludeWorkspaces) are applied
   * before LIMIT in the query — no post-query filtering needed.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching specs with BM25 scores, ordered by relevance.
   */
  abstract searchSpecs(options: SearchOptions): Promise<Array<{ spec: SpecNode; score: number }>>

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
}
