import { describe, it, expect } from 'vitest'
import { ListChanges } from '../../../src/application/use-cases/list-changes.js'
import { makeChangeRepository, makeChange } from './helpers.js'

describe('ListChanges', () => {
  it('returns empty array when no changes exist', async () => {
    const repo = makeChangeRepository()
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result.items).toEqual([])
    expect(result.meta.total).toBe(0)
  })

  it('returns all changes from repository', async () => {
    const a = makeChange('alpha')
    const b = makeChange('bravo')
    const repo = makeChangeRepository([a, b])
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result.items).toHaveLength(2)
    expect(result.items.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })

  it('returns changes in repository order', async () => {
    const a = makeChange('alpha')
    const b = makeChange('bravo')
    const c = makeChange('charlie')
    const repo = makeChangeRepository([a, b, c])
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result.items.map((ch) => ch.name)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('returns meta with total, count, and limit', async () => {
    const repo = makeChangeRepository([makeChange('alpha'), makeChange('beta')])
    const uc = new ListChanges(repo)

    const result = await uc.execute({ limit: 1, page: 1 })

    expect(result.meta.total).toBe(2)
    expect(result.meta.count).toBe(1)
    expect(result.meta.limit).toBe(1)
    expect(result.meta.page).toBe(1)
  })

  it('omits description unless includeDescription is set', async () => {
    const change = makeChange('with-desc', { description: 'A change' })
    const repo = makeChangeRepository([change])
    const uc = new ListChanges(repo)

    const without = await uc.execute()
    expect(without.items[0]).not.toHaveProperty('description')

    const withDesc = await uc.execute({ includeDescription: true })
    expect(withDesc.items[0]!.description).toBe('A change')
  })
})
