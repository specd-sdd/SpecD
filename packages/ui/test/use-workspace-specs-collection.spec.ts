/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceSummaryDto } from '@specd/client'

const useAsyncResourceMock = vi.fn<
  (
    key: string,
    fetcher: () => Promise<unknown>,
    options: { enabled?: boolean; refreshKey?: number },
  ) => {
    data: undefined
    error: undefined
    isLoading: false
    refetch: ReturnType<typeof vi.fn>
  }
>(() => ({
  data: undefined,
  error: undefined,
  isLoading: false,
  refetch: vi.fn(),
}))

vi.mock('../src/hooks/use-async-resource.js', () => ({
  useAsyncResource: (
    key: string,
    fetcher: () => Promise<unknown>,
    options: { enabled?: boolean; refreshKey?: number },
  ) => useAsyncResourceMock(key, fetcher, options),
}))

vi.mock('../src/context/specd-data-context.js', () => ({
  useSpecdDataPort: () => ({
    listSpecs: vi.fn(),
  }),
}))

const workspaces: readonly WorkspaceSummaryDto[] = [{ name: 'core', specsPath: 'specs/core' }]

describe('useWorkspaceSpecsCollection', () => {
  it('given enabled false, when hook mounts, then async resource does not fetch', async () => {
    useAsyncResourceMock.mockClear()
    const { useWorkspaceSpecsCollection } =
      await import('../src/hooks/use-workspace-specs-collection.js')

    renderHook(() => useWorkspaceSpecsCollection(workspaces, 0, { enabled: false }))

    expect(useAsyncResourceMock).toHaveBeenCalledWith(
      'workspace-specs-collection:core',
      expect.any(Function),
      expect.objectContaining({ enabled: false, refreshKey: 0 }),
    )
  })

  it('given enabled true and workspaces present, when hook mounts, then async resource fetches', async () => {
    useAsyncResourceMock.mockClear()
    const { useWorkspaceSpecsCollection } =
      await import('../src/hooks/use-workspace-specs-collection.js')

    renderHook(() => useWorkspaceSpecsCollection(workspaces, 2, { enabled: true }))

    expect(useAsyncResourceMock).toHaveBeenCalledWith(
      'workspace-specs-collection:core',
      expect.any(Function),
      expect.objectContaining({ enabled: true, refreshKey: 2 }),
    )
  })
})
