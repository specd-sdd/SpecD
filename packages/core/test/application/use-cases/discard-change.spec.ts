import { describe, it, expect } from 'vitest'
import { DiscardChange } from '../../../src/application/use-cases/discard-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeActorResolver, makeChange } from './helpers.js'

describe('DiscardChange', () => {
  describe('given a change exists', () => {
    it('appends a discarded event to history', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DiscardChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', reason: 'no longer needed' })

      const discarded = result.history.find((e) => e.type === 'discarded')
      expect(discarded).toBeDefined()
    })

    it('records the mandatory reason', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DiscardChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', reason: 'superseded by new approach' })

      const discarded = result.history.find((e) => e.type === 'discarded')
      expect(discarded?.type).toBe('discarded')
      if (discarded?.type !== 'discarded') throw new Error('unreachable')
      expect(discarded.reason).toBe('superseded by new approach')
    })

    it('records supersededBy when provided', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DiscardChange(repo, makeActorResolver())

      const result = await uc.execute({
        name: 'my-change',
        reason: 'replaced',
        supersededBy: ['new-change', 'another-change'],
      })

      const discarded = result.history.find((e) => e.type === 'discarded')
      expect(discarded).toBeDefined()
      if (discarded?.type === 'discarded') {
        expect(discarded.supersededBy).toEqual(['new-change', 'another-change'])
      }
    })

    it('saves the updated change', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DiscardChange(repo, makeActorResolver())

      await uc.execute({ name: 'my-change', reason: 'no longer needed' })

      const saved = repo.store.get('my-change')
      expect(saved?.history.some((e) => e.type === 'discarded')).toBe(true)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new DiscardChange(repo, makeActorResolver())

      await expect(uc.execute({ name: 'missing', reason: 'gone' })).rejects.toThrow(
        ChangeNotFoundError,
      )
    })
  })
})
