import { createRequire } from 'node:module'

export {
  createSdkContext,
  openSpecdHost,
  withOpenGraphProvider,
  createSuggestImplementationLinks,
  createSuggestSpecDependencies,
  createSuggestSpecs,
  openSuggestSpecs,
  resolveSuggestImplementationLinksDeps,
  resolveSuggestSpecDependenciesDeps,
  resolveSuggestSpecsDeps,
  type OpenSpecdHostInput,
  type OpenSpecdHostResult,
  type SdkHostContext,
  type WithOpenGraphProviderOptions,
} from './composition/index.js'

export {
  buildImplementationReview,
  buildProjectStatusSnapshot,
  runIndexProjectGraph,
  type BuildImplementationReviewInput,
  type BuildImplementationReviewResult,
  type BuildProjectStatusSnapshotOptions,
  type BuildProjectStatusSnapshotResult,
  type ReviewedImplementationLink,
  type ReviewedImplementationSymbol,
  type RunIndexProjectGraphInput,
  type RunIndexProjectGraphResult,
  type ImplementationSuggestionCacheHeader,
  type ImplementationSuggestionSpecStamp,
  type ImplementationSuggestionLockData,
  type ImplementationSuggestionEntry,
  type ImplementationSuggestionSpecEntry,
  type ImplementationSuggestionsCacheFile,
  type SpecDepsSuggestedItem,
  type SpecDepsSuggestionSpecEntry,
  type SpecDepsSuggestionCacheHeader,
  type SpecDepsSuggestionsCacheFile,
} from './orchestration/index.js'

export {
  SuggestImplementationLinks,
  createSuggestImplementationLinks as createSuggestImplementationLinksFromDeps,
  suggestImplementationLinksInputSchema,
  type SuggestImplementationLinksInput,
  type SuggestImplementationLinksResult,
  type SpecImplementationSuggestion,
  type SuggestImplementationLinksDeps,
  type SuggestImplementationProgressEvent,
  type OnSuggestImplementationProgress,
  type SuggestionFileObserver,
} from './application/use-cases/suggest-implementation-links.js'
export {
  SuggestSpecDependencies,
  createSuggestSpecDependencies as createSuggestSpecDependenciesFromDeps,
  suggestSpecDependenciesInputSchema,
  type SuggestSpecDependenciesInput,
  type SuggestSpecDependenciesResult,
  type SpecDependencySuggestion,
  type SuggestedSpecDependency,
  type PostApplyValidationDiagnostic,
  type CreatedAlignmentChangeInfo,
  type SuggestSpecDependenciesDeps,
  type SuggestSpecDepsProgressEvent,
  type OnSuggestSpecDepsProgress,
} from './application/use-cases/suggest-spec-dependencies.js'

export {
  SuggestSpecs,
  suggestSpecsInputSchema,
  type SuggestSpecsInput,
  type SuggestSpecsResult,
  type SuggestSpecsDeps,
  type SuggestSpecsProgressEvent,
  type OnSuggestSpecsProgress,
} from './application/use-cases/suggest-specs.js'

export {
  TransitiveReductionEngine,
} from './domain/services/transitive-reduction-engine.js'

export {
  SpecSymbolClassifier,
  type ClassifiedSpecSymbols,
} from './domain/services/spec-symbol-classifier.js'

export {
  CapabilityClusteringEngine,
  type CapabilityAnchor,
} from './domain/services/capability-clustering-engine.js'

export {
  ConfidenceScorer,
  type ConfidenceInputs,
} from './domain/services/confidence-scorer.js'

export {
  DependencyInferenceEngine,
} from './domain/services/dependency-inference-engine.js'

export {
  type CandidateSpec,
  type SpecCategory,
  type ConfidenceBreakdown,
  type AnchorSymbol,
  type HotspotSummary,
  type SpecRationale,
  type SuggestSpecsSummary,
} from './domain/value-objects/candidate-spec.js'

export { ImplementationSuggestionCachePort } from './application/ports/implementation-suggestion-cache-port.js'
export { SpecDepsSuggestionCachePort } from './application/ports/spec-deps-suggestion-cache-port.js'
export { CacheLockError, InvalidProviderLifecycleError } from './domain/errors/index.js'

export * from './core-reexports.js'

export {
  changeContextToMarkdown,
  projectContextToMarkdown,
  type ChangeContextToMarkdownOptions,
} from './presentation/index.js'

export {
  createGetGraphHealth,
  createBootstrapGraphConfig,
  createCodeGraphProvider,
  createIndexProjectGraph,
  runIsolatedGraphIndex,
  SymbolKind,
  DEFAULT_HOTSPOT_KINDS,
  isGraphStale,
  detectFingerprintMismatch,
  parseFingerprintMap,
  buildProjectGraphConfig,
  GraphProviderStaleError,
  SpecNotFoundError as GraphSpecNotFoundError,
  GraphIndexWorkerStartError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerExitError,
  GraphIndexWorkerSignalError,
  GraphIndexProgressHandlerError,
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  serializeFingerprintMap,
  type GraphFingerprintInput,
  type GraphIndexJsonPrimitive,
  type GraphIndexJsonValue,
  type GraphIndexTaskProgressEmitter,
  type GraphIndexTask,
  type RunIsolatedGraphIndexInput,
  type IsolatedGraphIndexRunner,
  type GetGraphHealthInput,
  type GetGraphHealthResult,
  type IndexCoverageHealthSummary,
  type ResolveSymbolReferenceInput,
  type SymbolResolutionResult,
  type ResolutionStatus,
  type ResolutionHealth,
  type ResolutionCandidate,
  type ResolutionStep,
  type SourceRange,
  type LogicalSymbol,
  type DeclarationOccurrence,
  type PublicBinding,
  type LocalBinding,
  type SymbolSpace,
  type MemberForm,
  type IndexCoverage,
  type HotspotResult,
  type IndexResult,
  type IndexPhaseMetric,
  type IndexPhaseMetrics,
  type CodeGraphProvider,
  type ExactPublicBindingResult,
  type ExactPublicBindingSelector,
  type SearchOptions,
  type SearchCodeGraphInput,
  type SearchCodeGraphResult,
  type SearchCategory,
  type SourceContentMatch,
  type SourceFileSearchResult,
  type HotspotOptions,
  type RiskLevel,
  type FileImpactResult,
  type CoveringSpecEvidence,
  type CoveringSpecImpact,
  type ImpactResult,
  CODE_GRAPH_VERSION,
} from '@specd/code-graph'

export { codeGraphVersion, getCodeGraphVersion } from './shared/code-graph-version.js'

const require = createRequire(import.meta.url)

/** Installed version of `@specd/sdk`. */
export const SDK_VERSION: string = (require('../package.json') as { version: string }).version
