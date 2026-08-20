import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type RelationType } from '../../domain/value-objects/relation-type.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
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
import {
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import { type IndexCoverage } from '../../domain/value-objects/index-session.js'
import {
  type IndexWriteSessionMetadata,
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
  type StorageGenerationSnapshot,
} from '../../domain/ports/graph-store.js'
import { type SqliteRuntimeDescriptor } from './sqlite-runtime-descriptor.js'

/**
 * Payload sent for opening SQLite worker and database.
 */
export interface OpenWorkerPayload {
  /** Root path where database is located. */
  readonly storagePath: string
  /** Optional SQLite runtime descriptor. */
  readonly runtime?: SqliteRuntimeDescriptor | undefined
}

/**
 * Payload sent for atomic bulk index commit.
 */
export interface BulkIndexPayload {
  /** File nodes to persist. */
  readonly files: readonly FileNode[]
  /** Optional document nodes to persist. */
  readonly documents?: readonly DocumentNode[] | undefined
  /** Symbol nodes to persist. */
  readonly symbols: readonly SymbolNode[]
  /** Spec nodes to persist. */
  readonly specs: readonly SpecNode[]
  /** Relations to persist. */
  readonly relations: readonly Relation[]
  /** Optional file paths to remove. */
  readonly removedFilePaths?: readonly string[] | undefined
  /** Optional document paths to remove. */
  readonly removedDocumentPaths?: readonly string[] | undefined
  /** Optional spec IDs to remove. */
  readonly removedSpecIds?: readonly string[] | undefined
  /** Optional reference facts write payload. */
  readonly referenceFacts?: ReferenceFactsWrite | undefined
  /** Optional observations to persist. */
  readonly observations?: readonly IndexedInputObservation[] | undefined
  /** Optional VCS ref identifier. */
  readonly vcsRef?: string | undefined
  /** Optional graph content fingerprint. */
  readonly graphFingerprint?: string | undefined
  /** Optional indexed workspace names. */
  readonly indexedWorkspaces?: readonly string[] | undefined
  /** Whether to clear graph stale latch. */
  readonly clearGraphStaleLatch?: boolean | undefined
  /** Whether to replace code graph state. */
  readonly replaceCodeGraph?: boolean | undefined
  /** Whether to rebuild search indexes. */
  readonly rebuildSearchIndexes?: boolean | undefined
}

/**
 * Comprehensive mapping of operation names to their payload and return types.
 */
export interface SQLiteWorkerOperationMap {
  /** Opens SQLite worker database. */
  open: { payload: OpenWorkerPayload; result: void }
  /** Closes SQLite worker database. */
  close: { payload: Record<string, never>; result: void }
  /** Recreates database schema destructively. */
  recreate: { payload: Record<string, never>; result: void }
  /** Clears all data while retaining tables. */
  clear: { payload: Record<string, never>; result: void }
  /** Retrieves a file node. */
  getFile: { payload: { filePath: string }; result: FileNode | undefined }
  /** Finds files by config relative path. */
  findFilesByConfigRelativePath: { payload: { configRelativePath: string }; result: FileNode[] }
  /** Retrieves a document node. */
  getDocument: { payload: { documentId: string }; result: DocumentNode | undefined }
  /** Finds documents by config relative path. */
  findDocumentsByConfigRelativePath: {
    payload: { configRelativePath: string }
    result: DocumentNode[]
  }
  /** Retrieves a symbol node. */
  getSymbol: { payload: { symbolId: string }; result: SymbolNode | undefined }
  /** Retrieves a logical batch of symbol nodes. */
  getSymbolsByIds: { payload: { symbolIds: readonly string[] }; result: SymbolNode[] }
  /** Retrieves traversal relations targeting a logical symbol batch. */
  getIncomingSymbolRelations: {
    payload: { symbolIds: readonly string[]; relationTypes: readonly RelationType[] }
    result: Relation[]
  }
  /** Retrieves traversal relations originating from a logical symbol batch. */
  getOutgoingSymbolRelations: {
    payload: { symbolIds: readonly string[]; relationTypes: readonly RelationType[] }
    result: Relation[]
  }
  /** Finds symbols matching query. */
  findSymbols: { payload: { query: SymbolQuery }; result: SymbolNode[] }
  /** Retrieves a spec node. */
  getSpec: { payload: { specId: string }; result: SpecNode | undefined }
  /** Retrieves spec dependencies. */
  getSpecDependencies: { payload: { specId: string }; result: Relation[] }
  /** Retrieves spec dependents. */
  getSpecDependents: { payload: { specId: string }; result: Relation[] }
  /** Retrieves files covered by spec. */
  getCoveredFiles: { payload: { specId: string }; result: Relation[] }
  /** Retrieves specs covering file. */
  getCoveringSpecsForFile: { payload: { filePath: string }; result: Relation[] }
  /** Retrieves specs covering any file in list. */
  getCoveringSpecsForFiles: { payload: { filePaths: readonly string[] }; result: Relation[] }
  /** Retrieves symbols covered by spec. */
  getCoveredSymbols: { payload: { specId: string }; result: Relation[] }
  /** Retrieves specs covering symbol. */
  getCoveringSpecsForSymbol: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves specs covering any symbol in list. */
  getCoveringSpecsForSymbols: { payload: { symbolIds: readonly string[] }; result: Relation[] }
  /** Retrieves callers of symbol. */
  getCallers: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves callees of symbol. */
  getCallees: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves importers of file. */
  getImporters: { payload: { filePath: string }; result: Relation[] }
  /** Retrieves importees of file. */
  getImportees: { payload: { filePath: string }; result: Relation[] }
  /** Finds files directly affected by changes. */
  findDirectlyAffectedFiles: { payload: { filePaths: readonly string[] }; result: string[] }
  /** Retrieves extenders of symbol. */
  getExtenders: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves extended targets of symbol. */
  getExtendedTargets: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves implementors of symbol. */
  getImplementors: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves implemented targets of symbol. */
  getImplementedTargets: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves overriders of symbol. */
  getOverriders: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves overridden targets of symbol. */
  getOverriddenTargets: { payload: { symbolId: string }; result: Relation[] }
  /** Retrieves exported symbols from file. */
  getExportedSymbols: { payload: { filePath: string }; result: SymbolNode[] }
  /** Retrieves all symbol callers. */
  getSymbolCallers: {
    payload: Record<string, never>
    result: Array<{ symbol: SymbolNode; callerFilePath: string }>
  }
  /** Retrieves importer counts per file. */
  getFileImporterCounts: { payload: Record<string, never>; result: Map<string, number> }
  /** Retrieves all file nodes. */
  getAllFiles: { payload: Record<string, never>; result: FileNode[] }
  /** Retrieves all document nodes. */
  getAllDocuments: { payload: Record<string, never>; result: DocumentNode[] }
  /** Retrieves all spec nodes. */
  getAllSpecs: { payload: Record<string, never>; result: SpecNode[] }
  /** Retrieves all reference facts. */
  getAllReferenceFacts: { payload: Record<string, never>; result: ReferenceFactsWrite }
  /** Finds logical symbols by ids. */
  findLogicalSymbolsByIds: { payload: { ids: readonly string[] }; result: LogicalSymbol[] }
  /** Finds declarations for logical symbols. */
  findDeclarations: {
    payload: { logicalSymbolIds: readonly string[] }
    result: LogicalDeclaration[]
  }
  /** Finds public bindings by exported names. */
  findPublicBindingsByExportedNames: {
    payload: { exportedNames: readonly string[] }
    result: PublicBinding[]
  }
  /** Retrieves graph statistics. */
  getStatistics: { payload: Record<string, never>; result: GraphStatistics }
  /** Searches symbols using FTS. */
  searchSymbols: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  /** Searches specs using FTS. */
  searchSpecs: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  /** Searches documents using FTS. */
  searchDocuments: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  /** Searches source code candidates. */
  searchSourceCandidates: {
    payload: { query: SourceContentCandidateQuery }
    result: SourceContentCandidatePage
  }
  /** Upserts a file node. */
  upsertFile: {
    payload: {
      file: FileNode
      symbols: SymbolNode[]
      relations: Relation[]
      referenceFacts?: ReferenceFactsWrite | undefined
    }
    result: void
  }
  /** Removes a file. */
  removeFile: { payload: { filePath: string }; result: void }
  /** Upserts a document node. */
  upsertDocument: { payload: { document: DocumentNode }; result: void }
  /** Removes a document. */
  removeDocument: { payload: { documentPath: string }; result: void }
  /** Upserts a spec node. */
  upsertSpec: { payload: { spec: SpecNode; relations: Relation[] }; result: void }
  /** Removes a spec node. */
  removeSpec: { payload: { specId: string }; result: void }
  /** Removes multiple spec nodes. */
  removeSpecs: { payload: { specIds: readonly string[] }; result: void }
  /** Adds relations to graph. */
  addRelations: { payload: { relations: Relation[] }; result: void }
  /** Reads storage generation snapshot. */
  readStorageGenerationSnapshot: {
    payload: Record<string, never>
    result: StorageGenerationSnapshot
  }
  /** Rotates storage generation snapshot. */
  rotateStorageGeneration: {
    payload: { expectedGeneration: string }
    result: StorageGenerationSnapshot
  }
  /** Retrieves indexed input observations. */
  getIndexedInputObservations: {
    payload: { resources: readonly IndexedResourceKey[] }
    result: readonly IndexedInputObservation[]
  }
  /** Marks indexed inputs stale. */
  markIndexedInputsStale: {
    payload: { updates: readonly MarkIndexedInputStaleInput[] }
    result: void
  }
  /** Updates indexed input observation. */
  updateIndexedInputObservation: {
    payload: { updates: readonly UpdateIndexedInputObservationInput[] }
    result: void
  }
  /** Reads freshness latches. */
  readFreshnessLatches: { payload: { workspaces: readonly string[] }; result: FreshnessLatches }
  /** Marks workspaces and graph stale since last index. */
  markWorkspacesAndGraphStaleSinceLastIndex: {
    payload: { workspaces: readonly string[] }
    result: void
  }
  /** Replaces semantic reference facts. */
  replaceReferenceFacts: { payload: { facts: ReferenceFactsWrite }; result: void }
  /** Finds logical symbols matching lookups. */
  findLogicalSymbols: {
    payload: { lookups: readonly LogicalSymbolLookup[] }
    result: LogicalSymbol[]
  }
  /** Finds logical declarations. */
  findLogicalDeclarations: {
    payload: { logicalSymbolIds: readonly string[] }
    result: LogicalDeclaration[]
  }
  /** Finds public bindings matching lookups. */
  findPublicBindings: {
    payload: { lookups: readonly PublicBindingLookup[] }
    result: PublicBinding[]
  }
  /** Finds local bindings matching lookups. */
  findLocalBindings: { payload: { lookups: readonly LocalBindingLookup[] }; result: LocalBinding[] }
  /** Finds resolution steps. */
  findResolutionSteps: { payload: { fromIds: readonly string[] }; result: ResolutionStep[] }
  /** Finds index coverage for specific file paths. */
  findIndexCoverage: { payload: { filePaths: readonly string[] }; result: IndexCoverage[] }
  /** Retrieves all index coverage records across all files. */
  getAllIndexCoverage: { payload: Record<string, never>; result: IndexCoverage[] }
  /** Rebuilds FTS indexes. */
  rebuildFtsIndexes: { payload: Record<string, never>; result: void }
  /** Begins a new worker-side bulk index staging session. */
  beginBulkIndexSession: { payload: { sessionId: string }; result: void }
  /** Stages bulk file nodes into active session. */
  stageBulkFiles: { payload: { sessionId: string; files: FileNode[] }; result: void }
  /** Stages bulk document nodes into active session. */
  stageBulkDocuments: { payload: { sessionId: string; documents: DocumentNode[] }; result: void }
  /** Stages bulk symbol nodes into active session. */
  stageBulkSymbols: { payload: { sessionId: string; symbols: SymbolNode[] }; result: void }
  /** Stages bulk spec nodes into active session. */
  stageBulkSpecs: { payload: { sessionId: string; specs: SpecNode[] }; result: void }
  /** Stages bulk relations into active session. */
  stageBulkRelations: { payload: { sessionId: string; relations: Relation[] }; result: void }
  /** Stages bulk reference facts into active session. */
  stageBulkReferenceFacts: {
    payload: { sessionId: string; facts: ReferenceFactsWrite }
    result: void
  }
  /** Stages bulk observations into active session. */
  stageBulkObservations: {
    payload: { sessionId: string; observations: IndexedInputObservation[] }
    result: void
  }
  /** Stages bulk file removals into active session. */
  stageBulkRemovals: {
    payload: {
      sessionId: string
      filePaths?: string[]
      documentPaths?: string[]
      specIds?: string[]
    }
    result: void
  }
  /** Commits a worker-side bulk index session by session ID. */
  commitBulkIndex: {
    payload: { sessionId: string; metadata?: SerializableIndexWriteSessionMetadata | undefined }
    result: void
  }
  /** Rollbacks and releases a worker-side bulk index staging session. */
  rollbackBulkIndexSession: { payload: { sessionId: string }; result: void }
}

/**
 * Metadata that can be transferred across the worker boundary. Functions such
 * as `onProgress` are not structured-clone serializable and SHALL NOT appear in
 * RPC payload types.
 */
export type SerializableIndexWriteSessionMetadata = Omit<IndexWriteSessionMetadata, 'onProgress'>

/**
 * Discriminator operations supported by the SQLite worker thread.
 */
export type SQLiteWorkerOperation = keyof SQLiteWorkerOperationMap

/**
 * Strongly-typed request structure sent from host client to SQLite worker.
 */
export interface SQLiteWorkerRequest<K extends SQLiteWorkerOperation = SQLiteWorkerOperation> {
  /** Monotonic request identifier. */
  readonly id: number
  /** Operation discriminator key. */
  readonly op: K
  /** Strongly-typed payload matching operation. */
  readonly payload: SQLiteWorkerOperationMap[K]['payload']
}

/**
 * Successful response message from SQLite worker to host client.
 */
export interface SQLiteWorkerSuccessResponse<TResult = unknown> {
  /** Correlation identifier matching request. */
  readonly id: number
  /** Result discriminator. */
  readonly type: 'result'
  /** Typed result value. */
  readonly result: TResult
}

/**
 * Serialized error payload transferred across worker boundary.
 */
export interface SerializedErrorPayload {
  /** Machine-readable error code if present. */
  readonly code?: string | undefined
  /** Name of error class. */
  readonly name: string
  /** Error message. */
  readonly message: string
  /** Optional stack trace. */
  readonly stack?: string | undefined
  /** SQLite-specific error code if present. */
  readonly sqliteCode?: string | undefined
  /** Domain error specific structured details payload. */
  readonly details?: Record<string, unknown> | undefined
}

/**
 * Error response message from SQLite worker to host client.
 */
export interface SQLiteWorkerErrorResponse {
  /** Correlation identifier matching request. */
  readonly id: number
  /** Error discriminator. */
  readonly type: 'error'
  /** Serialized error payload. */
  readonly error: SerializedErrorPayload
}

/**
 * Progress event message emitted by SQLite worker during long-running atomic operations.
 */
export interface SQLiteWorkerProgressEvent {
  /** Correlation identifier matching request. */
  readonly id: number
  /** Progress discriminator. */
  readonly type: 'progress'
  /** Current execution stage label. */
  readonly stage: string
}

/**
 * All message types that can be received from the SQLite worker.
 */
export type SQLiteWorkerResponse =
  | SQLiteWorkerSuccessResponse
  | SQLiteWorkerErrorResponse
  | SQLiteWorkerProgressEvent
