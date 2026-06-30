import { describe, expect, it, vi } from 'vitest'
import { GetProjectSummary } from '../../../src/application/use-cases/get-project-summary.js'
import { type ListArchived } from '../../../src/application/use-cases/list-archived.js'
import { type ListChanges } from '../../../src/application/use-cases/list-changes.js'
import { type ListDiscarded } from '../../../src/application/use-cases/list-discarded.js'
import { type ListDrafts } from '../../../src/application/use-cases/list-drafts.js'
import { type ListWorkspaces } from '../../../src/application/use-cases/list-workspaces.js'
import { makeChange } from './helpers.js'

function makeListUseCases(overrides: {
  active?: unknown[]
  drafts?: unknown[]
  discarded?: unknown[]
  archivedTotal?: number
  archivedItems?: unknown[]
  workspaces?: Array<{ name: string; count: number }>
}) {
  const listChanges = {
    execute: vi.fn().mockResolvedValue(overrides.active ?? []),
  } as unknown as ListChanges
  const listDrafts = {
    execute: vi.fn().mockResolvedValue(overrides.drafts ?? []),
  } as unknown as ListDrafts
  const listDiscarded = {
    execute: vi.fn().mockResolvedValue(overrides.discarded ?? []),
  } as unknown as ListDiscarded
  const listArchived = {
    execute: vi.fn().mockResolvedValue({
      items: overrides.archivedItems ?? [],
      meta: {
        total: overrides.archivedTotal ?? 0,
        count: overrides.archivedItems?.length ?? 0,
        limit: 100,
      },
    }),
  } as unknown as ListArchived
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

  return { listChanges, listDrafts, listDiscarded, listArchived, listWorkspaces }
}

describe('GetProjectSummary', () => {
  it('returns count-only summary without entities', async () => {
    const deps = makeListUseCases({
      active: [makeChange('alpha')],
      drafts: [makeChange('draft-a')],
      discarded: [makeChange('disc-a')],
      archivedTotal: 2,
      archivedItems: [{ name: 'arch-a' }],
      workspaces: [
        { name: 'default', count: 3 },
        { name: 'core', count: 10 },
      ],
    })
    const uc = new GetProjectSummary(
      deps.listChanges,
      deps.listDrafts,
      deps.listDiscarded,
      deps.listArchived,
      deps.listWorkspaces,
    )

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

  it('uses archived meta.total instead of items.length', async () => {
    const deps = makeListUseCases({
      archivedTotal: 42,
      archivedItems: [{ name: 'only-one-page-item' }],
    })
    const uc = new GetProjectSummary(
      deps.listChanges,
      deps.listDrafts,
      deps.listDiscarded,
      deps.listArchived,
      deps.listWorkspaces,
    )

    const result = await uc.execute()

    expect(result.archivedCount).toBe(42)
  })

  it('derives draftCount from ListDrafts result length', async () => {
    const deps = makeListUseCases({
      drafts: [makeChange('draft-a'), makeChange('draft-b')],
    })
    const uc = new GetProjectSummary(
      deps.listChanges,
      deps.listDrafts,
      deps.listDiscarded,
      deps.listArchived,
      deps.listWorkspaces,
    )

    expect((await uc.execute()).draftCount).toBe(2)
  })

  it('derives discardedCount from ListDiscarded result length', async () => {
    const deps = makeListUseCases({
      discarded: [makeChange('disc-a')],
    })
    const uc = new GetProjectSummary(
      deps.listChanges,
      deps.listDrafts,
      deps.listDiscarded,
      deps.listArchived,
      deps.listWorkspaces,
    )

    expect((await uc.execute()).discardedCount).toBe(1)
  })

  it('runs independent list operations concurrently', async () => {
    const order: string[] = []
    const listChanges = {
      execute: vi.fn(async () => {
        order.push('changes-start')
        await Promise.resolve()
        order.push('changes-end')
        return []
      }),
    } as unknown as ListChanges
    const listDrafts = {
      execute: vi.fn(async () => {
        order.push('drafts-start')
        await Promise.resolve()
        order.push('drafts-end')
        return []
      }),
    } as unknown as ListDrafts
    const listDiscarded = {
      execute: vi.fn(async () => {
        order.push('discarded-start')
        await Promise.resolve()
        order.push('discarded-end')
        return []
      }),
    } as unknown as ListDiscarded
    const listArchived = {
      execute: vi.fn(async () => {
        order.push('archived-start')
        await Promise.resolve()
        order.push('archived-end')
        return { items: [], meta: { total: 0, count: 0, limit: 100 } }
      }),
    } as unknown as ListArchived
    const listWorkspaces = {
      execute: vi.fn(async () => {
        order.push('workspaces-start')
        await Promise.resolve()
        order.push('workspaces-end')
        return []
      }),
    } as unknown as ListWorkspaces

    const uc = new GetProjectSummary(
      listChanges,
      listDrafts,
      listDiscarded,
      listArchived,
      listWorkspaces,
    )
    await uc.execute()

    expect(order.filter((e) => e.endsWith('-start')).length).toBe(5)
    expect(order.indexOf('changes-start')).toBeLessThan(order.indexOf('changes-end'))
    expect(order.indexOf('drafts-start')).toBeLessThan(order.indexOf('drafts-end'))
  })
})
