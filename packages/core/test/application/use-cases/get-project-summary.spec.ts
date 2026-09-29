import { describe, expect, it, vi } from 'vitest'
import {
  type ActiveChangeListEntry,
  type DraftedChangeListEntry,
} from '../../../src/domain/change-list-entry.js'
import { OverlapEntry } from '../../../src/domain/value-objects/overlap-entry.js'
import { OverlapReport } from '../../../src/domain/value-objects/overlap-report.js'
import { GetProjectSummary } from '../../../src/application/use-cases/get-project-summary.js'
import { type ArchiveRepository } from '../../../src/application/ports/archive-repository.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type DetectOverlap } from '../../../src/application/use-cases/detect-overlap.js'
import { type GetSpecsHealth } from '../../../src/application/use-cases/get-specs-health.js'
import { type ListChanges } from '../../../src/application/use-cases/list-changes.js'
import { type ListDrafts } from '../../../src/application/use-cases/list-drafts.js'
import {
  type ListWorkspaces,
  type ProjectWorkspace,
} from '../../../src/application/use-cases/list-workspaces.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'

function makeEnrichmentDeps() {
  const listChanges = {
    execute: vi.fn().mockResolvedValue({ items: [], meta: { total: 0, count: 0, limit: 0 } }),
  } as unknown as ListChanges
  const listDrafts = {
    execute: vi.fn().mockResolvedValue({ items: [], meta: { total: 0, count: 0, limit: 0 } }),
  } as unknown as ListDrafts
  const countTasks = {
    execute: vi.fn().mockResolvedValue({ total: { incomplete: 0, total: 0 }, byArtifact: {} }),
  } as unknown as CountTasks
  const getSpecsHealth = {
    execute: vi.fn().mockResolvedValue({
      totalSpecs: 0,
      passed: 0,
      failed: 0,
      warned: 0,
      issues: [],
    }),
  } as unknown as GetSpecsHealth
  const detectOverlap = {
    execute: vi.fn().mockResolvedValue(new OverlapReport([])),
  } as unknown as DetectOverlap

  return { listChanges, listDrafts, countTasks, getSpecsHealth, detectOverlap }
}

function makeDeps(overrides: {
  activeCount?: number
  draftCount?: number
  discardedCount?: number
  archivedCount?: number
  workspaces?: Array<{ name: string; count: number }>
}) {
  const changes = {
    count: vi.fn().mockResolvedValue(overrides.activeCount ?? 0),
    countDrafts: vi.fn().mockResolvedValue(overrides.draftCount ?? 0),
    countDiscarded: vi.fn().mockResolvedValue(overrides.discardedCount ?? 0),
    get: vi.fn(),
    getDraft: vi.fn(),
  } as unknown as ChangeRepository
  const archive = {
    count: vi.fn().mockResolvedValue(overrides.archivedCount ?? 0),
  } as unknown as ArchiveRepository
  const listWorkspaces = {
    execute: vi.fn().mockResolvedValue(
      (overrides.workspaces ?? []).map((ws) => ({
        name: ws.name,
        prefix: null,
        codeRoot: `/project/${ws.name}`,
        isExternal: false,
        ownership: 'owned' as const,
        specRepo: { count: vi.fn().mockResolvedValue(ws.count) },
      })),
    ),
  } as unknown as ListWorkspaces
  const enrichment = makeEnrichmentDeps()

  return { changes, archive, listWorkspaces, ...enrichment }
}

function createUseCase(deps: ReturnType<typeof makeDeps>): GetProjectSummary {
  return new GetProjectSummary(
    deps.changes,
    deps.archive,
    deps.listWorkspaces,
    deps.listChanges,
    deps.listDrafts,
    deps.countTasks,
    deps.getSpecsHealth,
    deps.detectOverlap,
  )
}

describe('GetProjectSummary', () => {
  it('returns count-only summary without entities', async () => {
    const deps = makeDeps({
      activeCount: 1,
      draftCount: 1,
      discardedCount: 1,
      archivedCount: 2,
      workspaces: [
        { name: 'default', count: 3 },
        { name: 'core', count: 10 },
      ],
    })
    const uc = createUseCase(deps)

    const result = await uc.execute()

    expect(result).toEqual({
      activeCount: 1,
      draftCount: 1,
      discardedCount: 1,
      archivedCount: 2,
      specsByWorkspace: { default: 3, core: 10 },
      workspaceCount: 2,
    })
    expect(deps.listChanges.execute).not.toHaveBeenCalled()
    expect(deps.listDrafts.execute).not.toHaveBeenCalled()
    expect(deps.countTasks.execute).not.toHaveBeenCalled()
    expect(deps.getSpecsHealth.execute).not.toHaveBeenCalled()
  })

  it('given change counts are still pending, when workspaces resolve, then spec counts start', async () => {
    let releaseActiveCount: (value: number) => void = () => {
      throw new Error('active count release was not installed')
    }
    const activeCount = new Promise<number>((resolve) => {
      releaseActiveCount = resolve
    })
    const specCount = vi.fn().mockResolvedValue(2)
    const deps = makeDeps({ workspaces: [{ name: 'core', count: 2 }] })
    ;(deps.changes.count as unknown as ReturnType<typeof vi.fn>).mockReturnValue(activeCount)
    ;(deps.listWorkspaces.execute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'core',
        prefix: null,
        codeRoot: '/project/core',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: specCount } as unknown as SpecRepository,
      },
    ] satisfies ProjectWorkspace[])

    const pending = createUseCase(deps).execute()
    await vi.waitFor(() => {
      expect(specCount).toHaveBeenCalled()
    })

    releaseActiveCount(4)
    await expect(pending).resolves.toMatchObject({
      activeCount: 4,
      specsByWorkspace: { core: 2 },
      workspaceCount: 1,
    })
  })

  it('uses archive count() instead of paginated list length', async () => {
    const deps = makeDeps({ archivedCount: 42 })
    const uc = createUseCase(deps)

    const result = await uc.execute()

    expect(result.archivedCount).toBe(42)
    expect(deps.archive.count).toHaveBeenCalled()
  })

  it('derives draftCount from ChangeRepository.countDrafts()', async () => {
    const deps = makeDeps({ draftCount: 2 })
    const uc = createUseCase(deps)

    expect((await uc.execute()).draftCount).toBe(2)
    expect(deps.changes.countDrafts).toHaveBeenCalled()
  })

  it('derives discardedCount from ChangeRepository.countDiscarded()', async () => {
    const deps = makeDeps({ discardedCount: 1 })
    const uc = createUseCase(deps)

    expect((await uc.execute()).discardedCount).toBe(1)
    expect(deps.changes.countDiscarded).toHaveBeenCalled()
  })

  it('runs independent count operations concurrently', async () => {
    const order: string[] = []
    const changes = {
      count: vi.fn(async () => {
        order.push('active-start')
        await Promise.resolve()
        order.push('active-end')
        return 0
      }),
      countDrafts: vi.fn(async () => {
        order.push('drafts-start')
        await Promise.resolve()
        order.push('drafts-end')
        return 0
      }),
      countDiscarded: vi.fn(async () => {
        order.push('discarded-start')
        await Promise.resolve()
        order.push('discarded-end')
        return 0
      }),
      get: vi.fn(),
      getDraft: vi.fn(),
    } as unknown as ChangeRepository
    const archive = {
      count: vi.fn(async () => {
        order.push('archived-start')
        await Promise.resolve()
        order.push('archived-end')
        return 0
      }),
    } as unknown as ArchiveRepository
    const listWorkspaces = {
      execute: vi.fn(async () => {
        order.push('workspaces-start')
        await Promise.resolve()
        order.push('workspaces-end')
        return []
      }),
    } as unknown as ListWorkspaces
    const enrichment = makeEnrichmentDeps()

    const uc = new GetProjectSummary(
      changes,
      archive,
      listWorkspaces,
      enrichment.listChanges,
      enrichment.listDrafts,
      enrichment.countTasks,
      enrichment.getSpecsHealth,
      enrichment.detectOverlap,
    )
    await uc.execute()

    expect(order.filter((e) => e.endsWith('-start')).length).toBe(5)
    expect(order.indexOf('active-start')).toBeLessThan(order.indexOf('active-end'))
    expect(order.indexOf('drafts-start')).toBeLessThan(order.indexOf('drafts-end'))
  })

  it('uses ChangeRepository.count() for active totals', async () => {
    const deps = makeDeps({
      activeCount: 1,
      workspaces: [{ name: 'default', count: 1 }],
    })
    const uc = createUseCase(deps)
    const summary = await uc.execute()
    expect(summary.activeCount).toBe(1)
    expect(deps.changes.count).toHaveBeenCalled()
  })

  it('includeChanges builds active and drafts with task totals', async () => {
    const deps = makeDeps({ workspaces: [] })
    const activeChange = { name: 'active-one', getArtifact: vi.fn() }
    const draftView = { name: 'draft-one', artifacts: new Map() }
    vi.mocked(deps.listChanges.execute).mockResolvedValue({
      items: [{ name: 'active-one', state: 'implementing' } as ActiveChangeListEntry],
      meta: { total: 1, count: 1, limit: 1 },
    })
    vi.mocked(deps.listDrafts.execute).mockResolvedValue({
      items: [{ name: 'draft-one', state: 'drafted' } as DraftedChangeListEntry],
      meta: { total: 1, count: 1, limit: 1 },
    })
    vi.mocked(deps.changes.get).mockResolvedValue(activeChange as never)
    vi.mocked(deps.changes.getDraft).mockResolvedValue(draftView as never)
    vi.mocked(deps.countTasks.execute)
      .mockResolvedValueOnce({
        total: { incomplete: 2, total: 5, complete: 3 },
        byArtifact: {},
      })
      .mockResolvedValueOnce({
        total: { incomplete: 1, total: 3, complete: 2 },
        byArtifact: {},
      })

    const result = await createUseCase(deps).execute({ includeChanges: true })

    expect(result.active).toEqual([
      { name: 'active-one', state: 'implementing', tasks: { incomplete: 2, total: 5 } },
    ])
    expect(result.drafts).toEqual([
      { name: 'draft-one', state: 'drafted', tasks: { incomplete: 1, total: 3 } },
    ])
    expect(deps.getSpecsHealth.execute).not.toHaveBeenCalled()
  })

  it('includeChanges with empty buckets returns empty arrays', async () => {
    const deps = makeDeps({ workspaces: [] })
    const result = await createUseCase(deps).execute({ includeChanges: true })

    expect(result.active).toEqual([])
    expect(result.drafts).toEqual([])
  })

  it('includeSpecsHealth embeds health result', async () => {
    const deps = makeDeps({ workspaces: [] })
    const health = {
      totalSpecs: 10,
      passed: 8,
      failed: 1,
      warned: 1,
      issues: [{ spec: 'core:foo', passed: false, failures: [], warnings: [] }],
    }
    vi.mocked(deps.getSpecsHealth.execute).mockResolvedValue(health)

    const result = await createUseCase(deps).execute({ includeSpecsHealth: true })

    expect(result.specsHealth).toEqual(health)
    expect(deps.listChanges.execute).not.toHaveBeenCalled()
    expect(deps.countTasks.execute).not.toHaveBeenCalled()
  })

  it('includeChanges false omits listing keys and skips CountTasks', async () => {
    const deps = makeDeps({ workspaces: [] })
    const result = await createUseCase(deps).execute({ includeChanges: false })

    expect(result.active).toBeUndefined()
    expect(result.drafts).toBeUndefined()
    expect(deps.countTasks.execute).not.toHaveBeenCalled()
  })

  it('given two active changes share a spec, when includeOverlaps is true, then the unfiltered overlap report is returned', async () => {
    const deps = makeDeps({ workspaces: [] })
    const report = new OverlapReport([
      new OverlapEntry('core:get-project-summary', [
        { name: 'alpha', state: 'designing' },
        { name: 'beta', state: 'implementing' },
      ]),
    ])
    vi.mocked(deps.detectOverlap.execute).mockResolvedValue(report)

    const result = await createUseCase(deps).execute({ includeOverlaps: true })

    expect(deps.detectOverlap.execute).toHaveBeenCalledWith()
    expect(result.overlaps).toBe(report)
    expect(result.overlaps?.hasOverlap).toBe(true)
  })

  it('given includeOverlaps is false or omitted, when execute runs, then overlaps is absent and DetectOverlap is not called', async () => {
    const deps = makeDeps({ workspaces: [] })

    const omitted = await createUseCase(deps).execute()
    const disabled = await createUseCase(deps).execute({ includeOverlaps: false })

    expect(omitted).not.toHaveProperty('overlaps')
    expect(disabled).not.toHaveProperty('overlaps')
    expect(deps.detectOverlap.execute).not.toHaveBeenCalled()
  })

  it('given GetSpecsHealth reports a spec that is also in an active change, when includeSpecsHealth is true, then specsHealth still includes that spec', async () => {
    const deps = makeDeps({ workspaces: [] })
    const health = {
      totalSpecs: 2,
      passed: 1,
      failed: 1,
      warned: 0,
      issues: [
        {
          spec: 'core:get-project-summary',
          passed: false,
          failures: [{ artifactId: 'spec', description: 'broken' }],
          warnings: [],
        },
      ],
    }
    vi.mocked(deps.getSpecsHealth.execute).mockResolvedValue(health)

    const result = await createUseCase(deps).execute({
      includeSpecsHealth: true,
      includeOverlaps: true,
    })

    expect(deps.getSpecsHealth.execute).toHaveBeenCalledWith({})
    expect(result.specsHealth).toEqual(health)
    expect(
      result.specsHealth?.issues.some((issue) => issue.spec === 'core:get-project-summary'),
    ).toBe(true)
  })

  it('given DetectOverlap returns an empty report, when includeOverlaps is true, then overlaps is present with hasOverlap false', async () => {
    const deps = makeDeps({ workspaces: [] })
    const report = new OverlapReport([])
    vi.mocked(deps.detectOverlap.execute).mockResolvedValue(report)

    const result = await createUseCase(deps).execute({ includeOverlaps: true })

    expect(result.overlaps).toBe(report)
    expect(result.overlaps?.entries).toEqual([])
    expect(result.overlaps?.hasOverlap).toBe(false)
  })
})
