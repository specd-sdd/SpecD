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
import {
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
    return {
      name: err.name || 'Error',
      message: err.message,
      stack: err.stack,
      code: typeof err.code === 'string' ? err.code : undefined,
      sqliteCode: typeof err.sqliteCode === 'string' ? err.sqliteCode : undefined,
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
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
        database.close()
        break
      }
      case 'recreate': {
        await database.recreate()
        break
      }
      case 'clear': {
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
      case 'commitBulkIndex': {
        const bulkPayload = payload as BulkIndexPayload
        database.commitBulkIndex(bulkPayload, (stage: string) => {
          const progressEvent: SQLiteWorkerProgressEvent = {
            id,
            type: 'progress',
            stage,
          }
          postMessage(progressEvent)
        })
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
