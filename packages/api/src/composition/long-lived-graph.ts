import { GraphProviderStaleError, type CodeGraphProvider } from '@specd/sdk'

/** Mutable holder for a process-scoped opened graph provider. */
export interface LongLivedGraphHolder {
  provider: CodeGraphProvider
}

/**
 * Creates and opens a long-lived graph provider from a host factory.
 *
 * @param createGraphProvider - SDK host factory bound to project config
 * @returns Opened provider
 */
export async function openLongLivedGraphProvider(
  createGraphProvider: () => CodeGraphProvider,
): Promise<CodeGraphProvider> {
  const provider = createGraphProvider()
  await provider.open()
  return provider
}

/**
 * Closes the held provider without opening a replacement.
 *
 * Used before short-lived index orchestration so the store is not locked.
 *
 * @param holder - Mutable long-lived provider holder
 */
export async function closeLongLivedGraphProvider(holder: LongLivedGraphHolder): Promise<void> {
  await holder.provider.close().catch(() => undefined)
}

/**
 * Replaces the held provider with a freshly opened one.
 *
 * @param createGraphProvider - SDK host factory
 * @param holder - Mutable long-lived provider holder
 * @returns Newly opened provider
 */
export async function refreshLongLivedGraphProvider(
  createGraphProvider: () => CodeGraphProvider,
  holder: LongLivedGraphHolder,
): Promise<CodeGraphProvider> {
  await closeLongLivedGraphProvider(holder)
  const provider = await openLongLivedGraphProvider(createGraphProvider)
  holder.provider = provider
  return provider
}

/**
 * Runs a callback with the long-lived provider, refreshing once on stale.
 *
 * @param createGraphProvider - SDK host factory
 * @param holder - Mutable long-lived provider holder
 * @param run - Callback receiving the opened provider
 * @returns Callback result
 */
export async function withHealthyGraphProvider<TResult>(
  createGraphProvider: () => CodeGraphProvider,
  holder: LongLivedGraphHolder,
  run: (provider: CodeGraphProvider) => Promise<TResult>,
): Promise<TResult> {
  try {
    return await run(holder.provider)
  } catch (error) {
    if (!(error instanceof GraphProviderStaleError)) {
      throw error
    }
    await refreshLongLivedGraphProvider(createGraphProvider, holder)
    return await run(holder.provider)
  }
}
