import { describe, it, expect, vi } from 'vitest'
import { ListDrafts } from '../../../src/application/use-cases/list-drafts.js'
import { toDraftedChangeView } from '../../../src/domain/read-only-change-view.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'

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
    a.draft(testActor)
    const b = makeChange('bravo')
    b.draft(testActor)
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDrafts').mockResolvedValue([toDraftedChangeView(a), toDraftedChangeView(b)])
    const uc = new ListDrafts(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })
})
