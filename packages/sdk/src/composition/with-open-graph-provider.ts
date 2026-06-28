import { type CodeGraphProvider } from '@specd/code-graph'
import { type SdkHostContext } from './host-context.js'

/** Options for {@link withOpenGraphProvider}. */
export interface WithOpenGraphProviderOptions {
  /** Invoked after provider creation and before {@link CodeGraphProvider.open}. */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
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
  await options?.beforeOpen?.(provider)
  await provider.open()
  let result: T
  try {
    result = await fn(provider)
  } catch (fnErr) {
    try {
      await provider.close()
    } catch {
      /* ignore close errors during error cleanup */
    }
    throw fnErr
  }
  try {
    await provider.close()
  } catch (closeErr) {
    throw closeErr
  }
  return result
}
