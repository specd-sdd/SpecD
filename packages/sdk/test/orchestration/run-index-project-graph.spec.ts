import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type CodeGraphProvider } from '@specd/code-graph'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { InvalidProviderLifecycleError } from '../../src/domain/errors/invalid-provider-lifecycle-error.js'

const {
  getConfig,
  listWorkspaces,
  getSpecMetadata,
  createIndexProjectGraph,
  createVcsAdapter,
  indexExecute,
  createGraphProvider,
  openForIndexing,
  closeProvider,
} = vi.hoisted(() => ({
  getConfig: { execute: vi.fn() },
  listWorkspaces: { execute: vi.fn() },
  getSpecMetadata: { execute: vi.fn() },
  createIndexProjectGraph: vi.fn(),
  createVcsAdapter: vi.fn(),
  indexExecute: vi.fn(),
  createGraphProvider: vi.fn(),
  openForIndexing: vi.fn(),
  closeProvider: vi.fn(),
}))

vi.mock('@specd/code-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/code-graph')>()
  return {
    ...actual,
    buildProjectGraphConfig: vi.fn(() => ({ excludePaths: [] })),
    createIndexProjectGraph,
  }
})

vi.mock('@specd/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/core')>()
  return {
    ...actual,
    createVcsAdapter,
  }
})

const { runIndexProjectGraph } = await import('../../src/orchestration/run-index-project-graph.js')

const ctx = {
  kernel: {
    project: {
      getConfig,
      listWorkspaces,
    },
    specs: {
      getMetadata: getSpecMetadata,
    },
  },
  createGraphProvider,
} as unknown as SdkHostContext

describe('runIndexProjectGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConfig.execute.mockResolvedValue({ projectRoot: '/tmp/project' })
    listWorkspaces.execute.mockResolvedValue([
      { name: 'core', prefix: null },
      { name: 'cli', prefix: null },
    ])
    createVcsAdapter.mockResolvedValue({ ref: async () => 'abc123' })
    indexExecute.mockResolvedValue({ filesIndexed: 3 })
    createIndexProjectGraph.mockReturnValue({ execute: indexExecute })
    openForIndexing.mockResolvedValue({ fullRebuild: false, fullRebuildReason: null })
    createGraphProvider.mockReturnValue({
      openForIndexing,
      close: closeProvider,
      index: indexExecute,
    })
  })

  it('filters workspaces when a subset is requested', async () => {
    await runIndexProjectGraph(ctx, { workspaces: ['cli'] })
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [expect.objectContaining({ name: 'cli' })],
      }),
    )
  })

  it('indexes all workspaces when no filter is provided', async () => {
    await runIndexProjectGraph(ctx, { force: false })
    expect(listWorkspaces.execute).toHaveBeenCalled()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
      }),
    )
  })

  it('forwards onProgress to IndexProjectGraph', async () => {
    const onProgress = vi.fn()
    await runIndexProjectGraph(ctx, { onProgress })
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
  })

  it('forwards installed code-graph version to IndexProjectGraph', async () => {
    const codeGraphPackageJson = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../code-graph/package.json'),
        'utf8',
      ),
    ) as { version: string }

    await runIndexProjectGraph(ctx, { force: false })
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        codeGraphVersion: codeGraphPackageJson.version,
      }),
    )
    expect(codeGraphPackageJson.version).not.toBe('0.0.0')
  })

  it('runs indexing lifecycle hooks once when provider is omitted', async () => {
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()
    await runIndexProjectGraph(ctx, { beforeOpen, afterClose })

    expect(beforeOpen).toHaveBeenCalledOnce()
    expect(openForIndexing).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
    expect(afterClose).toHaveBeenCalledOnce()
  })

  it('bypasses withOpenGraphProvider and does not close provider when existing provider is supplied', async () => {
    const closeSpy = vi.fn()
    const mockProvider = { close: closeSpy, index: indexExecute } as unknown as CodeGraphProvider

    const result = await runIndexProjectGraph(ctx, { provider: mockProvider })

    expect(closeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: false,
      fullRebuildReason: null,
    })
  })

  it('preserves provider-owned schema repair diagnostics', async () => {
    openForIndexing.mockResolvedValue({
      fullRebuild: true,
      fullRebuildReason: 'SCHEMA_INCOMPATIBLE',
    })

    const result = await runIndexProjectGraph(ctx)

    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'SCHEMA_INCOMPATIBLE',
    })
    expect(openForIndexing).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
  })

  it('reports an explicitly forced index as a full rebuild', async () => {
    indexExecute.mockResolvedValue({
      filesIndexed: 3,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })

    const result = await runIndexProjectGraph(ctx, { force: true })

    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })
  })

  it('throws InvalidProviderLifecycleError when provider is passed together with beforeOpen or afterClose', async () => {
    const mockProvider = {} as CodeGraphProvider
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()

    await expect(runIndexProjectGraph(ctx, { provider: mockProvider, beforeOpen })).rejects.toThrow(
      InvalidProviderLifecycleError,
    )

    await expect(runIndexProjectGraph(ctx, { provider: mockProvider, afterClose })).rejects.toThrow(
      InvalidProviderLifecycleError,
    )

    try {
      await runIndexProjectGraph(ctx, { provider: mockProvider, beforeOpen })
    } catch (error: unknown) {
      expect((error as InvalidProviderLifecycleError).code).toBe('INVALID_PROVIDER_LIFECYCLE')
    }
  })
})
