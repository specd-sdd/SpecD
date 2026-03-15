import { type SpecdConfig } from '@specd/core'
import { createCodeGraphProvider } from '@specd/code-graph'
import { handleError } from '../../handle-error.js'

/** The CodeGraphProvider instance type. */
type Provider = ReturnType<typeof createCodeGraphProvider>

/**
 * Runs a callback with an opened CodeGraphProvider, ensuring cleanup on
 * normal exit and errors. Calls process.exit(0) after closing to prevent
 * LadybugDB native threads from keeping the process alive.
 * On SIGINT/SIGTERM, exits immediately without waiting for close() since
 * LadybugDB native calls can block indefinitely.
 * @param config - The specd configuration.
 * @param format - The output format string (for error reporting).
 * @param fn - The async callback receiving the opened provider.
 */
export async function withProvider(
  config: SpecdConfig,
  format: string,
  fn: (provider: Provider) => Promise<void>,
): Promise<void> {
  const provider = createCodeGraphProvider(config)

  // Force exit on signals — don't wait for LadybugDB close which can block
  const forceExit = (): void => {
    process.exit(130)
  }
  process.on('SIGINT', forceExit)
  process.on('SIGTERM', forceExit)

  try {
    await provider.open()
    await fn(provider)
  } catch (err) {
    try {
      await provider.close()
    } catch {
      /* ignore */
    }
    process.removeListener('SIGINT', forceExit)
    process.removeListener('SIGTERM', forceExit)
    handleError(err, format)
  }

  await provider.close()
  process.removeListener('SIGINT', forceExit)
  process.removeListener('SIGTERM', forceExit)
  process.exit(0)
}
