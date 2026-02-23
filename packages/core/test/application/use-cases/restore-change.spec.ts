import { describe, it, expect } from 'vitest'
import { RestoreChange } from '../../../src/application/use-cases/restore-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeGitAdapter, makeChange, testActor } from './helpers.js'

describe('RestoreChange', () => {
  describe('given a drafted change exists', () => {
    it('marks the change as not drafted', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeGitAdapter())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.isDrafted).toBe(false)
    })

    it('appends a restored event to history', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeGitAdapter())

      const result = await uc.execute({ name: 'my-change' })

      const restored = result.history.find((e) => e.type === 'restored')
      expect(restored).toBeDefined()
    })

    it('saves the updated change', async () => {
      const change = makeChange('my-change')
      change.draft(testActor)
      const repo = makeChangeRepository([change])
      const uc = new RestoreChange(repo, makeGitAdapter())

      await uc.execute({ name: 'my-change' })

      expect(repo.store.get('my-change')?.isDrafted).toBe(false)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new RestoreChange(repo, makeGitAdapter())

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
