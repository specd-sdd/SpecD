import {
  GraphStore,
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
  type StorageGenerationSnapshot,
} from '../../src/domain/ports/graph-store.js'
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
import { expandSearchQuery } from '../../src/domain/services/expand-search-query.js'
import { expandSymbolName } from '../../src/domain/services/expand-symbol-name.js'
import { matchesExclude } from '../../src/domain/services/matches-exclude.js'
import {
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../src/domain/value-objects/symbol-reference.js'
import { type IndexCoverage } from '../../src/domain/value-objects/index-session.js'
import {
  type SourceContentCandidatePage,
  type SourceContentCandidateQuery,
} from '../../src/domain/value-objects/source-search.js'
import {
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../src/domain/value-objects/indexed-input-freshness.js'

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

function compareRelations(left: Relation, right: Relation): number {
  return (
    left.source.localeCompare(right.source) ||
    left.type.localeCompare(right.type) ||
    left.target.localeCompare(right.target)
  )
}

function resourceKey(resource: IndexedResourceKey): string {
  return JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId])
}

function observationKey(
  observation: Pick<
    IndexedInputObservation,
    'workspace' | 'resourceKind' | 'resourceId' | 'inputKind' | 'inputLocator'
  >,
): string {
  return JSON.stringify([
    observation.workspace,
    observation.resourceKind,
    observation.resourceId,
    observation.inputKind,
    observation.inputLocator,
  ])
}

function matchesExpectedObservation(
  observation: IndexedInputObservation,
  update: MarkIndexedInputStaleInput,
): boolean {
  return (
    observation.indexedContentHash === update.expectedIndexedContentHash &&
    observation.generation === update.expectedGeneration &&
    observation.lastObservedRevision === update.expectedRevision
  )
}

export class InMemoryGraphStore extends GraphStore {
  private _isOpen = false
  private _generation = 0
  private files = new Map<string, FileNode>()
  private documents = new Map<string, DocumentNode>()
  private symbols = new Map<string, SymbolNode>()
  private specs = new Map<string, SpecNode>()
  private relations: Relation[] = []
  private logicalSymbols = new Map<string, LogicalSymbol>()
  private declarationsByLogicalSymbol = new Map<string, LogicalDeclaration[]>()
  private publicBindings = new Map<string, PublicBinding>()
  private localBindings = new Map<string, LocalBinding>()
  private resolutionStepsBySource = new Map<string, ResolutionStep[]>()
  private coverageByFilePath = new Map<string, IndexCoverage>()
  private indexedInputObservations = new Map<string, IndexedInputObservation>()
  private freshnessLatches = new Map<string, boolean>()
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
    observations?: readonly IndexedInputObservation[]
    indexedWorkspaces?: readonly string[]
    clearGraphStaleLatch?: boolean
    rebuildSearchIndexes?: boolean
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
    if (data.observations !== undefined) {
      for (const workspace of new Set(data.indexedWorkspaces ?? [])) {
        for (const [key, observation] of this.indexedInputObservations) {
          if (observation.workspace === workspace) this.indexedInputObservations.delete(key)
        }
        this.freshnessLatches.set(workspace, false)
      }
      if (data.clearGraphStaleLatch === true) this.freshnessLatches.set('__graph__', false)
      for (const observation of data.observations) {
        this.indexedInputObservations.set(observationKey(observation), observation)
      }
    }
  }

  async getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    this.ensureOpen()
    const keys = new Set(resources.map(resourceKey))
    return [...this.indexedInputObservations.values()]
      .filter((observation) => keys.has(resourceKey(observation)))
      .sort((left, right) => observationKey(left).localeCompare(observationKey(right)))
  }

  async markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void> {
    this.ensureOpen()
    for (const update of updates) {
      const key = observationKey(update)
      const current = this.indexedInputObservations.get(key)
      if (current === undefined || !matchesExpectedObservation(current, update)) continue
      this.indexedInputObservations.set(key, { ...current, stale: true })
    }
  }

  async updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    this.ensureOpen()
    for (const update of updates) {
      const key = observationKey(update)
      const current = this.indexedInputObservations.get(key)
      if (current === undefined || current.stale || !matchesExpectedObservation(current, update)) {
        continue
      }
      this.indexedInputObservations.set(key, {
        ...current,
        lastObservedMtime: update.lastObservedMtime,
        lastObservedSize: update.lastObservedSize,
      })
    }
  }

  async getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    this.ensureOpen()
    return {
      graph: this.freshnessLatches.get('__graph__') ?? false,
      workspaces: Object.fromEntries(
        workspaces.map((workspace) => [workspace, this.freshnessLatches.get(workspace) ?? false]),
      ),
    }
  }

  async markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void> {
    this.ensureOpen()
    this.freshnessLatches.set('__graph__', true)
    for (const workspace of new Set(workspaces)) this.freshnessLatches.set(workspace, true)
  }

  async replaceReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    this.ensureOpen()

    const logicalSymbols = new Map(facts.logicalSymbols.map((symbol) => [symbol.id, symbol]))
    const declarationsByLogicalSymbol = new Map<string, LogicalDeclaration[]>()
    for (const declaration of facts.declarations) {
      const existing = declarationsByLogicalSymbol.get(declaration.logicalSymbolId) ?? []
      existing.push(declaration)
      declarationsByLogicalSymbol.set(declaration.logicalSymbolId, existing)
    }
    const resolutionStepsBySource = new Map<string, ResolutionStep[]>()
    for (const step of facts.steps) {
      const existing = resolutionStepsBySource.get(step.fromId) ?? []
      existing.push(step)
      resolutionStepsBySource.set(step.fromId, existing)
    }

    this.logicalSymbols = logicalSymbols
    this.declarationsByLogicalSymbol = declarationsByLogicalSymbol
    this.publicBindings = new Map(facts.publicBindings.map((binding) => [binding.id, binding]))
    this.localBindings = new Map(facts.localBindings.map((binding) => [binding.id, binding]))
    this.resolutionStepsBySource = resolutionStepsBySource
    this.coverageByFilePath = new Map(
      facts.coverage.map((coverage) => [coverage.filePath, coverage]),
    )
  }

  async getAllReferenceFacts(): Promise<ReferenceFactsWrite> {
    this.ensureOpen()
    return {
      logicalSymbols: [...this.logicalSymbols.values()].sort(compareLogicalSymbols),
      declarations: [...this.declarationsByLogicalSymbol.values()]
        .flat()
        .sort(compareLogicalDeclarations),
      publicBindings: [...this.publicBindings.values()].sort(comparePublicBindings),
      localBindings: [...this.localBindings.values()].sort(compareLocalBindings),
      steps: [...this.resolutionStepsBySource.values()].flat().sort(compareResolutionSteps),
      coverage: await this.getAllIndexCoverage(),
    }
  }

  async findLogicalSymbols(lookups: readonly LogicalSymbolLookup[]): Promise<LogicalSymbol[]> {
    this.ensureOpen()
    return [...this.logicalSymbols.values()]
      .filter((symbol) => lookups.some((lookup) => matchesLogicalSymbolLookup(symbol, lookup)))
      .sort(compareLogicalSymbols)
  }

  async findLogicalSymbolsByIds(ids: readonly string[]): Promise<LogicalSymbol[]> {
    this.ensureOpen()
    return [...new Set(ids)]
      .map((id) => this.logicalSymbols.get(id))
      .filter((symbol): symbol is LogicalSymbol => symbol !== undefined)
      .sort(compareLogicalSymbols)
  }

  async findDeclarations(logicalSymbolIds: readonly string[]): Promise<LogicalDeclaration[]> {
    this.ensureOpen()
    const results: LogicalDeclaration[] = []
    for (const logicalSymbolId of new Set(logicalSymbolIds)) {
      results.push(...(this.declarationsByLogicalSymbol.get(logicalSymbolId) ?? []))
    }
    return results.sort(compareLogicalDeclarations)
  }

  async findPublicBindings(lookups: readonly PublicBindingLookup[]): Promise<PublicBinding[]> {
    this.ensureOpen()
    return [...this.publicBindings.values()]
      .filter((binding) => lookups.some((lookup) => matchesPublicBindingLookup(binding, lookup)))
      .sort(comparePublicBindings)
  }

  async findPublicBindingsByExportedNames(
    exportedNames: readonly string[],
  ): Promise<PublicBinding[]> {
    this.ensureOpen()
    const names = new Set(exportedNames)
    return [...this.publicBindings.values()]
      .filter((binding) => names.has(binding.exportedName))
      .sort(comparePublicBindings)
  }

  async findLocalBindings(lookups: readonly LocalBindingLookup[]): Promise<LocalBinding[]> {
    this.ensureOpen()
    return [...this.localBindings.values()]
      .filter((binding) => lookups.some((lookup) => matchesLocalBindingLookup(binding, lookup)))
      .sort(compareLocalBindings)
  }

  async findResolutionSteps(fromIds: readonly string[]): Promise<ResolutionStep[]> {
    this.ensureOpen()
    const results: ResolutionStep[] = []
    for (const fromId of new Set(fromIds)) {
      results.push(...(this.resolutionStepsBySource.get(fromId) ?? []))
    }
    return results.sort(compareResolutionSteps)
  }

  async findIndexCoverage(filePaths: readonly string[]): Promise<IndexCoverage[]> {
    this.ensureOpen()
    return [...new Set(filePaths)]
      .map((filePath) => this.coverageByFilePath.get(filePath))
      .filter((coverage): coverage is IndexCoverage => coverage !== undefined)
      .sort((left, right) => left.filePath.localeCompare(right.filePath))
  }

  async getAllIndexCoverage(): Promise<IndexCoverage[]> {
    this.ensureOpen()
    return [...this.coverageByFilePath.values()].sort((left, right) =>
      left.filePath.localeCompare(right.filePath),
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

  async getSymbolsByIds(symbolIds: readonly string[]): Promise<SymbolNode[]> {
    this.ensureOpen()
    const results: SymbolNode[] = []
    for (const symbolId of new Set(symbolIds)) {
      const symbol = this.symbols.get(symbolId)
      if (symbol !== undefined) results.push(symbol)
    }
    return results
  }

  async getIncomingSymbolRelations(
    symbolIds: readonly string[],
    relationTypes: readonly RelationType[],
  ): Promise<Relation[]> {
    this.ensureOpen()
    if (symbolIds.length === 0 || relationTypes.length === 0) return []
    const targets = new Set(symbolIds)
    const types = new Set(relationTypes)
    return this.relations
      .filter((relation) => targets.has(relation.target) && types.has(relation.type))
      .sort(compareRelations)
  }

  async getOutgoingSymbolRelations(
    symbolIds: readonly string[],
    relationTypes: readonly RelationType[],
  ): Promise<Relation[]> {
    this.ensureOpen()
    if (symbolIds.length === 0 || relationTypes.length === 0) return []
    const sources = new Set(symbolIds)
    const types = new Set(relationTypes)
    return this.relations
      .filter((relation) => sources.has(relation.source) && types.has(relation.type))
      .sort(compareRelations)
  }

  async getSpec(specId: string): Promise<SpecNode | undefined> {
    this.ensureOpen()
    return this.specs.get(specId)
  }

  async getFilesByPaths(paths: readonly string[]): Promise<FileNode[]> {
    this.ensureOpen()
    const results: FileNode[] = []
    for (const path of new Set(paths)) {
      const file = this.files.get(path)
      if (file !== undefined) results.push(file)
    }
    return results
  }

  async getDocumentsByPaths(paths: readonly string[]): Promise<DocumentNode[]> {
    this.ensureOpen()
    const results: DocumentNode[] = []
    for (const path of new Set(paths)) {
      const document = this.documents.get(path)
      if (document !== undefined) results.push(document)
    }
    return results
  }

  async getSpecsByIds(specIds: readonly string[]): Promise<SpecNode[]> {
    this.ensureOpen()
    const results: SpecNode[] = []
    for (const specId of new Set(specIds)) {
      const spec = this.specs.get(specId)
      if (spec !== undefined) results.push(spec)
    }
    return results
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

  async findDirectlyAffectedFiles(filePaths: readonly string[]): Promise<string[]> {
    this.ensureOpen()
    const targets = new Set(filePaths)
    const targetSymbolIds = new Set(
      [...this.symbols.values()]
        .filter((symbol) => targets.has(symbol.filePath))
        .map((symbol) => symbol.id),
    )
    const affected = new Set<string>()
    for (const relation of this.relations) {
      if (relation.type === RelationType.Imports && targets.has(relation.target)) {
        affected.add(relation.source)
        continue
      }
      if (!targetSymbolIds.has(relation.target)) continue
      const source = this.symbols.get(relation.source)
      if (source !== undefined) affected.add(source.filePath)
    }
    return [...affected].sort()
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

  async getCoveringSpecsForFile(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.CoversFile, filePath)
  }

  async getCoveringSpecsForFiles(filePaths: readonly string[]): Promise<Relation[]> {
    this.ensureOpen()
    if (filePaths.length === 0) return []
    const targets = new Set(filePaths)
    return this.relations
      .filter(
        (relation) => relation.type === RelationType.CoversFile && targets.has(relation.target),
      )
      .sort(compareRelations)
  }

  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsBySource(RelationType.CoversSymbol, specId)
  }

  async getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    return this.getRelationsByTarget(RelationType.CoversSymbol, symbolId)
  }

  async getCoveringSpecsForSymbols(symbolIds: readonly string[]): Promise<Relation[]> {
    this.ensureOpen()
    if (symbolIds.length === 0) return []
    const targets = new Set(symbolIds)
    return this.relations
      .filter(
        (relation) => relation.type === RelationType.CoversSymbol && targets.has(relation.target),
      )
      .sort(compareRelations)
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

    if (query.workspace !== undefined) {
      const prefix = query.workspace + ':'
      results = results.filter((s) => s.filePath.startsWith(prefix))
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

  async searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const query = expandSearchQuery(options.query)
    const results: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const sym of this.symbols.values()) {
      const text = `${expandSymbolName(sym.name)} ${sym.comment ?? ''}`.toLowerCase()
      const contentScore = countContentTokenHits(text, query.expandedTokens)
      if (contentScore === 0) continue
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
      const ranking = rankIdentityMatch({
        normalizedQuery: query.normalizedQuery,
        rawTokens: query.rawTokens,
        expandedTokens: query.expandedTokens,
        canonicalIdentity: sym.id,
        alternateIdentity: sym.name,
        contentScore,
      })
      const score = composeRankingScore(ranking)
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
    const query = expandSearchQuery(options.query)
    const results: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const spec of this.specs.values()) {
      const text = `${spec.specId} ${spec.title} ${spec.description} ${spec.content}`.toLowerCase()
      const contentScore = countContentTokenHits(text, query.expandedTokens)
      if (contentScore === 0) continue
      if (options.workspace && spec.workspace !== options.workspace) continue
      if (matchesExclude(spec.path, options.excludePaths, options.excludeWorkspaces)) continue
      if (options.excludeWorkspaces && options.excludeWorkspaces.includes(spec.workspace)) continue
      const ranking = rankIdentityMatch({
        normalizedQuery: query.normalizedQuery,
        rawTokens: query.rawTokens,
        expandedTokens: query.expandedTokens,
        canonicalIdentity: spec.specId,
        contentScore,
      })
      const score = composeRankingScore(ranking)
      results.push({ spec, score, snippet: '', startLine: 1, endLine: 1 })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20)
  }

  async searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const query = expandSearchQuery(options.query)
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
      const contentScore = countContentTokenHits(text, query.expandedTokens)
      if (contentScore === 0) continue
      if (options.workspace && document.workspace !== options.workspace) continue
      if (matchesExclude(document.path, options.excludePaths, options.excludeWorkspaces)) continue
      if (options.excludeWorkspaces && options.excludeWorkspaces.includes(document.workspace)) {
        continue
      }
      const ranking = rankIdentityMatch({
        normalizedQuery: query.normalizedQuery,
        rawTokens: query.rawTokens,
        expandedTokens: query.expandedTokens,
        canonicalIdentity: document.path,
        alternateIdentity: document.configRelativePath,
        contentScore,
      })
      const score = composeRankingScore(ranking)
      results.push({ document, score, snippet: '', startLine: 1, endLine: 1 })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20)
  }

  async searchSourceContentCandidates(
    query: SourceContentCandidateQuery,
  ): Promise<SourceContentCandidatePage> {
    this.ensureOpen()
    const terms = [...new Set([query.normalizedQuery, ...query.rawTerms, ...query.expandedTerms])]
      .filter((term) => term.length > 0)
      .map((term) => term.toLowerCase())
    const pathPattern =
      query.filePattern === undefined
        ? undefined
        : new RegExp(
            '^' + query.filePattern.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
            'i',
          )
    const ranked = [...this.files.values()]
      .filter((file) => file.content !== undefined)
      .filter((file) => query.workspace === undefined || file.workspace === query.workspace)
      .filter((file) => pathPattern === undefined || pathPattern.test(file.path))
      .filter((file) => !matchesExclude(file.path, query.excludePaths, query.excludeWorkspaces))
      .flatMap((file) => {
        const content = file.content!.toLowerCase()
        const hits = terms.reduce(
          (total, term) => total + (content.includes(term) ? Math.max(1, term.length) : 0),
          0,
        )
        return hits === 0 ? [] : [{ file, backendScore: hits }]
      })
      .sort(
        (left, right) =>
          right.backendScore - left.backendScore || left.file.path.localeCompare(right.file.path),
      )
    const offset = Number.parseInt(query.cursor ?? '0', 10)
    const start = Number.isFinite(offset) && offset >= 0 ? offset : 0
    const candidates = ranked.slice(start, start + query.limit)
    const nextOffset = start + candidates.length
    return {
      candidates,
      ...(nextOffset < ranked.length ? { nextCursor: String(nextOffset) } : {}),
    }
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
    this.logicalSymbols.clear()
    this.declarationsByLogicalSymbol.clear()
    this.publicBindings.clear()
    this.localBindings.clear()
    this.resolutionStepsBySource.clear()
    this.coverageByFilePath.clear()
    this.indexedInputObservations.clear()
    this.freshnessLatches.clear()
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
    this.logicalSymbols.clear()
    this.declarationsByLogicalSymbol.clear()
    this.publicBindings.clear()
    this.localBindings.clear()
    this.resolutionStepsBySource.clear()
    this.coverageByFilePath.clear()
    this.indexedInputObservations.clear()
    this.freshnessLatches.clear()
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
    this._generation += 1
  }

  async getStorageGeneration(): Promise<StorageGenerationSnapshot> {
    this.ensureOpen()
    return {
      token: `memory-${String(this._generation)}`,
      mtimeMs: this._generation,
    }
  }
}

interface IdentityRankingInput {
  readonly normalizedQuery: string
  readonly rawTokens: readonly string[]
  readonly expandedTokens: readonly string[]
  readonly canonicalIdentity: string
  readonly alternateIdentity?: string
  readonly contentScore: number
}

interface IdentityRanking {
  readonly tier: number
  readonly tokenHits: number
  readonly matchStrength: number
  readonly contentScore: number
}

function composeRankingScore(ranking: IdentityRanking): number {
  return (
    ranking.tier * 1_000_000 +
    ranking.tokenHits * 10_000 +
    ranking.matchStrength * 100 +
    ranking.contentScore
  )
}

function rankIdentityMatch(input: IdentityRankingInput): IdentityRanking {
  const canonical = input.canonicalIdentity.toLowerCase()
  const alternate = input.alternateIdentity?.toLowerCase()

  let tier = 1
  if (canonical === input.normalizedQuery) {
    tier = 5
  } else if (alternate === input.normalizedQuery) {
    tier = 4
  } else if (
    input.rawTokens.length === 1 &&
    (canonical.startsWith(input.normalizedQuery) ||
      alternate?.startsWith(input.normalizedQuery) === true)
  ) {
    tier = 3
  }

  let tokenHits = 0
  let matchStrength = 0
  for (const token of input.expandedTokens) {
    const tokenStrength = Math.max(
      strongestTokenMatch(token, canonical),
      alternate === undefined ? 0 : strongestTokenMatch(token, alternate),
    )
    if (tokenStrength > 0) {
      tokenHits++
      matchStrength += tokenStrength
      if (tier < 2) {
        tier = 2
      }
    }
  }

  return {
    tier,
    tokenHits,
    matchStrength,
    contentScore: input.contentScore,
  }
}

function strongestTokenMatch(token: string, identity: string): number {
  if (identity === token) {
    return 40
  }
  if (identity.startsWith(token)) {
    return 30
  }
  if (identity.endsWith(token)) {
    return 20
  }

  const components = splitIdentityComponents(identity)
  if (components.includes(token)) {
    return 15
  }

  if (identity.includes(token)) {
    return 10
  }

  return 0
}

function splitIdentityComponents(identity: string): string[] {
  return identity
    .split(/[:/_.-]+/)
    .map((component) => component.trim())
    .filter((component) => component.length > 0)
}

function countContentTokenHits(text: string, tokens: readonly string[]): number {
  let hits = 0
  for (const token of tokens) {
    if (text.includes(token)) {
      hits++
    }
  }
  return hits
}

function matchesLogicalSymbolLookup(symbol: LogicalSymbol, lookup: LogicalSymbolLookup): boolean {
  return (
    symbol.workspace === lookup.workspace &&
    symbol.name === lookup.name &&
    (lookup.surface === undefined || symbol.surface === lookup.surface) &&
    (lookup.space === undefined || symbol.space === lookup.space) &&
    (lookup.ownerId === undefined || symbol.ownerId === lookup.ownerId) &&
    (lookup.memberForm === undefined || symbol.memberForm === lookup.memberForm)
  )
}

function matchesPublicBindingLookup(binding: PublicBinding, lookup: PublicBindingLookup): boolean {
  return (
    binding.surface === lookup.surface &&
    binding.exportedName === lookup.exportedName &&
    (lookup.space === undefined || binding.space === lookup.space)
  )
}

function matchesLocalBindingLookup(binding: LocalBinding, lookup: LocalBindingLookup): boolean {
  return (
    binding.filePath === lookup.filePath &&
    binding.localName === lookup.localName &&
    (lookup.scopeId === undefined || binding.scopeId === lookup.scopeId) &&
    (lookup.space === undefined || binding.space === lookup.space)
  )
}

function compareLogicalSymbols(left: LogicalSymbol, right: LogicalSymbol): number {
  return compareStrings(
    [
      left.workspace,
      left.surface,
      left.ownerId ?? '',
      left.space,
      left.name,
      left.memberForm ?? '',
      left.id,
    ],
    [
      right.workspace,
      right.surface,
      right.ownerId ?? '',
      right.space,
      right.name,
      right.memberForm ?? '',
      right.id,
    ],
  )
}

function compareLogicalDeclarations(left: LogicalDeclaration, right: LogicalDeclaration): number {
  return compareStrings(
    [
      left.logicalSymbolId,
      left.declaration.location.filePath,
      String(left.declaration.location.line),
      String(left.declaration.location.column),
      left.declaration.symbolId,
    ],
    [
      right.logicalSymbolId,
      right.declaration.location.filePath,
      String(right.declaration.location.line),
      String(right.declaration.location.column),
      right.declaration.symbolId,
    ],
  )
}

function comparePublicBindings(left: PublicBinding, right: PublicBinding): number {
  return compareStrings(
    [left.surface, left.exportedName, left.space, left.targetId ?? '', left.id],
    [right.surface, right.exportedName, right.space, right.targetId ?? '', right.id],
  )
}

function compareLocalBindings(left: LocalBinding, right: LocalBinding): number {
  return compareStrings(
    [left.filePath, left.scopeId, left.localName, left.space, left.targetId ?? '', left.id],
    [right.filePath, right.scopeId, right.localName, right.space, right.targetId ?? '', right.id],
  )
}

function compareResolutionSteps(left: ResolutionStep, right: ResolutionStep): number {
  return compareStrings([left.fromId, left.toId, left.kind], [right.fromId, right.toId, right.kind])
}

function compareStrings(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!)
    if (comparison !== 0) return comparison
  }
  return 0
}
