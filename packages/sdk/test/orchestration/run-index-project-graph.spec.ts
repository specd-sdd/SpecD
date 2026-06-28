import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SdkHostContext } from '../../src/composition/host-context.js'

const getConfig = { execute: vi.fn() }
const listWorkspaces = { execute: vi.fn() }
const createIndexProjectGraph = vi.fn()
const withOpenGraphProvider = vi.fn()
const createVcsAdapter = vi.fn()

vi.mock('../../src/composition/with-open-graph-provider.js', () => ({
  withOpenGraphProvider,
}))

vi.mock('@specd/code-graph', () => ({
  buildProjectGraphConfig: vi.fn(() => ({ excludePaths: [] })),
  createIndexProjectGraph,
}))

vi.mock('@specd/core', () => ({
  createVcsAdapter,
}))

const { runIndexProjectGraph } = await import('../../src/orchestration/run-index-project-graph.js')

const ctx = {
  kernel: {
    project: {
      getConfig,
      listWorkspaces,
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
    const execute = vi.fn().mockResolvedValue({ filesIndexed: 3 })
    createIndexProjectGraph.mockReturnValue({ execute })
    withOpenGraphProvider.mockImplementation(
      async (_ctx: SdkHostContext, fn: (provider: object) => Promise<unknown>) => fn({}),
    )
  })

  it('filters workspaces when a subset is requested', async () => {
    await runIndexProjectGraph(ctx, { workspaces: ['cli'] })
    const execute = createIndexProjectGraph.mock.results[0]?.value.execute as ReturnType<
      typeof vi.fn
    >
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [expect.objectContaining({ name: 'cli' })],
      }),
    )
  })

  it('indexes all workspaces when no filter is provided', async () => {
    await runIndexProjectGraph(ctx, { force: false })
    const execute = createIndexProjectGraph.mock.results[0]?.value.execute as ReturnType<
      typeof vi.fn
    >
    expect(listWorkspaces.execute).toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith(
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
    const execute = createIndexProjectGraph.mock.results[0]?.value.execute as ReturnType<
      typeof vi.fn
    >
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
  })
})
