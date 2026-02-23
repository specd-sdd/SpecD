import { describe, it, expect } from 'vitest'
import { DraftChange } from '../../../src/application/use-cases/draft-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeGitAdapter, makeChange } from './helpers.js'

describe('DraftChange', () => {
  describe('given a change exists', () => {
    it('marks the change as drafted', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeGitAdapter())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.isDrafted).toBe(true)
    })

    it('appends a drafted event to history', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeGitAdapter())

      const result = await uc.execute({ name: 'my-change' })

      const drafted = result.history.find((e) => e.type === 'drafted')
      expect(drafted).toBeDefined()
    })

    it('records the reason when provided', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeGitAdapter())

      const result = await uc.execute({ name: 'my-change', reason: 'waiting for review' })

      const drafted = result.history.find((e) => e.type === 'drafted')
      if (drafted?.type === 'drafted') {
        expect(drafted.reason).toBe('waiting for review')
      }
    })

    it('saves the updated change', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeGitAdapter())

      await uc.execute({ name: 'my-change' })

      expect(repo.store.get('my-change')?.isDrafted).toBe(true)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new DraftChange(repo, makeGitAdapter())

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
