import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type IndexedInputObservation } from '../../domain/value-objects/indexed-input-freshness.js'
import { type ReferenceFactsWrite } from '../../domain/ports/graph-store.js'
import { type SqliteRuntimeDescriptor } from './sqlite-runtime-descriptor.js'

/**
 * Discriminator operations supported by the SQLite worker thread.
 */
export type SQLiteWorkerOperation =
  | 'open'
  | 'close'
  | 'recreate'
  | 'clear'
  | 'getFile'
  | 'findFilesByConfigRelativePath'
  | 'getDocument'
  | 'findDocumentsByConfigRelativePath'
  | 'getSymbol'
  | 'findSymbols'
  | 'getSpec'
  | 'getSpecDependencies'
  | 'getSpecDependents'
  | 'getCoveredFiles'
  | 'getCoveringSpecsForFile'
  | 'getCoveringSpecsForFiles'
  | 'getCoveredSymbols'
  | 'getCoveringSpecsForSymbol'
  | 'getCoveringSpecsForSymbols'
  | 'getCallers'
  | 'getCallees'
  | 'getImporters'
  | 'getImportees'
  | 'findDirectlyAffectedFiles'
  | 'getExtenders'
  | 'getExtendedTargets'
  | 'getImplementors'
  | 'getImplementedTargets'
  | 'getOverriders'
  | 'getOverriddenTargets'
  | 'getExportedSymbols'
  | 'getSymbolCallers'
  | 'getFileImporterCounts'
  | 'getAllFiles'
  | 'getAllDocuments'
  | 'getAllSpecs'
  | 'getAllReferenceFacts'
  | 'findLogicalSymbolsByIds'
  | 'findDeclarations'
  | 'findPublicBindingsByExportedNames'
  | 'getStatistics'
  | 'searchSymbols'
  | 'searchSpecs'
  | 'searchDocuments'
  | 'searchSourceCandidates'
  | 'upsertFile'
  | 'removeFile'
  | 'upsertDocument'
  | 'removeDocument'
  | 'upsertSpec'
  | 'removeSpec'
  | 'removeSpecs'
  | 'addRelations'
  | 'readStorageGenerationSnapshot'
  | 'rotateStorageGeneration'
  | 'getIndexedInputObservations'
  | 'markIndexedInputsStale'
  | 'updateIndexedInputObservation'
  | 'readFreshnessLatches'
  | 'markWorkspacesAndGraphStaleSinceLastIndex'
  | 'replaceReferenceFacts'
  | 'findLogicalSymbols'
  | 'findLogicalDeclarations'
  | 'findPublicBindings'
  | 'findLocalBindings'
  | 'findResolutionSteps'
  | 'findIndexCoverage'
  | 'rebuildFtsIndexes'
  | 'commitBulkIndex'

/**
 * Payload sent for opening SQLite worker and database.
 */
export interface OpenWorkerPayload {
  readonly storagePath: string
  readonly runtime?: SqliteRuntimeDescriptor | undefined
}

/**
 * Payload sent for atomic bulk index commit.
 */
export interface BulkIndexPayload {
  readonly files: readonly FileNode[]
  readonly documents?: readonly DocumentNode[] | undefined
  readonly symbols: readonly SymbolNode[]
  readonly specs: readonly SpecNode[]
  readonly relations: readonly Relation[]
  readonly removedFilePaths?: readonly string[] | undefined
  readonly removedDocumentPaths?: readonly string[] | undefined
  readonly removedSpecIds?: readonly string[] | undefined
  readonly referenceFacts?: ReferenceFactsWrite | undefined
  readonly observations?: readonly IndexedInputObservation[] | undefined
  readonly vcsRef?: string | undefined
  readonly graphFingerprint?: string | undefined
  readonly indexedWorkspaces?: readonly string[] | undefined
  readonly clearGraphStaleLatch?: boolean | undefined
  readonly replaceCodeGraph?: boolean | undefined
  readonly rebuildSearchIndexes?: boolean | undefined
}

/**
 * Generic request structure sent from host client to SQLite worker.
 */
export interface SQLiteWorkerRequest<TPayload = unknown> {
  readonly id: number
  readonly op: SQLiteWorkerOperation
  readonly payload: TPayload
}

/**
 * Successful response message from SQLite worker to host client.
 */
export interface SQLiteWorkerSuccessResponse<TResult = unknown> {
  readonly id: number
  readonly type: 'result'
  readonly result: TResult
}

/**
 * Serialized error payload transferred across worker boundary.
 */
export interface SerializedErrorPayload {
  readonly code?: string | undefined
  readonly name: string
  readonly message: string
  readonly stack?: string | undefined
  readonly sqliteCode?: string | undefined
}

/**
 * Error response message from SQLite worker to host client.
 */
export interface SQLiteWorkerErrorResponse {
  readonly id: number
  readonly type: 'error'
  readonly error: SerializedErrorPayload
}

/**
 * Progress event message emitted by SQLite worker during long-running atomic operations.
 */
export interface SQLiteWorkerProgressEvent {
  readonly id: number
  readonly type: 'progress'
  readonly stage: string
}

/**
 * All message types that can be received from the SQLite worker.
 */
export type SQLiteWorkerResponse =
  | SQLiteWorkerSuccessResponse
  | SQLiteWorkerErrorResponse
  | SQLiteWorkerProgressEvent
