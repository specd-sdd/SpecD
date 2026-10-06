import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SdkHostContext } from '../../src/composition/host-context.js'

const getProjectSummary = { execute: vi.fn() }
const getConfig = { execute: vi.fn() }
const listWorkspaces = { execute: vi.fn() }
const createGetGraphHealth = vi.fn()
const withOpenGraphProvider = vi.fn()

vi.mock('../../src/composition/with-open-graph-provider.js', () => ({
  withOpenGraphProvider,
}))

vi.mock('@specd/code-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/code-graph')>()
  return {
    ...actual,
    createGetGraphHealth,
  }
})

const { buildProjectStatusSnapshot } =
  await import('../../src/orchestration/build-project-status-snapshot.js')

const ctx = {
  kernel: {
    project: {
      getProjectSummary,
      getConfig,
      listWorkspaces,
    },
  },
} as unknown as SdkHostContext

describe('buildProjectStatusSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProjectSummary.execute.mockResolvedValue({ activeCount: 1 })
    getConfig.execute.mockReturnValue({
      approvals: { spec: true, signoff: false },
      llmOptimizedContext: true,
    })
    listWorkspaces.execute.mockResolvedValue([{ name: 'core' }])
    createGetGraphHealth.mockReturnValue({
      execute: vi.fn().mockResolvedValue({ fileCount: 10, stale: false }),
    })
    withOpenGraphProvider.mockImplementation(
      async (
        _ctx: SdkHostContext,
        fn: (provider: { getHotspots: () => Promise<unknown> }) => Promise<void>,
      ) => {
        await fn({ getHotspots: vi.fn().mockResolvedValue({ entries: [] }) })
      },
    )
  })

  it('skips graph provider when includeGraph is false', async () => {
    const result = await buildProjectStatusSnapshot(ctx, { includeGraph: false })
    expect(withOpenGraphProvider).not.toHaveBeenCalled()
    expect(getProjectSummary.execute).toHaveBeenCalledWith(undefined)
    expect(result.graphHealth).toBeNull()
    expect(result.approvals.specEnabled).toBe(true)
    expect(result.llmOptimizedContext).toBe(true)
  })

  it('loads graph health when includeGraph is true', async () => {
    const result = await buildProjectStatusSnapshot(ctx, { includeGraph: true })
    expect(withOpenGraphProvider).toHaveBeenCalled()
    expect(createGetGraphHealth).toHaveBeenCalled()
    const getGraphHealth = createGetGraphHealth.mock.results[0]?.value as {
      execute: ReturnType<typeof vi.fn>
    }
    const codeGraphPackageJson = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../code-graph/package.json'),
        'utf8',
      ),
    ) as { version: string }

    expect(getGraphHealth.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        codeGraphVersion: codeGraphPackageJson.version,
        workspaces: [{ name: 'core' }],
      }),
    )
    expect(result.graphHealth).toEqual({ fileCount: 10, stale: false })
  })

  it('includes hotspots when includeHotspots is true', async () => {
    const hotspotData = { entries: [{ symbol: 'foo' }] }
    withOpenGraphProvider.mockImplementation(
      async (
        _ctx: SdkHostContext,
        fn: (provider: { getHotspots: () => Promise<unknown> }) => Promise<void>,
      ) => {
        await fn({ getHotspots: vi.fn().mockResolvedValue(hotspotData) })
      },
    )
    const result = await buildProjectStatusSnapshot(ctx, {
      includeGraph: true,
      includeHotspots: true,
    })
    expect(result.hotspots).toEqual(hotspotData)
  })

  it('degrades graph health when hotspot loading fails', async () => {
    withOpenGraphProvider.mockImplementation(
      async (
        _ctx: SdkHostContext,
        fn: (provider: { getHotspots: () => Promise<unknown> }) => Promise<void>,
      ) => {
        await fn({ getHotspots: vi.fn().mockRejectedValue(new Error('hotspots failed')) })
      },
    )

    const result = await buildProjectStatusSnapshot(ctx, {
      includeGraph: true,
      includeHotspots: true,
    })

    expect(result.graphHealth).toBeNull()
    expect(result.hotspots).toBeNull()
  })

  it('returns null graphHealth when graph loading fails', async () => {
    withOpenGraphProvider.mockRejectedValue(new Error('graph open failed'))
    const result = await buildProjectStatusSnapshot(ctx, { includeGraph: true })
    expect(result.graphHealth).toBeNull()
    expect(result.summary).toEqual({ activeCount: 1 })
  })

  it('forwards enrichment flags into getProjectSummary.execute', async () => {
    await buildProjectStatusSnapshot(ctx, {
      includeChanges: true,
      includeSpecsHealth: true,
    })

    expect(getProjectSummary.execute).toHaveBeenCalledWith({
      includeChanges: true,
      includeSpecsHealth: true,
    })
  })

  it('keeps enriched fields only under summary', async () => {
    getProjectSummary.execute.mockResolvedValue({
      activeCount: 1,
      draftCount: 0,
      discardedCount: 0,
      archivedCount: 0,
      specsByWorkspace: {},
      workspaceCount: 0,
      active: [{ name: 'foo', state: 'ready', tasks: { incomplete: 1, total: 2 } }],
      specsHealth: { totalSpecs: 1, passed: 1, failed: 0, warned: 0, issues: [] },
    })

    const result = await buildProjectStatusSnapshot(ctx, {
      includeChanges: true,
      includeSpecsHealth: true,
    })

    expect(result.summary.active).toHaveLength(1)
    expect(result.summary.specsHealth?.passed).toBe(1)
    expect(result).not.toHaveProperty('active')
    expect(result).not.toHaveProperty('specsHealth')
  })

  it('given includeOverlaps is true, when the snapshot is built, then the flag is forwarded and overlaps stay under summary', async () => {
    const overlaps = {
      hasOverlap: false,
      entries: [],
    }
    getProjectSummary.execute.mockResolvedValue({
      activeCount: 1,
      draftCount: 0,
      discardedCount: 0,
      archivedCount: 0,
      specsByWorkspace: {},
      workspaceCount: 0,
      overlaps,
    })

    const result = await buildProjectStatusSnapshot(ctx, { includeOverlaps: true })

    expect(getProjectSummary.execute).toHaveBeenCalledWith({ includeOverlaps: true })
    expect(result.summary.overlaps).toBe(overlaps)
    expect(result).not.toHaveProperty('overlaps')
  })

  it('given no summary flags, when the snapshot is built, then getProjectSummary stays count-only', async () => {
    await buildProjectStatusSnapshot(ctx, {})

    expect(getProjectSummary.execute).toHaveBeenCalledWith(undefined)
  })

  it('given all summary flags, when the snapshot is built, then enriched fields stay only under summary', async () => {
    const overlaps = { hasOverlap: false, entries: [] }
    getProjectSummary.execute.mockResolvedValue({
      activeCount: 1,
      draftCount: 0,
      discardedCount: 0,
      archivedCount: 0,
      specsByWorkspace: {},
      workspaceCount: 0,
      active: [{ name: 'foo', state: 'ready', tasks: { incomplete: 1, total: 2 } }],
      drafts: [],
      specsHealth: { totalSpecs: 1, passed: 1, failed: 0, warned: 0, issues: [] },
      overlaps,
    })

    const result = await buildProjectStatusSnapshot(ctx, {
      includeChanges: true,
      includeSpecsHealth: true,
      includeOverlaps: true,
    })

    expect(getProjectSummary.execute).toHaveBeenCalledWith({
      includeChanges: true,
      includeSpecsHealth: true,
      includeOverlaps: true,
    })
    expect(result.summary.active).toHaveLength(1)
    expect(result.summary.drafts).toEqual([])
    expect(result.summary.specsHealth?.passed).toBe(1)
    expect(result.summary.overlaps).toBe(overlaps)
    expect(result).not.toHaveProperty('overlaps')
    expect(result).not.toHaveProperty('active')
    expect(result).not.toHaveProperty('specsHealth')
  })
})
