import { describe, it, expect, vi } from 'vitest'
import { RestoreChange } from '../../../src/application/use-cases/restore-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeActorResolver, makeChange, testActor } from './helpers.js'

describe('RestoreChange', () => {
  describe('given a drafted change exists', () => {
    it('marks the change as not drafted', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.isDrafted).toBe(false)
    })

    it('appends a restored event to history', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      const restored = result.history.find((e) => e.type === 'restored')
      expect(restored).toBeDefined()
    })

    it('saves the updated change', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeActorResolver())

      await uc.execute({ name: 'my-change' })

      expect(repo.store.get('my-change')?.isDrafted).toBe(false)
    })

    it('persists through ChangeRepository.mutate', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = new RestoreChange(repo, makeActorResolver())

      await uc.execute({ name: 'my-change' })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new RestoreChange(repo, makeActorResolver())

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
