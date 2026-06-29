import {
  createCodeGraphProvider,
  createSdkContext,
  type Kernel,
  type SdkHostContext,
  type SpecdConfig,
} from '@specd/sdk'
import { buildCliKernelOptions } from './cli-context.js'

/**
 * Builds an SDK host context from resolved graph CLI state.
 *
 * @param config - Resolved project configuration
 * @param kernel - Wired kernel for configured mode, or `null` for bootstrap
 * @returns SDK host context for orchestration helpers
 */
export async function resolveSdkHostContext(
  config: SpecdConfig,
  kernel: Kernel | null,
): Promise<SdkHostContext> {
  if (kernel !== null) {
    return {
      kernel,
      createGraphProvider: () => createCodeGraphProvider(config),
    }
  }
  return createSdkContext(config, buildCliKernelOptions())
}
