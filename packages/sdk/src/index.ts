import { createRequire } from 'node:module'

export {
  createSdkContext,
  openSpecdHost,
  withOpenGraphProvider,
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
} from './orchestration/index.js'

export { InvalidProviderLifecycleError } from './domain/errors/index.js'

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
  SymbolKind,
  DEFAULT_HOTSPOT_KINDS,
  isGraphStale,
  detectFingerprintMismatch,
  parseFingerprintMap,
  buildProjectGraphConfig,
  GraphProviderStaleError,
  SpecNotFoundError as GraphSpecNotFoundError,
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  serializeFingerprintMap,
  type GraphFingerprintInput,
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
