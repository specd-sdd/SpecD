import { describe, it, expect, vi } from 'vitest'
import { DraftChange } from '../../../src/application/use-cases/draft-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { HistoricalImplementationGuardError } from '../../../src/domain/errors/historical-implementation-guard-error.js'
import { makeChangeRepository, makeActorResolver, makeChange } from './helpers.js'

describe('DraftChange', () => {
  describe('given a change exists', () => {
    it('marks the change as drafted', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.isDrafted).toBe(true)
    })

    it('appends a drafted event to history', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      const drafted = result.history.find((e) => e.type === 'drafted')
      expect(drafted).toBeDefined()
    })

    it('records the reason when provided', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', reason: 'waiting for review' })

      const drafted = result.history.find((e) => e.type === 'drafted')
      expect(drafted?.type).toBe('drafted')
      if (drafted?.type !== 'drafted') throw new Error('unreachable')
      expect(drafted.reason).toBe('waiting for review')
    })

    it('saves the updated change', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      await uc.execute({ name: 'my-change' })

      expect(repo.store.get('my-change')?.isDrafted).toBe(true)
    })

    it('persists through ChangeRepository.mutate', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = new DraftChange(repo, makeActorResolver())

      await uc.execute({ name: 'my-change' })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new DraftChange(repo, makeActorResolver())

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('historical implementation guard', () => {
    it('rejects drafting a change that has previously reached implementing without force', async () => {
      const change = makeChange('my-change')
      change.transition('designing', { name: 'User', email: 'user@example.com' })
      change.transition('ready', { name: 'User', email: 'user@example.com' })
      change.transition('implementing', { name: 'User', email: 'user@example.com' })
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(
        HistoricalImplementationGuardError,
      )
    })

    it('allows drafting with force when change has previously reached implementing', async () => {
      const change = makeChange('my-change')
      change.transition('designing', { name: 'User', email: 'user@example.com' })
      change.transition('ready', { name: 'User', email: 'user@example.com' })
      change.transition('implementing', { name: 'User', email: 'user@example.com' })
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', force: true })

      expect(result.isDrafted).toBe(true)
      expect(result.history.some((e) => e.type === 'drafted')).toBe(true)
    })

    it('allows drafting without force when change has never reached implementing', async () => {
      const change = makeChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new DraftChange(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.isDrafted).toBe(true)
    })
  })
})
