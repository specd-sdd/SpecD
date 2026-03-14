import { type FileNode } from '../value-objects/file-node.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type SpecNode } from '../value-objects/spec-node.js'
import { type Relation } from '../value-objects/relation.js'
import { type SymbolQuery } from '../value-objects/symbol-query.js'
import { type GraphStatistics } from '../value-objects/graph-statistics.js'

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
   * Removes all data from the store.
   * @returns A promise that resolves when the store is cleared.
   */
  abstract clear(): Promise<void>
}
