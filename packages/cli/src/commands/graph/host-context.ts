import {
  createCodeGraphProvider,
  createSdkContext,
  type Kernel,
  type SdkHostContext,
  type SpecdConfig,
} from '@specd/sdk'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'

/**
 * Builds the SDK host context a graph command hands to its `run*` orchestration.
 *
 * With an already resolved kernel the context reuses it and creates graph providers from the
 * configuration; without one (bootstrap mode) a fresh SDK context is created.
 *
 * @param config - The resolved specd configuration.
 * @param kernel - The kernel resolved with the configuration, or null in bootstrap mode.
 * @returns The host context.
 */
export async function createGraphHostContext(
  config: SpecdConfig,
  kernel: Kernel | null | undefined,
): Promise<SdkHostContext> {
  return kernel !== undefined && kernel !== null
    ? { kernel, createGraphProvider: () => createCodeGraphProvider(config) }
    : createSdkContext(config, { kernel: buildCliKernelOptions() })
}
