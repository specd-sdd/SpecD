import { parentPort } from 'node:worker_threads'
import { SQLiteGraphDatabase } from './sqlite-graph-database.js'
import {
  type BulkIndexPayload,
  type OpenWorkerPayload,
  type SerializedErrorPayload,
  type SQLiteWorkerProgressEvent,
  type SQLiteWorkerRequest,
  type SQLiteWorkerResponse,
} from './sqlite-worker-protocol.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { type SourceContentCandidateQuery } from '../../domain/value-objects/source-search.js'
import { SpecNotFoundError } from '../../domain/errors/spec-not-found-error.js'
import {
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../domain/value-objects/indexed-input-freshness.js'
import {
  type LocalBindingLookup,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
} from '../../domain/ports/graph-store.js'

/**
 * Serializes an error or thrown value into a transferable structured error payload.
 *
 * @param error - The caught error or thrown value.
 * @returns Serialized error payload with error name, message, stack, and codes.
 */
export function serializeError(error: unknown): SerializedErrorPayload {
  if (error instanceof Error) {
    const err = error as Error & { code?: string; sqliteCode?: string }
    const details: Record<string, unknown> = {}
    if (error instanceof SpecNotFoundError && typeof error.specId === 'string') {
      details.specId = error.specId
    }
    return {
      name: err.name || 'Error',
      message: err.message,
      stack: err.stack,
      code: typeof err.code === 'string' ? err.code : undefined,
      sqliteCode: typeof err.sqliteCode === 'string' ? err.sqliteCode : undefined,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

/**
 *
 */
interface WorkerBulkSession {
  files: FileNode[]
  documents: DocumentNode[]
  symbols: SymbolNode[]
  specs: SpecNode[]
  relations: Relation[]
  facts?: ReferenceFactsWrite | undefined
  observations: IndexedInputObservation[]
  removals: string[]
  removedDocumentPaths: string[]
  removedSpecIds: string[]
}

const bulkSessions = new Map<string, WorkerBulkSession>()

/**
 * Gets the staged bulk index session for a given session id, creating an empty one if missing.
 *
 * @param sessionId - Unique identifier of the bulk index session.
 * @returns The staged bulk session accumulator for the given id.
 */
function getOrCreateBulkSession(sessionId: string): WorkerBulkSession {
  let session = bulkSessions.get(sessionId)
  if (!session) {
    session = {
      files: [],
      documents: [],
      symbols: [],
      specs: [],
      relations: [],
      observations: [],
      removals: [],
      removedDocumentPaths: [],
      removedSpecIds: [],
    }
    bulkSessions.set(sessionId, session)
  }
  return session
}

/**
 * Dispatches and handles an incoming SQLite worker request on the given database instance.
 *
 * @param database - The synchronous SQLiteGraphDatabase instance owned by the worker.
 * @param message - The worker request message received from the host.
 * @param postMessage - The callback to post the response back to the parent thread.
 * @returns Promise resolving when the message has been dispatched and response sent.
 */
export async function handleMessage(
  database: SQLiteGraphDatabase,
  message: SQLiteWorkerRequest,
  postMessage: (response: SQLiteWorkerResponse) => void,
): Promise<void> {
  const { id, op, payload } = message
  try {
    let result: unknown = undefined
    switch (op) {
      case 'open': {
        const p = payload as OpenWorkerPayload
        await database.open(p.storagePath, p.runtime)
        break
      }
      case 'close': {
        bulkSessions.clear()
        database.close()
        break
      }
      case 'recreate': {
        bulkSessions.clear()
        await database.recreate()
        break
      }
      case 'clear': {
        bulkSessions.clear()
        database.clear()
        break
      }
      case 'getFile': {
        const p = payload as { filePath: string }
        result = database.getFile(p.filePath)
        break
      }
      case 'findFilesByConfigRelativePath': {
        const p = payload as { configRelativePath: string }
        result = database.findFilesByConfigRelativePath(p.configRelativePath)
        break
      }
      case 'getDocument': {
        const p = payload as { documentId: string }
        result = database.getDocument(p.documentId)
        break
      }
      case 'findDocumentsByConfigRelativePath': {
        const p = payload as { configRelativePath: string }
        result = database.findDocumentsByConfigRelativePath(p.configRelativePath)
        break
      }
      case 'getSymbol': {
        const p = payload as { symbolId: string }
        result = database.getSymbol(p.symbolId)
        break
      }
      case 'findSymbols': {
        const p = payload as { query: SymbolQuery }
        result = database.findSymbols(p.query)
        break
      }
      case 'getSpec': {
        const p = payload as { specId: string }
        result = database.getSpec(p.specId)
        break
      }
      case 'getSpecDependencies': {
        const p = payload as { specId: string }
        result = database.getSpecDependencies(p.specId)
        break
      }
      case 'getSpecDependents': {
        const p = payload as { specId: string }
        result = database.getSpecDependents(p.specId)
        break
      }
      case 'getCoveredFiles': {
        const p = payload as { specId: string }
        result = database.getCoveredFiles(p.specId)
        break
      }
      case 'getCoveringSpecsForFile': {
        const p = payload as { filePath: string }
        result = database.getCoveringSpecsForFile(p.filePath)
        break
      }
      case 'getCoveringSpecsForFiles': {
        const p = payload as { filePaths: readonly string[] }
        result = database.getCoveringSpecsForFiles(p.filePaths)
        break
      }
      case 'getCoveredSymbols': {
        const p = payload as { specId: string }
        result = database.getCoveredSymbols(p.specId)
        break
      }
      case 'getCoveringSpecsForSymbol': {
        const p = payload as { symbolId: string }
        result = database.getCoveringSpecsForSymbol(p.symbolId)
        break
      }
      case 'getCoveringSpecsForSymbols': {
        const p = payload as { symbolIds: readonly string[] }
        result = database.getCoveringSpecsForSymbols(p.symbolIds)
        break
      }
      case 'getCallers': {
        const p = payload as { symbolId: string }
        result = database.getCallers(p.symbolId)
        break
      }
      case 'getCallees': {
        const p = payload as { symbolId: string }
        result = database.getCallees(p.symbolId)
        break
      }
      case 'getImporters': {
        const p = payload as { filePath: string }
        result = database.getImporters(p.filePath)
        break
      }
      case 'getImportees': {
        const p = payload as { filePath: string }
        result = database.getImportees(p.filePath)
        break
      }
      case 'findDirectlyAffectedFiles': {
        const p = payload as { filePaths: readonly string[] }
        result = database.findDirectlyAffectedFiles(p.filePaths)
        break
      }
      case 'getExtenders': {
        const p = payload as { symbolId: string }
        result = database.getExtenders(p.symbolId)
        break
      }
      case 'getExtendedTargets': {
        const p = payload as { symbolId: string }
        result = database.getExtendedTargets(p.symbolId)
        break
      }
      case 'getImplementors': {
        const p = payload as { symbolId: string }
        result = database.getImplementors(p.symbolId)
        break
      }
      case 'getImplementedTargets': {
        const p = payload as { symbolId: string }
        result = database.getImplementedTargets(p.symbolId)
        break
      }
      case 'getOverriders': {
        const p = payload as { symbolId: string }
        result = database.getOverriders(p.symbolId)
        break
      }
      case 'getOverriddenTargets': {
        const p = payload as { symbolId: string }
        result = database.getOverriddenTargets(p.symbolId)
        break
      }
      case 'getExportedSymbols': {
        const p = payload as { filePath: string }
        result = database.getExportedSymbols(p.filePath)
        break
      }
      case 'getSymbolCallers': {
        result = database.getSymbolCallers()
        break
      }
      case 'getFileImporterCounts': {
        result = database.getFileImporterCounts()
        break
      }
      case 'getAllFiles': {
        result = database.getAllFiles()
        break
      }
      case 'getAllDocuments': {
        result = database.getAllDocuments()
        break
      }
      case 'getAllSpecs': {
        result = database.getAllSpecs()
        break
      }
      case 'getAllReferenceFacts': {
        result = database.getAllReferenceFacts()
        break
      }
      case 'findLogicalSymbolsByIds': {
        const p = payload as { ids: readonly string[] }
        result = database.findLogicalSymbolsByIds(p.ids)
        break
      }
      case 'findDeclarations': {
        const p = payload as { logicalSymbolIds: readonly string[] }
        result = database.findDeclarations(p.logicalSymbolIds)
        break
      }
      case 'findPublicBindingsByExportedNames': {
        const p = payload as { exportedNames: readonly string[] }
        result = database.findPublicBindingsByExportedNames(p.exportedNames)
        break
      }
      case 'getStatistics': {
        result = database.getStatistics()
        break
      }
      case 'searchSymbols': {
        const p = payload as { query: string; options: SearchOptions }
        result = database.searchSymbols(p.query, p.options)
        break
      }
      case 'searchSpecs': {
        const p = payload as { query: string; options: SearchOptions }
        result = database.searchSpecs(p.query, p.options)
        break
      }
      case 'searchDocuments': {
        const p = payload as { query: string; options: SearchOptions }
        result = database.searchDocuments(p.query, p.options)
        break
      }
      case 'searchSourceCandidates': {
        const p = payload as { query: SourceContentCandidateQuery }
        result = database.searchSourceCandidates(p.query)
        break
      }
      case 'upsertFile': {
        const p = payload as {
          file: FileNode
          symbols: SymbolNode[]
          relations: Relation[]
          referenceFacts?: ReferenceFactsWrite | undefined
        }
        database.upsertFile(p.file, p.symbols, p.relations, p.referenceFacts)
        break
      }
      case 'removeFile': {
        const p = payload as { filePath: string }
        database.removeFile(p.filePath)
        break
      }
      case 'upsertDocument': {
        const p = payload as { document: DocumentNode }
        database.upsertDocument(p.document)
        break
      }
      case 'removeDocument': {
        const p = payload as { documentPath: string }
        database.removeDocument(p.documentPath)
        break
      }
      case 'upsertSpec': {
        const p = payload as { spec: SpecNode; relations: Relation[] }
        database.upsertSpec(p.spec, p.relations)
        break
      }
      case 'removeSpec': {
        const p = payload as { specId: string }
        database.removeSpec(p.specId)
        break
      }
      case 'removeSpecs': {
        const p = payload as { specIds: readonly string[] }
        database.removeSpecs(p.specIds)
        break
      }
      case 'addRelations': {
        const p = payload as { relations: Relation[] }
        database.addRelations(p.relations)
        break
      }
      case 'readStorageGenerationSnapshot': {
        result = database.readStorageGenerationSnapshot()
        break
      }
      case 'rotateStorageGeneration': {
        const p = payload as { expectedGeneration: string }
        result = database.rotateStorageGeneration(p.expectedGeneration)
        break
      }
      case 'getIndexedInputObservations': {
        const p = payload as { resources: readonly IndexedResourceKey[] }
        result = database.getIndexedInputObservations(p.resources)
        break
      }
      case 'markIndexedInputsStale': {
        const p = payload as { updates: readonly MarkIndexedInputStaleInput[] }
        database.markIndexedInputsStale(p.updates)
        break
      }
      case 'updateIndexedInputObservation': {
        const p = payload as { updates: readonly UpdateIndexedInputObservationInput[] }
        database.updateIndexedInputObservation(p.updates)
        break
      }
      case 'readFreshnessLatches': {
        const p = payload as { workspaces: readonly string[] }
        result = database.readFreshnessLatches(p.workspaces)
        break
      }
      case 'markWorkspacesAndGraphStaleSinceLastIndex': {
        const p = payload as { workspaces: readonly string[] }
        database.markWorkspacesAndGraphStaleSinceLastIndex(p.workspaces)
        break
      }
      case 'replaceReferenceFacts': {
        const p = payload as { facts: ReferenceFactsWrite }
        database.replaceReferenceFacts(p.facts)
        break
      }
      case 'findLogicalSymbols': {
        const p = payload as { lookups: readonly LogicalSymbolLookup[] }
        result = database.findLogicalSymbols(p.lookups)
        break
      }
      case 'findLogicalDeclarations': {
        const p = payload as { logicalSymbolIds: readonly string[] }
        result = database.findLogicalDeclarations(p.logicalSymbolIds)
        break
      }
      case 'findPublicBindings': {
        const p = payload as { lookups: readonly PublicBindingLookup[] }
        result = database.findPublicBindings(p.lookups)
        break
      }
      case 'findLocalBindings': {
        const p = payload as { lookups: readonly LocalBindingLookup[] }
        result = database.findLocalBindings(p.lookups)
        break
      }
      case 'findResolutionSteps': {
        const p = payload as { fromIds: readonly string[] }
        result = database.findResolutionSteps(p.fromIds)
        break
      }
      case 'findIndexCoverage': {
        const p = payload as { filePaths: readonly string[] }
        result = database.findIndexCoverage(p.filePaths)
        break
      }
      case 'getAllIndexCoverage': {
        result = database.getAllIndexCoverage()
        break
      }
      case 'rebuildFtsIndexes': {
        database.rebuildFtsIndexes()
        break
      }
      case 'beginBulkIndexSession': {
        const p = payload as { sessionId: string }
        getOrCreateBulkSession(p.sessionId)
        break
      }
      case 'stageBulkFiles': {
        const p = payload as { sessionId: string; files: FileNode[] }
        getOrCreateBulkSession(p.sessionId).files.push(...p.files)
        break
      }
      case 'stageBulkDocuments': {
        const p = payload as { sessionId: string; documents: DocumentNode[] }
        getOrCreateBulkSession(p.sessionId).documents.push(...p.documents)
        break
      }
      case 'stageBulkSymbols': {
        const p = payload as { sessionId: string; symbols: SymbolNode[] }
        getOrCreateBulkSession(p.sessionId).symbols.push(...p.symbols)
        break
      }
      case 'stageBulkSpecs': {
        const p = payload as { sessionId: string; specs: SpecNode[] }
        getOrCreateBulkSession(p.sessionId).specs.push(...p.specs)
        break
      }
      case 'stageBulkRelations': {
        const p = payload as { sessionId: string; relations: Relation[] }
        getOrCreateBulkSession(p.sessionId).relations.push(...p.relations)
        break
      }
      case 'stageBulkReferenceFacts': {
        const p = payload as { sessionId: string; facts: ReferenceFactsWrite }
        const sess = getOrCreateBulkSession(p.sessionId)
        sess.facts = p.facts
        break
      }
      case 'stageBulkObservations': {
        const p = payload as { sessionId: string; observations: IndexedInputObservation[] }
        getOrCreateBulkSession(p.sessionId).observations.push(...p.observations)
        break
      }
      case 'stageBulkRemovals': {
        const p = payload as {
          sessionId: string
          filePaths?: string[]
          documentPaths?: string[]
          specIds?: string[]
        }
        const session = getOrCreateBulkSession(p.sessionId)
        if (p.filePaths?.length) session.removals.push(...p.filePaths)
        if (p.documentPaths?.length) session.removedDocumentPaths.push(...p.documentPaths)
        if (p.specIds?.length) session.removedSpecIds.push(...p.specIds)
        break
      }
      case 'commitBulkIndex': {
        let bulkPayload: BulkIndexPayload
        const p = payload as
          | { sessionId: string; metadata?: Record<string, unknown> }
          | BulkIndexPayload

        if ('sessionId' in p && typeof p.sessionId === 'string') {
          const session = bulkSessions.get(p.sessionId)
          if (!session) {
            throw new Error(`Bulk index session "${p.sessionId}" not found or expired`)
          }
          bulkPayload = {
            files: session.files,
            documents: session.documents,
            symbols: session.symbols,
            specs: session.specs,
            relations: session.relations,
            referenceFacts: session.facts,
            observations: session.observations,
            removedFilePaths: session.removals,
            removedDocumentPaths: session.removedDocumentPaths,
            removedSpecIds: session.removedSpecIds,
            ...(p.metadata || {}),
          }
          try {
            database.commitBulkIndex(bulkPayload, (stage: string) => {
              const progressEvent: SQLiteWorkerProgressEvent = {
                id,
                type: 'progress',
                stage,
              }
              postMessage(progressEvent)
            })
          } finally {
            bulkSessions.delete(p.sessionId)
          }
        } else {
          bulkPayload = p as BulkIndexPayload
          database.commitBulkIndex(bulkPayload, (stage: string) => {
            const progressEvent: SQLiteWorkerProgressEvent = {
              id,
              type: 'progress',
              stage,
            }
            postMessage(progressEvent)
          })
        }
        break
      }
      case 'rollbackBulkIndexSession': {
        const p = payload as { sessionId: string }
        bulkSessions.delete(p.sessionId)
        break
      }
      default: {
        throw new Error(`Unknown SQLite worker operation: ${String(op)}`)
      }
    }

    postMessage({
      id,
      type: 'result',
      result,
    })
  } catch (error) {
    postMessage({
      id,
      type: 'error',
      error: serializeError(error),
    })
  }
}

// If executing inside a real Worker thread
if (parentPort !== null) {
  const database = new SQLiteGraphDatabase()
  let dispatchQueue: Promise<void> = Promise.resolve()

  parentPort.on('message', (message: SQLiteWorkerRequest) => {
    dispatchQueue = dispatchQueue
      .then(() =>
        handleMessage(database, message, (response) => {
          parentPort?.postMessage(response)
        }),
      )
      .catch((error) => {
        parentPort?.postMessage({
          id: message.id,
          type: 'error',
          error: serializeError(error),
        })
      })
  })
}
