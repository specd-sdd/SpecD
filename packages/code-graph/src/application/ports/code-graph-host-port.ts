import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type IndexOptions } from '../../domain/value-objects/index-options.js'
import { type IndexResult } from '../../domain/value-objects/index-result.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import {
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../domain/value-objects/indexed-input-freshness.js'
import { type IndexCoverage } from '../../domain/value-objects/index-session.js'

/**
 * Host-facing graph provider surface for application use cases.
 *
 * Implemented by `CodeGraphProvider` in composition.
 */
export interface CodeGraphHostPort {
  getStatistics(): Promise<GraphStatistics>
  getAllFiles?(): Promise<FileNode[]>
  getAllDocuments?(): Promise<DocumentNode[]>
  getAllSpecs?(): Promise<SpecNode[]>
  getAllIndexCoverage?(): Promise<readonly IndexCoverage[]>
  getIndexedInputObservations?(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]>
  markIndexedInputsStale?(updates: readonly MarkIndexedInputStaleInput[]): Promise<void>
  updateIndexedInputObservations?(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void>
  getFreshnessLatches?(workspaces: readonly string[]): Promise<FreshnessLatches>
  markWorkspacesAndGraphStaleSinceLastIndex?(workspaces: readonly string[]): Promise<void>
  index(options: IndexOptions): Promise<IndexResult>
  getSpec(specId: string): Promise<SpecNode | undefined>
  getCoveredFiles(specId: string): Promise<Relation[]>
  getCoveredSymbols(specId: string): Promise<Relation[]>
}
