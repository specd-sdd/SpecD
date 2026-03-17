export { type FileNode, createFileNode } from './file-node.js'
export { type SymbolNode, createSymbolNode } from './symbol-node.js'
export { type SpecNode, createSpecNode } from './spec-node.js'
export { type Relation, createRelation } from './relation.js'
export { SymbolKind, isSymbolKind } from './symbol-kind.js'
export { RelationType, isRelationType } from './relation-type.js'
export { type SymbolQuery } from './symbol-query.js'
export { type GraphStatistics } from './graph-statistics.js'
export { type TraversalOptions } from './traversal-options.js'
export { type TraversalResult } from './traversal-result.js'
export { type ImpactResult, type FileImpactResult, type AffectedSymbol } from './impact-result.js'
export { type RiskLevel, computeRiskLevel } from './risk-level.js'
export { type ChangeDetectionResult } from './change-detection-result.js'
export {
  type IndexOptions,
  type IndexProgressCallback,
  type WorkspaceIndexTarget,
  type DiscoveredSpec,
} from './index-options.js'
export { type IndexResult, type IndexError, type WorkspaceIndexBreakdown } from './index-result.js'
export { type LanguageAdapter } from './language-adapter.js'
export { type ImportDeclaration } from './import-declaration.js'
