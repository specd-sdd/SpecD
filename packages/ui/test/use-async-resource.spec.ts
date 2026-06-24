/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncResource } from '../src/hooks/use-async-resource.js'

describe('useAsyncResource', () => {
  it('given disabled after load, when enabled flips false, then cached data is kept', async () => {
    const fetcher = vi.fn(async () => 'loaded')

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsyncResource('test-resource', fetcher, { enabled }),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => {
      expect(result.current.data).toBe('loaded')
    })

    rerender({ enabled: false })

    expect(result.current.data).toBe('loaded')
    expect(result.current.isLoading).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('given cached data while disabled, when re-enabled with newer refreshKey, then data refreshes', async () => {
    let value = 'v1'
    const fetcher = vi.fn(async () => value)

    const { result, rerender } = renderHook(
      ({ enabled, refreshKey }: { enabled: boolean; refreshKey: number }) =>
        useAsyncResource('poll-resource', fetcher, { enabled, refreshKey }),
      { initialProps: { enabled: true, refreshKey: 0 } },
    )

    await waitFor(() => {
      expect(result.current.data).toBe('v1')
    })

    rerender({ enabled: false, refreshKey: 3 })
    value = 'v2'
    rerender({ enabled: true, refreshKey: 3 })

    await waitFor(() => {
      expect(result.current.data).toBe('v2')
    })

    expect(result.current.isLoading).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('given cached data while disabled, when re-enabled without refreshKey bump, then stale data shows immediately', async () => {
    const fetcher = vi.fn(async () => 'cached')

    const { result, rerender } = renderHook(
      ({ enabled, refreshKey }: { enabled: boolean; refreshKey: number }) =>
        useAsyncResource('stable-resource', fetcher, { enabled, refreshKey }),
      { initialProps: { enabled: true, refreshKey: 0 } },
    )

    await waitFor(() => {
      expect(result.current.data).toBe('cached')
    })

    rerender({ enabled: false, refreshKey: 0 })

    await act(async () => {
      rerender({ enabled: true, refreshKey: 0 })
    })

    expect(result.current.data).toBe('cached')
    expect(result.current.isLoading).toBe(false)
  })

  it('given disabled with cached data, when refreshKey advances, then fetcher is not called until re-enabled', async () => {
    const fetcher = vi.fn(async () => 'loaded')

    const { rerender } = renderHook(
      ({ enabled, refreshKey }: { enabled: boolean; refreshKey: number }) =>
        useAsyncResource('paused-resource', fetcher, { enabled, refreshKey }),
      { initialProps: { enabled: true, refreshKey: 0 } },
    )

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    rerender({ enabled: false, refreshKey: 4 })

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
