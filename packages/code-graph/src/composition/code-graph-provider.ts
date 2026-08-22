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
import { type IndexCoverage } from '../domain/value-objects/index-session.js'
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
  FreshnessState,
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../domain/value-objects/indexed-input-freshness.js'
import { AssessIndexedResourceFreshness } from '../application/use-cases/assess-indexed-resource-freshness.js'
import {
  resolveFileSelector,
  resolveSymbolSelector,
  type ResolvedFileSelector,
  type ResolvedSymbolSelectorResult,
} from '../application/services/resolve-graph-selector.js'
import { getUpstream } from '../domain/services/get-upstream.js'
import { getDownstream } from '../domain/services/get-downstream.js'
import {
  analyzeImpact,
  analyzePublicBindingImpact,
  type PublicBindingImpactResult,
  type ResolvedPublicBindingImpactInput,
} from '../domain/services/analyze-impact.js'
import {
  analyzeFileImpact,
  analyzeFileImportImpact,
} from '../domain/services/analyze-file-impact.js'
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
import {
  type DeclarationOccurrence,
  type PublicBinding,
  type ResolveSymbolReferenceInput,
  type ResolutionHealth,
  type SymbolSpace,
  type SymbolResolutionResult,
} from '../domain/value-objects/symbol-reference.js'
import { ResolveSymbolReference } from '../application/use-cases/resolve-symbol-reference.js'
import {
  GetGraphHealth,
  type GetGraphHealthInput,
  type GetGraphHealthResult,
} from '../application/use-cases/get-graph-health.js'
import {
  SearchCodeGraph,
  type ReferenceAwareSymbolResult,
  type SearchCodeGraphInput,
  type SearchCodeGraphResult,
} from '../application/use-cases/search-code-graph.js'

/** Result of opening a provider through its indexing-specific repair lifecycle. */
export interface IndexingOpenResult {
  readonly fullRebuild: boolean
  readonly fullRebuildReason: string | null
}

/** Complete identity used to retrieve one already-resolved public binding. */
export interface ExactPublicBindingSelector {
  readonly surface: string
  readonly exportedName: string
  readonly space: SymbolSpace
  readonly targetId: string
}

/** Exact public binding together with the declarations of its canonical target. */
export interface ExactPublicBindingResult {
  readonly binding: PublicBinding
  readonly declarations: readonly DeclarationOccurrence[]
}

/**
 * Public, factory-created facade for the code graph subsystem.
 *
 * This is intentionally a type-only contract. The concrete implementation and
 * its store/indexer constructor dependencies remain inside composition.
 */
export interface CodeGraphProvider {
  open(): Promise<void>
  openForIndexing(): Promise<IndexingOpenResult>
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
  index(options: IndexOptions): Promise<IndexResult>
  getSymbol(id: string): Promise<SymbolNode | undefined>
  findSymbols(query: SymbolQuery): Promise<SymbolNode[]>
  getFile(path: string): Promise<FileNode | undefined>
  getDocument(path: string): Promise<DocumentNode | undefined>
  getFilesByPaths(paths: readonly string[]): Promise<FileNode[]>
  getDocumentsByPaths(paths: readonly string[]): Promise<DocumentNode[]>
  getSymbolsByIds(symbolIds: readonly string[]): Promise<SymbolNode[]>
  getSpecsByIds(specIds: readonly string[]): Promise<SpecNode[]>
  findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]>
  findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]>
  resolveFileSelector(input: string): Promise<ResolvedFileSelector[]>
  resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelectorResult>
  getSpec(specId: string): Promise<SpecNode | undefined>
  getSpecDependencies(specId: string): Promise<Relation[]>
  getSpecDependents(specId: string): Promise<Relation[]>
  getCoveredFiles(specId: string): Promise<Relation[]>
  getCoveringSpecsForFile(filePath: string): Promise<Relation[]>
  getCoveredSymbols(specId: string): Promise<Relation[]>
  getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]>
  getStatistics(): Promise<GraphStatistics>
  getGraphHealth(): Promise<GetGraphHealthResult>
  resolveSymbolReference(
    input: ResolveSymbolReferenceInput,
    health?: GetGraphHealthResult,
  ): Promise<SymbolResolutionResult>
  resolveSymbolReferences(
    inputs: readonly ResolveSymbolReferenceInput[],
    health?: GetGraphHealthResult,
  ): Promise<readonly SymbolResolutionResult[]>
  getExactPublicBinding(
    selector: ExactPublicBindingSelector,
  ): Promise<ExactPublicBindingResult | null>
  getUpstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult>
  getDownstream(symbolId: string, options?: TraversalOptions): Promise<TraversalResult>
  analyzeImpact(
    target: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<ImpactResult>
  analyzePublicBindingImpact(
    input: ResolvedPublicBindingImpactInput,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<PublicBindingImpactResult>
  analyzeFileImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<FileImpactResult>
  analyzeFileImportImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<ImpactResult>
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
  searchReferenceSymbols(options: SearchOptions): Promise<readonly ReferenceAwareSymbolResult[]>
  search(input: SearchCodeGraphInput): Promise<SearchCodeGraphResult>
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
  private readonly resolver: ResolveSymbolReference
  private readonly referenceSearch: SearchCodeGraph

  /**
   * Creates a new internal graph provider.
   * @param store - The underlying graph store.
   * @param indexer - The indexing use case.
   * @param projectRoot - Optional project root path to make configuration paths relative.
   * @param graphHealth - Optional provider-owned graph-health composition.
   * @param graphHealth.useCase - Canonical health use case.
   * @param graphHealth.input - Config-bound health input excluding the provider.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly indexer: IndexCodeGraph,
    private readonly projectRoot?: string,
    private readonly graphHealth?: {
      readonly useCase: GetGraphHealth
      readonly input: Omit<GetGraphHealthInput, 'provider'>
    },
  ) {
    this.resolver = new ResolveSymbolReference(
      store,
      async () => this.toResolutionHealth(await this.getGraphHealth()),
      (resources) => this.assessExactResources(resources),
    )
    this.referenceSearch = new SearchCodeGraph(store)
  }

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
   * Opens the store for indexing, recreating incompatible derived storage when necessary.
   * Ordinary {@link open} never performs this destructive repair.
   * @returns Repair diagnostics for this open operation.
   */
  async openForIndexing(): Promise<IndexingOpenResult> {
    if (this._isOpen) {
      return { fullRebuild: false, fullRebuildReason: null }
    }
    try {
      await this.open()
      return { fullRebuild: false, fullRebuildReason: null }
    } catch (error: unknown) {
      if (!isIncompatibleSchemaError(error)) throw error
      await this.store.recreate()
      await this.open()
      return { fullRebuild: true, fullRebuildReason: 'SCHEMA_INCOMPATIBLE' }
    }
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
   * Returns every indexed source file for internal health snapshot comparison.
   * @returns All indexed file nodes.
   */
  async getAllFiles(): Promise<FileNode[]> {
    await this.assertAvailable()
    return this.store.getAllFiles()
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
   * Retrieves an exact batch of files by canonical paths.
   * Validates availability once, then issues one logical batch store operation.
   * @param paths - Canonical file paths to retrieve.
   * @returns Existing files in deterministic requested-path order.
   */
  async getFilesByPaths(paths: readonly string[]): Promise<FileNode[]> {
    await this.assertAvailable()
    return this.store.getFilesByPaths(paths)
  }

  /**
   * Retrieves an exact batch of documents by canonical paths.
   * Validates availability once, then issues one logical batch store operation.
   * @param paths - Canonical document paths to retrieve.
   * @returns Existing documents in deterministic requested-path order.
   */
  async getDocumentsByPaths(paths: readonly string[]): Promise<DocumentNode[]> {
    await this.assertAvailable()
    return this.store.getDocumentsByPaths(paths)
  }

  /**
   * Retrieves an exact batch of symbols by identifiers.
   * Validates availability once, then issues one logical batch store operation.
   * @param symbolIds - Symbol identifiers to retrieve.
   * @returns Existing symbols in deterministic requested-id order.
   */
  async getSymbolsByIds(symbolIds: readonly string[]): Promise<SymbolNode[]> {
    await this.assertAvailable()
    return this.store.getSymbolsByIds(symbolIds)
  }

  /**
   * Retrieves an exact batch of specs by identifiers.
   * Validates availability once, then issues one logical batch store operation.
   * @param specIds - Spec identifiers to retrieve.
   * @returns Existing specs in deterministic requested-id order.
   */
  async getSpecsByIds(specIds: readonly string[]): Promise<SpecNode[]> {
    await this.assertAvailable()
    return this.store.getSpecsByIds(specIds)
  }

  /**
   * Returns every indexed document for internal health snapshot comparison.
   * @returns All indexed document nodes.
   */
  async getAllDocuments(): Promise<DocumentNode[]> {
    await this.assertAvailable()
    return this.store.getAllDocuments()
  }

  /**
   * Returns every indexed spec node.
   * @returns Every indexed spec node.
   */
  async getAllSpecs(): Promise<SpecNode[]> {
    await this.assertAvailable()
    return this.store.getAllSpecs()
  }

  /**
   * Returns every persisted coverage fact for canonical graph health.
   * @returns Deterministically ordered coverage facts.
   */
  async getAllIndexCoverage(): Promise<readonly IndexCoverage[]> {
    await this.assertAvailable()
    return this.store.getAllIndexCoverage()
  }

  /**
   * Returns persisted input evidence for logical resources.
   * @param resources - Logical resource identities.
   * @returns Persisted observations for the requested resources.
   */
  async getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    await this.assertAvailable()
    return this.store.getIndexedInputObservations(resources)
  }

  /**
   * Monotonically marks observations stale using compare-and-set evidence.
   * @param updates - Guarded stale updates.
   */
  async markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void> {
    await this.assertAvailable()
    await this.store.markIndexedInputsStale(updates)
  }

  /**
   * Refreshes filesystem stamps for equal-content observations.
   * @param updates - Equal-content stamp updates.
   */
  async updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    await this.assertAvailable()
    await this.store.updateIndexedInputObservations(updates)
  }

  /**
   * Returns aggregate and workspace monotonic freshness latches.
   * @param workspaces - Workspace names to project.
   * @returns Aggregate and requested workspace freshness latches.
   */
  async getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    await this.assertAvailable()
    return this.store.getFreshnessLatches(workspaces)
  }

  /**
   * Monotonically sets the aggregate and affected workspace stale latches.
   * @param workspaces - Workspace names proven stale.
   */
  async markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void> {
    await this.assertAvailable()
    await this.store.markWorkspacesAndGraphStaleSinceLastIndex(workspaces)
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
   * @throws {InvalidGraphSelectorError} When the selector is empty.
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
   * @throws {InvalidGraphSelectorError} When the selector is empty.
   */
  async resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelectorResult> {
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
   * Returns one provider-owned canonical graph-health snapshot.
   * @returns Canonical graph health.
   */
  async getGraphHealth(): Promise<GetGraphHealthResult> {
    await this.assertAvailable()
    if (this.graphHealth === undefined) {
      const stats = await this.store.getStatistics()
      return {
        ...stats,
        state: FreshnessState.Unknown,
        knownStaleSinceLastIndex: false,
        workspaces: [],
        stale: null,
        currentRef: null,
        fingerprintMismatch: null,
        contentFresh: null,
        coverageComplete: null,
        coverage: {
          total: 0,
          byStatus: {
            indexed: 0,
            excluded: 0,
            unsupported: 0,
            'parse-failed': 0,
            partial: 0,
          },
          reasons: [],
        },
        schemaCompatible: true,
        generationCurrent: true,
        reasonCodes: ['GRAPH_HEALTH_UNAVAILABLE'],
      }
    }
    return this.graphHealth.useCase.execute({
      ...this.graphHealth.input,
      provider: this,
    })
  }

  /**
   * Resolves one structured symbol reference under this provider lifecycle.
   * @param input - Structured reference request.
   * @param health - Optional already-read canonical health snapshot.
   * @returns Conservative symbol-resolution result.
   */
  async resolveSymbolReference(
    input: ResolveSymbolReferenceInput,
    health?: GetGraphHealthResult,
  ): Promise<SymbolResolutionResult> {
    await this.assertAvailable()
    const [normalizedInput] = await this.normalizeResolutionInputs([input])
    if (health !== undefined) {
      return new ResolveSymbolReference(
        this.store,
        () => Promise.resolve(this.toResolutionHealth(health)),
        (resources) => this.assessExactResources(resources),
      ).execute(normalizedInput!)
    }
    return this.resolver.execute(normalizedInput!)
  }

  /**
   * Assesses exact graph resources against their persisted input observations.
   * @param resources - Exact resource identities.
   * @returns Exact tri-state freshness results.
   */
  private async assessExactResources(
    resources: readonly IndexedResourceKey[],
  ): Promise<
    readonly import('../domain/value-objects/indexed-input-freshness.js').IndexedResourceFreshnessResult[]
  > {
    const projectRoot = this.projectRoot ?? this.graphHealth?.input.config.projectRoot
    if (projectRoot === undefined) return []
    const roots = new Map<string, string>()
    for (const resource of resources) roots.set(resource.workspace, projectRoot)
    return new AssessIndexedResourceFreshness(this.store).execute({
      resources,
      workspaceRoots: roots,
    })
  }

  /**
   * Resolves a batch while sharing one graph-health snapshot and prepared queries.
   * @param inputs - Structured reference requests.
   * @param health - Optional already-read canonical health snapshot.
   * @returns Results corresponding to the input order.
   */
  async resolveSymbolReferences(
    inputs: readonly ResolveSymbolReferenceInput[],
    health?: GetGraphHealthResult,
  ): Promise<readonly SymbolResolutionResult[]> {
    await this.assertAvailable()
    const normalizedInputs = await this.normalizeResolutionInputs(inputs)
    if (health !== undefined) {
      return new ResolveSymbolReference(
        this.store,
        () => Promise.resolve(this.toResolutionHealth(health)),
        (resources) => this.assessExactResources(resources),
      ).executeBatch(normalizedInputs)
    }
    return this.resolver.executeBatch(normalizedInputs)
  }

  /**
   * Retrieves one public binding by its complete structured identity.
   * @param selector - Surface, exported name, space, and canonical target identity.
   * @returns The exact binding and target declarations, or null when it is absent.
   */
  async getExactPublicBinding(
    selector: ExactPublicBindingSelector,
  ): Promise<ExactPublicBindingResult | null> {
    await this.assertAvailable()
    const bindings = await this.store.findPublicBindings([
      {
        surface: selector.surface,
        exportedName: selector.exportedName,
        space: selector.space,
      },
    ])
    const binding = bindings.find((candidate) => candidate.targetId === selector.targetId)
    if (binding === undefined) return null

    const declarations = await this.store.findDeclarations([selector.targetId])
    return {
      binding,
      declarations: declarations.map((candidate) => candidate.declaration),
    }
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
   * Analyzes exact public-route impact separately from canonical implementation impact.
   * @param input - Proven public binding and logical target evidence.
   * @param direction - Direction of impact analysis.
   * @param maxDepth - Maximum traversal depth.
   * @returns Exact-binding and canonical impact projections.
   */
  async analyzePublicBindingImpact(
    input: ResolvedPublicBindingImpactInput,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<PublicBindingImpactResult> {
    await this.assertAvailable()
    return analyzePublicBindingImpact(this.store, input, direction, maxDepth)
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
   * Analyzes file import impact using only direct import relations.
   *
   * @param filePath - Target file path
   * @param direction - Traversal direction
   * @param maxDepth - Maximum traversal depth
   * @returns Impact result
   */
  async analyzeFileImportImpact(
    filePath: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth?: number,
  ): Promise<ImpactResult> {
    await this.assertAvailable()
    return analyzeFileImportImpact(this.store, filePath, direction, maxDepth ?? 1)
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
   * Searches symbols grouped by logical identity while retaining declarations and bindings.
   * @param options - Search query and filters.
   * @returns Deterministically grouped reference-aware results.
   */
  async searchReferenceSymbols(
    options: SearchOptions,
  ): Promise<readonly ReferenceAwareSymbolResult[]> {
    await this.assertAvailable()
    return this.referenceSearch.executeSymbols(options)
  }

  /**
   * Executes the authoritative Code Graph-orchestrated multi-category search.
   * @param input - Query, selected categories, filters, limit, and snippet preference.
   * @returns Unified deterministic category projection.
   */
  async search(input: SearchCodeGraphInput): Promise<SearchCodeGraphResult> {
    await this.assertAvailable()
    if (input.filePattern === undefined || hasWildcard(input.filePattern)) {
      return this.referenceSearch.execute(input)
    }
    const resolvedFiles = (await this.resolveFileSelector(input.filePattern)).filter(
      (entry) => entry.kind === 'file',
    )
    if (resolvedFiles.length !== 1) {
      return this.referenceSearch.execute(input)
    }
    return this.referenceSearch.execute({
      ...input,
      filePattern: resolvedFiles[0]!.canonicalPath,
      exactFile: true,
    })
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
    if (process.env['SPECD_GRAPH_INDEX_LOCK_HELD'] === 'true') {
      return fn()
    }
    const release = acquireGraphIndexLockByStoragePath(this.store.storagePath)
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Projects canonical provider health into the resolver's compact gate.
   * @param health - Canonical graph-health result.
   * @returns Resolution freshness and completeness gate.
   */
  private toResolutionHealth(health: GetGraphHealthResult): ResolutionHealth {
    const fresh =
      health.stale === null || health.fingerprintMismatch === null || health.contentFresh === null
        ? null
        : !health.stale && !health.fingerprintMismatch && health.contentFresh
    return {
      fresh,
      complete: health.coverageComplete,
      reasonCodes: health.reasonCodes,
    }
  }

  /**
   * Resolves project-relative file selectors into the canonical workspace paths
   * consumed by reference and coverage queries.
   * @param inputs - Raw structured resolution requests.
   * @returns Requests with canonical file paths and owning workspaces when unambiguous.
   */
  private async normalizeResolutionInputs(
    inputs: readonly ResolveSymbolReferenceInput[],
  ): Promise<readonly ResolveSymbolReferenceInput[]> {
    const selectorResults = new Map<string, Promise<ResolvedFileSelector[]>>()
    return Promise.all(
      inputs.map(async (input) => {
        if (input.filePath === undefined) return input
        let matches = selectorResults.get(input.filePath)
        if (matches === undefined) {
          matches = resolveFileSelector(input.filePath, {
            store: this.store,
            ...(this.projectRoot !== undefined ? { projectRoot: this.projectRoot } : {}),
          })
          selectorResults.set(input.filePath, matches)
        }
        const resolved = await matches
        const workspaceMatch = resolved.filter((entry) => entry.workspace === input.workspace)
        const selected =
          workspaceMatch.length === 1
            ? workspaceMatch[0]
            : resolved.length === 1
              ? resolved[0]
              : undefined
        if (selected === undefined) return input
        return {
          ...input,
          workspace: selected.workspace,
          filePath: selected.canonicalPath,
        }
      }),
    )
  }
}

/**
 * Identifies backend schema incompatibility without coupling composition to concrete stores.
 * @param error - Store-open failure.
 * @returns Whether indexing may repair the failure by recreating derived storage.
 */
function isIncompatibleSchemaError(error: unknown): boolean {
  return (
    error instanceof Error && /schema .* incompatible|incompatible .* schema/i.test(error.message)
  )
}

/**
 * Detects whether a search file selector is a pattern rather than an exact path.
 * @param value - Raw search selector.
 * @returns Whether wildcard semantics must be preserved.
 */
function hasWildcard(value: string): boolean {
  return value.includes('*') || value.includes('?') || value.includes('[')
}
