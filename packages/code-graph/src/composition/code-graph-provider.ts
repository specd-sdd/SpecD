import { type GraphStore } from '../domain/ports/graph-store.js'
import { type IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { type IndexOptions } from '../domain/value-objects/index-options.js'
import { type IndexResult } from '../domain/value-objects/index-result.js'
import { type SymbolNode } from '../domain/value-objects/symbol-node.js'
import { type FileNode } from '../domain/value-objects/file-node.js'
import { type SpecNode } from '../domain/value-objects/spec-node.js'
import { type SymbolQuery } from '../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../domain/value-objects/graph-statistics.js'
import { type TraversalOptions } from '../domain/value-objects/traversal-options.js'
import { type TraversalResult } from '../domain/value-objects/traversal-result.js'
import { type ImpactResult, type FileImpactResult } from '../domain/value-objects/impact-result.js'
import { type ChangeDetectionResult } from '../domain/value-objects/change-detection-result.js'
import { type Relation } from '../domain/value-objects/relation.js'
import { getUpstream } from '../domain/services/get-upstream.js'
import { getDownstream } from '../domain/services/get-downstream.js'
import { analyzeImpact } from '../domain/services/analyze-impact.js'
import { analyzeFileImpact } from '../domain/services/analyze-file-impact.js'
import { detectChanges } from '../domain/services/detect-changes.js'

/**
 * High-level facade for the code graph subsystem.
 * Provides methods for indexing, querying, traversal, impact analysis, and change detection.
 */
export class CodeGraphProvider {
  /**
   * Creates a new CodeGraphProvider.
   * @param store - The underlying graph store.
   * @param indexer - The indexing use case.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly indexer: IndexCodeGraph,
  ) {}

  /**
   * Opens the underlying graph store.
   */
  async open(): Promise<void> {
    await this.store.open()
  }

  /**
   * Closes the underlying graph store and releases resources.
   */
  async close(): Promise<void> {
    await this.store.close()
  }

  /**
   * Indexes files and specs in the workspace into the code graph.
   * @param options - Options controlling the indexing run.
   * @returns A summary of the indexing result.
   */
  async index(options: IndexOptions): Promise<IndexResult> {
    return this.indexer.execute(options)
  }

  /**
   * Retrieves a symbol node by its unique identifier.
   * @param id - The symbol identifier.
   * @returns The symbol node, or undefined if not found.
   */
  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    return this.store.getSymbol(id)
  }

  /**
   * Searches for symbols matching the given query criteria.
   * @param query - The symbol query with optional filters.
   * @returns An array of matching symbol nodes.
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    return this.store.findSymbols(query)
  }

  /**
   * Retrieves a file node by its path.
   * @param path - The file path.
   * @returns The file node, or undefined if not found.
   */
  async getFile(path: string): Promise<FileNode | undefined> {
    return this.store.getFile(path)
  }

  /**
   * Retrieves a spec node by its identifier.
   * @param specId - The spec identifier.
   * @returns The spec node, or undefined if not found.
   */
  async getSpec(specId: string): Promise<SpecNode | undefined> {
    return this.store.getSpec(specId)
  }

  /**
   * Returns all specs that the given spec depends on.
   * @param specId - The spec identifier.
   * @returns An array of dependency relations.
   */
  async getSpecDependencies(specId: string): Promise<Relation[]> {
    return this.store.getSpecDependencies(specId)
  }

  /**
   * Returns all specs that depend on the given spec.
   * @param specId - The spec identifier.
   * @returns An array of dependent relations.
   */
  async getSpecDependents(specId: string): Promise<Relation[]> {
    return this.store.getSpecDependents(specId)
  }

  /**
   * Returns aggregate statistics about the code graph.
   * @returns The graph statistics.
   */
  async getStatistics(): Promise<GraphStatistics> {
    return this.store.getStatistics()
  }

  /**
   * Traverses upstream (callers/importers) from a symbol.
   * @param symbolId - The symbol identifier to start from.
   * @param options - Optional traversal depth and filtering options.
   * @returns The traversal result with visited nodes and edges.
   */
  async getUpstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult> {
    return getUpstream(this.store, symbolId, options)
  }

  /**
   * Traverses downstream (callees/importees) from a symbol.
   * @param symbolId - The symbol identifier to start from.
   * @param options - Optional traversal depth and filtering options.
   * @returns The traversal result with visited nodes and edges.
   */
  async getDownstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult> {
    return getDownstream(this.store, symbolId, options)
  }

  /**
   * Analyzes the impact (blast radius) of changes to a symbol.
   * @param target - The symbol identifier to analyze.
   * @param direction - Direction of impact analysis.
   * @returns The impact result with affected symbols and risk levels.
   */
  async analyzeImpact(
    target: string,
    direction: 'upstream' | 'downstream' | 'both',
  ): Promise<ImpactResult> {
    return analyzeImpact(this.store, target, direction)
  }

  /**
   * Analyzes the impact (blast radius) of changes to a file.
   * @param filePath - The file path to analyze.
   * @param direction - Direction of impact analysis.
   * @returns The file impact result with affected files and risk levels.
   */
  async analyzeFileImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
  ): Promise<FileImpactResult> {
    return analyzeFileImpact(this.store, filePath, direction)
  }

  /**
   * Detects the scope of changes given a set of modified files.
   * @param changedFiles - Array of file paths that have changed.
   * @returns The change detection result with affected symbols and flows.
   */
  async detectChanges(changedFiles: string[]): Promise<ChangeDetectionResult> {
    return detectChanges(this.store, changedFiles)
  }
}
