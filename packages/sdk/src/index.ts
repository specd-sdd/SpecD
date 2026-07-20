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
  type HotspotResult,
  type IndexResult,
  type CodeGraphProvider,
  type SearchOptions,
  type HotspotOptions,
  type RiskLevel,
  type FileImpactResult,
  type ImpactResult,
  CODE_GRAPH_VERSION,
} from '@specd/code-graph'

export { codeGraphVersion, getCodeGraphVersion } from './shared/code-graph-version.js'

const require = createRequire(import.meta.url)

/** Installed version of `@specd/sdk`. */
export const SDK_VERSION: string = (require('../package.json') as { version: string }).version
