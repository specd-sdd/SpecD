import { describe, it, expect, vi } from 'vitest'
import { ListDrafts } from '../../../src/application/use-cases/list-drafts.js'
import { makeChangeRepository, makeChange } from './helpers.js'

describe('ListDrafts', () => {
  it('returns empty array when no drafts exist', async () => {
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDrafts').mockResolvedValue([])
    const uc = new ListDrafts(repo)

    const result = await uc.execute()

    expect(result).toEqual([])
  })

  it('returns all drafts from repository', async () => {
    const a = makeChange('alpha')
    const b = makeChange('bravo')
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDrafts').mockResolvedValue([a, b])
    const uc = new ListDrafts(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })
})
