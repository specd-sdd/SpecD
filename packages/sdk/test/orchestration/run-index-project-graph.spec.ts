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
  withOpenGraphProvider,
  createVcsAdapter,
  indexExecute,
} = vi.hoisted(() => ({
  getConfig: { execute: vi.fn() },
  listWorkspaces: { execute: vi.fn() },
  getSpecMetadata: { execute: vi.fn() },
  createIndexProjectGraph: vi.fn(),
  withOpenGraphProvider: vi.fn(),
  createVcsAdapter: vi.fn(),
  indexExecute: vi.fn(),
}))

vi.mock('../../src/composition/with-open-graph-provider.js', () => ({
  withOpenGraphProvider,
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
    withOpenGraphProvider.mockImplementation(
      async (_ctx: SdkHostContext, fn: (provider: object) => Promise<unknown>) =>
        fn({ index: indexExecute }),
    )
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

  it('forwards beforeOpen and afterClose hooks to withOpenGraphProvider when provider is omitted', async () => {
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()
    await runIndexProjectGraph(ctx, { beforeOpen, afterClose })

    expect(withOpenGraphProvider).toHaveBeenCalledWith(
      ctx,
      expect.any(Function),
      expect.objectContaining({ beforeOpen, afterClose }),
    )
  })

  it('bypasses withOpenGraphProvider and does not close provider when existing provider is supplied', async () => {
    const closeSpy = vi.fn()
    const mockProvider = { close: closeSpy, index: indexExecute } as unknown as CodeGraphProvider

    const result = await runIndexProjectGraph(ctx, { provider: mockProvider })

    expect(withOpenGraphProvider).not.toHaveBeenCalled()
    expect(closeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ filesIndexed: 3 })
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
