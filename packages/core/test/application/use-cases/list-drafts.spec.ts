import { describe, it, expect, vi } from 'vitest'
import { ListDrafts } from '../../../src/application/use-cases/list-drafts.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'
import { toDraftedChangeListEntry } from '../../../src/infrastructure/fs/change-list-projection.js'

describe('ListDrafts', () => {
  it('returns empty array when no drafts exist', async () => {
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDrafts').mockResolvedValue({
      items: [],
      meta: { total: 0, count: 0, limit: 100 },
    })
    const uc = new ListDrafts(repo)

    const result = await uc.execute()

    expect(result.items).toEqual([])
  })

  it('returns all drafts from repository', async () => {
    const a = makeChange('alpha')
    a.draft(testActor)
    const b = makeChange('bravo')
    b.draft(testActor)
    const repo = makeChangeRepository()
    const items = [toDraftedChangeListEntry(a)!, toDraftedChangeListEntry(b)!]
    vi.spyOn(repo, 'listDrafts').mockResolvedValue({
      items,
      meta: { total: items.length, count: items.length, limit: 100 },
    })
    const uc = new ListDrafts(repo)

    const result = await uc.execute()

    expect(result.items).toHaveLength(2)
    expect(result.items.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })

  it('omits optional fields unless include flags are set', async () => {
    const a = makeChange('alpha', { description: 'Draft alpha' })
    a.draft(testActor, 'Because alpha')
    const repo = makeChangeRepository()
    const entry = toDraftedChangeListEntry(a, {
      includeDescription: true,
      includeReason: true,
    })!
    vi.spyOn(repo, 'listDrafts').mockImplementation(async (options) => ({
      items: [toDraftedChangeListEntry(a, options)!],
      meta: { total: 1, count: 1, limit: options?.limit ?? 100 },
    }))
    const uc = new ListDrafts(repo)

    const without = await uc.execute()
    expect(without.items[0]).not.toHaveProperty('description')
    expect(without.items[0]).not.toHaveProperty('reason')

    const withFlags = await uc.execute({ includeDescription: true, includeReason: true })
    expect(withFlags.items[0]!.description).toBe('Draft alpha')
    expect(withFlags.items[0]!.reason).toBe('Because alpha')
  })
})
