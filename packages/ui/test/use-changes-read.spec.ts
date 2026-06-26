/**
 * @vitest-environment jsdom
 */
import type { ChangeStatusDto, SpecdDataPort } from '@specd/client'
import { MemorySpecdDataAdapter } from '@specd/client'
import { renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SpecdDataProvider } from '../src/context/specd-data-context.js'
import { useChangesRead } from '../src/hooks/use-changes-read.js'

const ALPHA_AT = '2026-01-01T00:00:00.000Z'
const BETA_AT = '2026-06-01T00:00:00.000Z'

function fullStatus(name: string, updatedAt: string): ChangeStatusDto {
  return {
    name,
    state: 'exploring',
    updatedAt,
    artifacts: [],
    blockers: [{ code: 'TEST', message: `${name} blocker` }],
    nextAction: {
      targetStep: 'exploring',
      actionType: 'continue',
      reason: `${name} next`,
      command: null,
    },
  }
}

function createTrackingPort() {
  const adapter = new MemorySpecdDataAdapter()
  const getChangeStatus = vi.spyOn(adapter, 'getChangeStatus')
  getChangeStatus.mockImplementation(async (name, options) => {
    const updatedAt = name === 'beta' ? BETA_AT : ALPHA_AT
    if (options?.ifModifiedSince === updatedAt) {
      return {
        name,
        state: 'exploring',
        updatedAt,
        unchanged: true,
      }
    }
    return fullStatus(name, updatedAt)
  })

  void adapter.createChange({ name: 'alpha', specIds: [] })
  void adapter.createChange({ name: 'beta', specIds: [] })

  return { port: adapter, getChangeStatus }
}

function wrapper(port: SpecdDataPort) {
  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return React.createElement(SpecdDataProvider, { port, children })
  }
}

describe('useChangesRead', () => {
  it('restores cached workflow status when revisiting a change after a newer one', async () => {
    const { port, getChangeStatus } = createTrackingPort()

    const { result, rerender } = renderHook(
      ({ name }: { name: string | undefined }) => useChangesRead(name),
      {
        wrapper: wrapper(port),
        initialProps: { name: 'alpha' as string | undefined },
      },
    )

    await waitFor(() => {
      expect(result.current.status.data?.nextAction?.reason).toBe('alpha next')
    })

    rerender({ name: 'beta' })

    await waitFor(() => {
      expect(result.current.status.data?.nextAction?.reason).toBe('beta next')
    })

    rerender({ name: 'alpha' })

    await waitFor(() => {
      expect(result.current.status.data?.nextAction?.reason).toBe('alpha next')
      expect(result.current.status.isLoading).toBe(false)
    })

    const alphaCalls = getChangeStatus.mock.calls.filter(([name]) => name === 'alpha')
    const lastAlphaCall = alphaCalls.at(-1)
    const lastAlphaOptions = lastAlphaCall?.[1]
    expect(lastAlphaOptions?.ifModifiedSince).toBe(ALPHA_AT)
    expect(lastAlphaOptions?.ifModifiedSince).not.toBe(BETA_AT)
  })

  it('keeps full status visible when a poll returns unchanged', async () => {
    const { port, getChangeStatus } = createTrackingPort()

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => useChangesRead('alpha', { refreshKey }),
      {
        wrapper: wrapper(port),
        initialProps: { refreshKey: 0 },
      },
    )

    await waitFor(() => {
      expect(result.current.status.data?.blockers?.[0]?.message).toBe('alpha blocker')
    })

    rerender({ refreshKey: 1 })

    await waitFor(() => {
      expect(getChangeStatus).toHaveBeenCalledTimes(2)
    })

    expect(result.current.status.data?.blockers?.[0]?.message).toBe('alpha blocker')
    expect(result.current.status.data?.nextAction?.reason).toBe('alpha next')
    expect(result.current.status.isLoading).toBe(false)
  })

  it('isolates status cache between list section buckets', async () => {
    const adapter = new MemorySpecdDataAdapter()
    const getDraftStatus = vi
      .spyOn(adapter, 'getDraftStatus')
      .mockResolvedValue(fullStatus('alpha', ALPHA_AT))
    const getChangeStatus = vi
      .spyOn(adapter, 'getChangeStatus')
      .mockResolvedValue(fullStatus('alpha', BETA_AT))

    void adapter.createChange({ name: 'alpha', specIds: [] })

    const { result, rerender } = renderHook(
      ({ listSection }: { listSection: 'active' | 'draft' | null }) =>
        useChangesRead('alpha', { listSection }),
      {
        wrapper: wrapper(adapter),
        initialProps: { listSection: 'active' as 'active' | 'draft' | null },
      },
    )

    await waitFor(() => {
      expect(result.current.status.data?.updatedAt).toBe(BETA_AT)
    })

    rerender({ listSection: 'draft' })

    await waitFor(() => {
      expect(getDraftStatus).toHaveBeenCalled()
      expect(result.current.status.data?.updatedAt).toBe(ALPHA_AT)
    })

    expect(getChangeStatus).toHaveBeenCalled()
    expect(getDraftStatus).toHaveBeenCalled()
  })
})
