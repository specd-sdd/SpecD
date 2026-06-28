import { createRequire } from 'node:module'

export {
  createConfigLoader,
  createConfigWriter,
  createKernel,
  type Kernel,
  type KernelOptions,
  type SpecdConfig,
} from '@specd/core'
export { createCodeGraphProvider, type CodeGraphProvider } from '@specd/code-graph'

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

const require = createRequire(import.meta.url)

/** Installed version of `@specd/sdk`. */
export const SDK_VERSION: string = (require('../package.json') as { version: string }).version
