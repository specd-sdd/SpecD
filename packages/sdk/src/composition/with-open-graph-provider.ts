import { type CodeGraphProvider } from '@specd/code-graph'
import { type SdkHostContext } from './host-context.js'

/** Options for {@link withOpenGraphProvider}. */
export interface WithOpenGraphProviderOptions {
  /** Invoked after provider creation and before {@link CodeGraphProvider.open}. */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  /** Invoked after the helper finishes its close path. */
  readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>
  /** May repair the closed provider after its initial open operation fails. */
  readonly recoverOpenFailure?: (error: unknown, provider: CodeGraphProvider) => Promise<boolean>
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
  const notifyAfterClose = async (suppressErrors: boolean): Promise<void> => {
    try {
      await options?.afterClose?.(provider)
    } catch (error) {
      if (!suppressErrors) throw error
    }
  }
  const close = async (suppressErrors: boolean): Promise<void> => {
    let closeError: unknown
    try {
      await provider.close()
    } catch (error) {
      closeError = error
    }
    await notifyAfterClose(suppressErrors)
    if (!suppressErrors && closeError !== undefined) {
      throw closeError instanceof Error
        ? closeError
        : new Error('Graph provider close failed with a non-Error value')
    }
  }
  const closeBeforeRecovery = async (): Promise<boolean> => {
    try {
      await provider.close()
      return true
    } catch {
      return false
    }
  }

  try {
    await options?.beforeOpen?.(provider)
  } catch (error) {
    await close(true)
    throw error
  }

  try {
    await provider.open()
  } catch (openError) {
    if (options?.recoverOpenFailure === undefined || !(await closeBeforeRecovery())) {
      await close(true)
      throw openError
    }

    let recovered: boolean
    try {
      recovered = await options.recoverOpenFailure(openError, provider)
    } catch (recoveryError) {
      await closeBeforeRecovery()
      await notifyAfterClose(true)
      throw recoveryError
    }
    if (!recovered) {
      await notifyAfterClose(true)
      throw openError
    }

    try {
      await provider.open()
    } catch (retryError) {
      await closeBeforeRecovery()
      await notifyAfterClose(true)
      throw retryError
    }
  }

  let result: T
  try {
    result = await fn(provider)
  } catch (error) {
    await close(true)
    throw error
  }
  await close(false)
  return result
}
