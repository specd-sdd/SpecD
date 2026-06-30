import { type SpecdConfig } from '@specd/core'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type IndexOptions } from '../../domain/value-objects/index-options.js'
import { type IndexResult } from '../../domain/value-objects/index-result.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'

/**
 * Host-facing graph provider surface for application use cases.
 *
 * Implemented by `CodeGraphProvider` in composition.
 */
export interface CodeGraphHostPort {
  assertGraphIndexUnlocked(config: SpecdConfig): void
  getStatistics(): Promise<GraphStatistics>
  recreate(): Promise<void>
  index(options: IndexOptions): Promise<IndexResult>
  getSpec(specId: string): Promise<SpecNode | undefined>
  getCoveredFiles(specId: string): Promise<Relation[]>
  getCoveredSymbols(specId: string): Promise<Relation[]>
}
