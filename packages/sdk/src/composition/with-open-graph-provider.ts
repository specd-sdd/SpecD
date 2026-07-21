import { type CodeGraphProvider } from '@specd/code-graph'
import { type SdkHostContext } from './host-context.js'

/** Options for {@link withOpenGraphProvider}. */
export interface WithOpenGraphProviderOptions {
  /** Invoked after provider creation and before {@link CodeGraphProvider.open}. */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  /** Invoked after the helper finishes its close path. */
  readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>
}

/**
 * Runs a callback with an opened graph provider, closing it in a `finally` block.
 *
 * @param ctx - SDK host context
 * @param fn - Callback receiving the opened provider
 * @param options - Optional lifecycle hooks
 * @returns The callback result
 */
export async function withOpenGraphProvider<T>(
  ctx: SdkHostContext,
  fn: (provider: CodeGraphProvider) => Promise<T>,
  options?: WithOpenGraphProviderOptions,
): Promise<T> {
  const provider = ctx.createGraphProvider()
  let cleanupStarted = false
  const close = async (suppressErrors: boolean): Promise<void> => {
    cleanupStarted = true
    let closeError: unknown
    try {
      await provider.close()
    } catch (error) {
      closeError = error
    }
    try {
      await options?.afterClose?.(provider)
    } catch (error) {
      if (!suppressErrors) throw error
    }
    if (!suppressErrors && closeError !== undefined) {
      throw closeError instanceof Error
        ? closeError
        : new Error('Graph provider close failed with a non-Error value')
    }
  }
  try {
    await options?.beforeOpen?.(provider)
    await provider.open()
    const result = await fn(provider)
    await close(false)
    return result
  } catch (error) {
    if (!cleanupStarted) {
      await close(true)
    }
    throw error
  }
}
