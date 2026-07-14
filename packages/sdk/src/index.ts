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
  buildProjectStatusSnapshot,
  runIndexProjectGraph,
  type BuildProjectStatusSnapshotOptions,
  type BuildProjectStatusSnapshotResult,
  type RunIndexProjectGraphInput,
  type RunIndexProjectGraphResult,
} from './orchestration/index.js'

export * from './core-reexports.js'

export {
  acquireGraphIndexLock,
  assertGraphIndexUnlocked,
  createGetGraphHealth,
  createBootstrapGraphConfig,
  createCodeGraphProvider,
  createIndexProjectGraph,
  SymbolKind,
  DEFAULT_EXCLUDE_PATHS,
  DEFAULT_HOTSPOT_KINDS,
  isGraphStale,
  detectFingerprintMismatch,
  parseFingerprintMap,
  buildProjectGraphConfig,
  normalizeFileSelectorPath,
  SpecNotFoundError as GraphSpecNotFoundError,
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  serializeFingerprintMap,
  type GraphFingerprintInput,
  type GetGraphHealthInput,
  type GetGraphHealthResult,
  type HotspotResult,
  type IndexResult,
  type CodeGraphProvider,
  type SearchOptions,
  type HotspotOptions,
  type RiskLevel,
  type ProjectGraphConfig,
  type FileImpactResult,
  type ImpactResult,
  type GraphStatistics,
  type SymbolNode,
  type SpecNode,
  type DocumentNode,
  type IndexError,
  type WorkspaceIndexBreakdown,
  type HotspotEntry,
  CODE_GRAPH_VERSION,
} from '@specd/code-graph'

export { codeGraphVersion, getCodeGraphVersion } from './shared/code-graph-version.js'

const require = createRequire(import.meta.url)

/** Installed version of `@specd/sdk`. */
export const SDK_VERSION: string = (require('../package.json') as { version: string }).version
