import {
  createSdkContext,
  withOpenGraphProvider,
  type CodeGraphProvider,
  type SdkHostContext,
  type SpecdConfig,
} from '@specd/sdk'
import { handleError } from '../../handle-error.js'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'

/** The CodeGraphProvider instance type. */
type Provider = CodeGraphProvider

/**
 * Runs a callback with an opened CodeGraphProvider, ensuring cleanup on
 * normal exit and errors. Calls process.exit(0) after closing to prevent
 * LadybugDB native threads from keeping the process alive.
 * On SIGINT/SIGTERM, exits immediately without waiting for close() since
 * LadybugDB native calls can block indefinitely.
 * @param config - The specd configuration.
 * @param format - The output format string (for error reporting).
 * @param fn - The async callback receiving the opened provider.
 * @param options - Optional lifecycle hooks around provider open.
 * @param options.beforeOpen - Optional callback invoked after provider creation but before open().
 * @param options.host - Optional pre-built SDK host context.
 */
export async function withProvider(
  config: SpecdConfig,
  format: string,
  fn: (provider: Provider) => Promise<void>,
  options?: {
    readonly beforeOpen?: (provider: Provider) => Promise<void>
    readonly host?: SdkHostContext
  },
): Promise<void> {
  const ctx =
    options?.host ??
    (await createSdkContext(config, {
      kernel: buildCliKernelOptions(),
    }))

  const forceExit = (): void => {
    process.exit(130)
  }
  process.on('SIGINT', forceExit)
  process.on('SIGTERM', forceExit)

  try {
    await withOpenGraphProvider(ctx, fn, {
      ...(options?.beforeOpen !== undefined ? { beforeOpen: options.beforeOpen } : {}),
    })
  } catch (err) {
    process.removeListener('SIGINT', forceExit)
    process.removeListener('SIGTERM', forceExit)
    handleError(err, format)
  }

  process.removeListener('SIGINT', forceExit)
  process.removeListener('SIGTERM', forceExit)
  process.exit(0)
}
