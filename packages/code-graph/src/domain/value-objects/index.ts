export { type FileNode, createFileNode, type FileCategory, FILE_CATEGORIES } from './file-node.js'
export { type DocumentNode, createDocumentNode } from './document-node.js'
export { type SymbolNode, createSymbolNode } from './symbol-node.js'
export { type SpecNode, createSpecNode } from './spec-node.js'
export { type Relation, createRelation } from './relation.js'
export { SymbolKind, isSymbolKind } from './symbol-kind.js'
export { RelationType, isRelationType } from './relation-type.js'
export { type SymbolQuery } from './symbol-query.js'
export { type GraphStatistics } from './graph-statistics.js'
export { type TraversalOptions } from './traversal-options.js'
export { type TraversalResult } from './traversal-result.js'
export {
  IMPACT_RESULT_TYPES,
  type ImpactResultType,
  type ImpactResultFilter,
  type ImpactResult,
  type FileImpactResult,
  type AffectedSymbol,
  type OmittedCounts,
} from './impact-result.js'
export { type RiskLevel, computeRiskLevel } from './risk-level.js'
export { type ChangeDetectionResult } from './change-detection-result.js'
export {
  type IndexOptions,
  type IndexProgressCallback,
  type ProjectGraphConfig,
} from './index-options.js'
export {
  type IndexResult,
  type IndexError,
  type WorkspaceIndexBreakdown,
  type IndexPhaseMetric,
  type IndexPhaseMetrics,
  type IndexCoverageDiagnosticReason,
  type IndexCoverageDiagnostic,
  type IndexRunCoverageSummary,
  type ImportDiagnosticSummary,
  IMPORT_DIAGNOSTIC_SAMPLE_LIMIT,
  SIZE_SKIP_LIST_LIMIT,
  WORKSPACE_OVERLAP_LIST_LIMIT,
  type WorkspaceOverlap,
} from './index-result.js'
export {
  type ParserResourceDisposer,
  type ParserResourceDisposalFailure,
  type ParserResourceCloseResult,
  type ParserResourceScope,
} from './parser-resource-scope.js'
export {
  type FileActivityEvent,
  type FileSkippedEvent,
  type ResourceDisposalFailedEvent,
  type IndexEvent,
  type IndexEventReceiver,
  type SizeSkippedFile,
  type SizeExemptFile,
} from './index-event.js'
export {
  type GraphIndexFailureCause,
  type GraphIndexWorkerDiagnostics,
  type GraphIndexWorkerEvent,
  type GraphIndexTaskAnnouncer,
} from './graph-index-worker-types.js'
export {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type ImportResolutionContext,
  type RelationBuildContext,
  type ResolvedImports,
} from './language-adapter.js'
export {
  type PackageWorkspace,
  type PackagePreparationContext,
  type PackageEntryRequest,
  type PackageEntry,
  type PackageResolutionFacet,
  type RelativeImportResolutionFacet,
  type QualifiedNameResolutionFacet,
  type SymbolReferenceSyntaxFacet,
  type ReExportLinkContext,
  type ReExportLinkResult,
  type ReExportLinkingFacet,
  type ImportUnresolvedReason,
  type ImportDiagnostic,
  type PackageEntryResolution,
  type PackageExportRequest,
  type PackageExportResolution,
} from './language-adapter-facets.js'

export { type ImportDeclaration } from './import-declaration.js'
export { ImportDeclarationKind } from './import-declaration-kind.js'
export { type SourceLocation } from './source-location.js'
export {
  BindingScopeKind,
  BindingSourceKind,
  type BindingScope,
  type BindingFact,
} from './binding-fact.js'
export { CallForm, type CallFact, type ResolvedDependency } from './call-fact.js'
export {
  QualifiedReferenceKind,
  type QualifiedReferenceFact,
  qualifiedReferenceKey,
} from './qualified-reference-fact.js'
export {
  type FileAnalysisDraft,
  type FileAnalysis,
  type ParserState,
  type AdapterSessionState,
} from './file-analysis.js'
export {
  type IndexSession,
  type RegisterFileInput,
  type RegisterAnalysisInput,
} from './index-session.js'
