import {
  withOpenGraphProvider,
  type CodeGraphProvider,
  type SdkHostContext,
  type SpecdConfig,
} from '@specd/sdk'
import { handleError } from '../../handle-error.js'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'
import { openCliHost } from '../../helpers/cli-host.js'

/** The CodeGraphProvider instance type. */
type Provider = CodeGraphProvider

/**
 * Runs a callback with an opened CodeGraphProvider, ensuring cleanup on
 * normal exit and errors.
 * @param config - The specd configuration.
 * @param format - The output format string (for error reporting).
 * @param fn - The async callback receiving the opened provider.
 * @param options - Optional lifecycle hooks around provider open.
 * @param options.beforeOpen - Optional callback invoked after provider creation but before open().
 * @param options.host - Optional SDK host already opened through `resolveCliContext` or
 *   `openCliHost`; when absent (bootstrap mode) a host is opened from `config`.
 */
export async function withProvider(
  config: SpecdConfig,
  format: string,
  fn: (provider: Provider) => Promise<void>,
  options?: {
    readonly beforeOpen?: (provider: Provider) => Promise<void>
    readonly host?: SdkHostContext | null
  },
): Promise<void> {
  const ctx =
    options?.host ?? (await openCliHost({ config, options: { kernel: buildCliKernelOptions() } }))

  try {
    await withOpenGraphProvider(ctx, fn, {
      ...(options?.beforeOpen !== undefined ? { beforeOpen: options.beforeOpen } : {}),
    })
  } catch (err) {
    handleError(err, format)
  }
}
