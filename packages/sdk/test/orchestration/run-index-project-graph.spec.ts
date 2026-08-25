import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphStorageRecoveryRequiredError, type CodeGraphProvider } from '@specd/code-graph'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { InvalidProviderLifecycleError } from '../../src/domain/errors/invalid-provider-lifecycle-error.js'

const {
  getConfig,
  listWorkspaces,
  getSpecMetadata,
  createIndexProjectGraph,
  createVcsAdapter,
  indexExecute,
  providerIndex,
  createGraphProvider,
  openProvider,
  recreateProvider,
  closeProvider,
} = vi.hoisted(() => ({
  getConfig: { execute: vi.fn() },
  listWorkspaces: { execute: vi.fn() },
  getSpecMetadata: { execute: vi.fn() },
  createIndexProjectGraph: vi.fn(),
  createVcsAdapter: vi.fn(),
  indexExecute: vi.fn(),
  providerIndex: vi.fn(),
  createGraphProvider: vi.fn(),
  openProvider: vi.fn(),
  recreateProvider: vi.fn(),
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
    providerIndex.mockResolvedValue({ filesIndexed: 3 })
    createIndexProjectGraph.mockReturnValue({ execute: indexExecute })
    openProvider.mockResolvedValue(undefined)
    recreateProvider.mockResolvedValue(undefined)
    createGraphProvider.mockReturnValue({
      open: openProvider,
      recreate: recreateProvider,
      close: closeProvider,
      index: providerIndex,
    })
  })

  it('filters workspaces when a subset is requested', async () => {
    await runIndexProjectGraph(ctx, { workspaces: ['cli'] })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [expect.objectContaining({ name: 'cli' })],
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('indexes all workspaces when no filter is provided', async () => {
    await runIndexProjectGraph(ctx, { force: false })

    expect(listWorkspaces.execute).toHaveBeenCalled()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards onProgress to IndexProjectGraph', async () => {
    const onProgress = vi.fn()
    await runIndexProjectGraph(ctx, { onProgress })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards materialized spec metadata to IndexProjectGraph', async () => {
    await runIndexProjectGraph(ctx)

    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ getSpecMetadata }))
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards installed code-graph version to IndexProjectGraph', async () => {
    const codeGraphPackageJson = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../code-graph/package.json'),
        'utf8',
      ),
    ) as { version: string }

    await runIndexProjectGraph(ctx, { force: false })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        codeGraphVersion: codeGraphPackageJson.version,
      }),
    )
    expect(codeGraphPackageJson.version).not.toBe('0.0.0')
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('runs indexing lifecycle hooks once when provider is omitted', async () => {
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()
    await runIndexProjectGraph(ctx, { beforeOpen, afterClose })

    expect(beforeOpen).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
    expect(afterClose).toHaveBeenCalledOnce()
  })

  it('bypasses withOpenGraphProvider and does not close provider when existing provider is supplied', async () => {
    const closeSpy = vi.fn()
    const explicitProviderIndex = vi.fn()
    const mockProvider = {
      close: closeSpy,
      index: explicitProviderIndex,
    } as unknown as CodeGraphProvider

    const onProgress = vi.fn()
    const result = await runIndexProjectGraph(ctx, {
      provider: mockProvider,
      force: true,
      onProgress,
    })

    expect(closeSpy).not.toHaveBeenCalled()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: mockProvider,
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
        vcsRef: 'abc123',
        vcsRoot: null,
        force: true,
        onProgress,
      }),
    )
    expect(explicitProviderIndex).not.toHaveBeenCalled()
    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: null,
    })
  })

  it('opens a transient provider through its parameterless lifecycle', async () => {
    await runIndexProjectGraph(ctx)

    expect(openProvider).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ open: openProvider, close: closeProvider }),
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
        vcsRoot: null,
        vcsRef: 'abc123',
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('reports an explicitly forced index as a full rebuild', async () => {
    indexExecute.mockResolvedValue({
      filesIndexed: 3,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })

    const result = await runIndexProjectGraph(ctx, { force: true })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    expect(providerIndex).not.toHaveBeenCalled()

    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })
  })

  it('recovers a typed storage-open failure only for a transient forced index', async () => {
    const openError = new GraphStorageRecoveryRequiredError(
      'schema cannot be migrated',
      'SCHEMA_INCOMPATIBLE',
    )
    openProvider.mockRejectedValueOnce(openError)
    indexExecute.mockResolvedValue({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'Forced logical graph reindex requested by indexing',
    })

    const result = await runIndexProjectGraph(ctx, { force: true })

    expect(recreateProvider).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledTimes(2)
    expect(indexExecute).toHaveBeenCalledOnce()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    expect(providerIndex).not.toHaveBeenCalled()
    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'SCHEMA_INCOMPATIBLE',
    })
  })

  it('does not recreate storage for non-forced or non-recoverable open failures', async () => {
    const typedError = new GraphStorageRecoveryRequiredError('corrupt', 'CORRUPT')
    openProvider.mockRejectedValueOnce(typedError)

    await expect(runIndexProjectGraph(ctx, { force: false })).rejects.toBe(typedError)
    expect(recreateProvider).not.toHaveBeenCalled()
    expect(openProvider).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    const otherError = new Error('permission denied')
    getConfig.execute.mockResolvedValue({ projectRoot: '/tmp/project' })
    listWorkspaces.execute.mockResolvedValue([])
    createVcsAdapter.mockResolvedValue({ ref: async () => 'abc123' })
    openProvider.mockRejectedValueOnce(otherError)
    createGraphProvider.mockReturnValue({
      open: openProvider,
      recreate: recreateProvider,
      close: closeProvider,
      index: providerIndex,
    })

    await expect(runIndexProjectGraph(ctx, { force: true })).rejects.toBe(otherError)
    expect(recreateProvider).not.toHaveBeenCalled()
    expect(openProvider).toHaveBeenCalledOnce()
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
