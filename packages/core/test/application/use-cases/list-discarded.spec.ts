import { describe, it, expect, vi } from 'vitest'
import { ListDiscarded } from '../../../src/application/use-cases/list-discarded.js'
import { toDiscardedChangeView } from '../../../src/domain/read-only-change-view.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'

describe('ListDiscarded', () => {
  it('returns empty array when no discarded changes exist', async () => {
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDiscarded').mockResolvedValue([])
    const uc = new ListDiscarded(repo)

    const result = await uc.execute()

    expect(result).toEqual([])
  })

  it('returns all discarded changes from repository', async () => {
    const a = makeChange('alpha')
    a.discard('gone', testActor)
    const b = makeChange('bravo')
    b.discard('gone', testActor)
    const repo = makeChangeRepository()
    vi.spyOn(repo, 'listDiscarded').mockResolvedValue([
      toDiscardedChangeView(a),
      toDiscardedChangeView(b),
    ])
    const uc = new ListDiscarded(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })
})
