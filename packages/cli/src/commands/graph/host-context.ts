import { type Kernel, type SdkHostContext, type SpecdConfig } from '@specd/sdk'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'
import { openCliHost } from '../../helpers/cli-host.js'

/**
 * Returns the SDK host context a graph command hands to its `run*` orchestration.
 *
 * Reuses an already-opened host when available; otherwise opens one via `openCliHost`.
 *
 * @param config - The resolved specd configuration.
 * @param _kernel - Unused (retained for caller compatibility).
 * @param host - Already opened SDK host, if any.
 * @returns The host context.
 */
export async function createGraphHostContext(
  config: SpecdConfig,
  _kernel: Kernel | null | undefined,
  host?: SdkHostContext | null,
): Promise<SdkHostContext> {
  return host ?? openCliHost({ config, options: { kernel: buildCliKernelOptions() } })
}
