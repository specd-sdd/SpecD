import { describe, it, expect, vi } from 'vitest'
import { ListDiscarded } from '../../../src/application/use-cases/list-discarded.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'
import { toDiscardedChangeListEntry } from '../../../src/infrastructure/fs/change-list-projection.js'

describe('ListDiscarded', () => {
  it('returns empty array when no discarded changes exist', async () => {
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDiscarded').mockResolvedValue({
      items: [],
      meta: { total: 0, count: 0, limit: 100 },
    })
    const uc = new ListDiscarded(repo)

    const result = await uc.execute()

    expect(result.items).toEqual([])
  })

  it('returns all discarded changes from repository', async () => {
    const a = makeChange('alpha')
    a.discard('gone', testActor)
    const b = makeChange('bravo')
    b.discard('gone', testActor)
    const repo = makeChangeRepository()
    const items = [toDiscardedChangeListEntry(a)!, toDiscardedChangeListEntry(b)!]
    vi.spyOn(repo, 'listDiscarded').mockResolvedValue({
      items,
      meta: { total: items.length, count: items.length, limit: 100 },
    })
    const uc = new ListDiscarded(repo)

    const result = await uc.execute()

    expect(result.items).toHaveLength(2)
    expect(result.items.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })

  it('omits optional fields unless include flags are set', async () => {
    const a = makeChange('alpha', { description: 'Discarded alpha' })
    a.discard('No longer needed', testActor, ['replacement'])
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDiscarded').mockImplementation(async (options) => ({
      items: [toDiscardedChangeListEntry(a, options)!],
      meta: { total: 1, count: 1, limit: options?.limit ?? 100 },
    }))
    const uc = new ListDiscarded(repo)

    const without = await uc.execute()
    expect(without.items[0]).not.toHaveProperty('description')
    expect(without.items[0]).not.toHaveProperty('reason')
    expect(without.items[0]).not.toHaveProperty('supersededBy')

    const withFlags = await uc.execute({
      includeDescription: true,
      includeReason: true,
      includeSupersededBy: true,
    })
    expect(withFlags.items[0]!.description).toBe('Discarded alpha')
    expect(withFlags.items[0]!.reason).toBe('No longer needed')
    expect(withFlags.items[0]!.supersededBy).toBe('replacement')
  })
})
