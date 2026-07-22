import { describe, expect, it, vi } from 'vitest'
import { GetProjectSummary } from '../../../src/application/use-cases/get-project-summary.js'
import { type ArchiveRepository } from '../../../src/application/ports/archive-repository.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type ListWorkspaces } from '../../../src/application/use-cases/list-workspaces.js'

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

  return { changes, archive, listWorkspaces }
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
    const uc = new GetProjectSummary(deps.changes, deps.archive, deps.listWorkspaces)

    const result = await uc.execute()

    expect(result).toEqual({
      activeCount: 1,
      draftCount: 1,
      discardedCount: 1,
      archivedCount: 2,
      specsByWorkspace: { default: 3, core: 10 },
      workspaceCount: 2,
    })
  })

  it('uses archive count() instead of paginated list length', async () => {
    const deps = makeDeps({ archivedCount: 42 })
    const uc = new GetProjectSummary(deps.changes, deps.archive, deps.listWorkspaces)

    const result = await uc.execute()

    expect(result.archivedCount).toBe(42)
    expect(deps.archive.count).toHaveBeenCalled()
  })

  it('derives draftCount from ChangeRepository.countDrafts()', async () => {
    const deps = makeDeps({ draftCount: 2 })
    const uc = new GetProjectSummary(deps.changes, deps.archive, deps.listWorkspaces)

    expect((await uc.execute()).draftCount).toBe(2)
    expect(deps.changes.countDrafts).toHaveBeenCalled()
  })

  it('derives discardedCount from ChangeRepository.countDiscarded()', async () => {
    const deps = makeDeps({ discardedCount: 1 })
    const uc = new GetProjectSummary(deps.changes, deps.archive, deps.listWorkspaces)

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

    const uc = new GetProjectSummary(changes, archive, listWorkspaces)
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
    const uc = new GetProjectSummary(deps.changes, deps.archive, deps.listWorkspaces)
    const summary = await uc.execute()
    expect(summary.activeCount).toBe(1)
    expect(deps.changes.count).toHaveBeenCalled()
  })
})
