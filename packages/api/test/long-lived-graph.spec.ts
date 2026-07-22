import { describe, expect, it, vi } from 'vitest'
import { GraphProviderStaleError, type CodeGraphProvider } from '@specd/sdk'
import {
  type LongLivedGraphHolder,
  withHealthyGraphProvider,
} from '../src/composition/long-lived-graph.js'

/**
 * Builds a minimal provider stub for long-lived helper tests.
 *
 * @param label - Discriminator for identity assertions
 */
function stubProvider(label: string): CodeGraphProvider {
  return {
    label,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as CodeGraphProvider & { label: string }
}

describe('withHealthyGraphProvider', () => {
  it('given GraphProviderStaleError, when run fails once, then refreshes and retries', async () => {
    const first = stubProvider('first')
    const second = stubProvider('second')
    const holder: LongLivedGraphHolder = { provider: first }
    const createGraphProvider = vi.fn<() => CodeGraphProvider>().mockReturnValueOnce(second)

    let attempts = 0
    const result = await withHealthyGraphProvider(createGraphProvider, holder, async (provider) => {
      attempts += 1
      if (attempts === 1) {
        expect(provider).toBe(first)
        throw new GraphProviderStaleError('stale')
      }
      expect(provider).toBe(second)
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
    expect(createGraphProvider).toHaveBeenCalledTimes(1)
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(second.open).toHaveBeenCalledTimes(1)
    expect(holder.provider).toBe(second)
  })

  it('given a non-stale error, when run fails, then does not refresh', async () => {
    const first = stubProvider('first')
    const holder: LongLivedGraphHolder = { provider: first }
    const createGraphProvider = vi.fn<() => CodeGraphProvider>()

    await expect(
      withHealthyGraphProvider(createGraphProvider, holder, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(createGraphProvider).not.toHaveBeenCalled()
    expect(first.close).not.toHaveBeenCalled()
    expect(holder.provider).toBe(first)
  })
})
