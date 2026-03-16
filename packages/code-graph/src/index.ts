// Composition
export {
  createCodeGraphProvider,
  type CodeGraphOptions,
} from './composition/create-code-graph-provider.js'
export { CodeGraphProvider } from './composition/code-graph-provider.js'

// Value objects
export { type FileNode } from './domain/value-objects/file-node.js'
export { type SymbolNode } from './domain/value-objects/symbol-node.js'
export { type SpecNode } from './domain/value-objects/spec-node.js'
export { type Relation } from './domain/value-objects/relation.js'
export { SymbolKind } from './domain/value-objects/symbol-kind.js'
export { RelationType } from './domain/value-objects/relation-type.js'
export { type SymbolQuery } from './domain/value-objects/symbol-query.js'
export { type GraphStatistics } from './domain/value-objects/graph-statistics.js'
export { type LanguageAdapter } from './domain/value-objects/language-adapter.js'

// Indexer types
export {
  type IndexOptions,
  type IndexProgressCallback,
  type WorkspaceIndexTarget,
  type DiscoveredSpec,
} from './domain/value-objects/index-options.js'
export {
  type IndexResult,
  type IndexError,
  type WorkspaceIndexBreakdown,
} from './domain/value-objects/index-result.js'

// Traversal types
export { type TraversalOptions } from './domain/value-objects/traversal-options.js'
export { type TraversalResult } from './domain/value-objects/traversal-result.js'
export { type ImpactResult, type FileImpactResult } from './domain/value-objects/impact-result.js'
export { type ChangeDetectionResult } from './domain/value-objects/change-detection-result.js'
export { type RiskLevel } from './domain/value-objects/risk-level.js'
export {
  type HotspotEntry,
  type HotspotOptions,
  type HotspotResult,
} from './domain/value-objects/hotspot-result.js'

// Search
export { type SearchOptions } from './domain/value-objects/search-options.js'

// Domain services
export { expandSymbolName } from './domain/services/expand-symbol-name.js'

// Spec discovery
export { discoverSpecsFromDir } from './application/use-cases/discover-specs.js'

// Errors
export { CodeGraphError } from './domain/errors/code-graph-error.js'
export { InvalidSymbolKindError } from './domain/errors/invalid-symbol-kind-error.js'
export { InvalidRelationTypeError } from './domain/errors/invalid-relation-type-error.js'
export { DuplicateSymbolIdError } from './domain/errors/duplicate-symbol-id-error.js'
export { StoreNotOpenError } from './domain/errors/store-not-open-error.js'
