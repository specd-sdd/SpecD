import { describe, it, expect } from 'vitest'
import { ListChanges } from '../../../src/application/use-cases/list-changes.js'
import { makeChangeRepository, makeChange } from './helpers.js'

describe('ListChanges', () => {
  it('returns empty array when no changes exist', async () => {
    const repo = makeChangeRepository()
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result).toEqual([])
  })

  it('returns all changes from repository', async () => {
    const a = makeChange('alpha')
    const b = makeChange('bravo')
    const repo = makeChangeRepository([a, b])
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })

  it('returns changes in repository order', async () => {
    const a = makeChange('alpha')
    const b = makeChange('bravo')
    const c = makeChange('charlie')
    const repo = makeChangeRepository([a, b, c])
    const uc = new ListChanges(repo)

    const result = await uc.execute()

    expect(result.map((ch) => ch.name)).toEqual(['alpha', 'bravo', 'charlie'])
  })
})
