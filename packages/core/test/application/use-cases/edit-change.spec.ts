import { describe, it, expect } from 'vitest'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { EmptySpecIdsError } from '../../../src/application/errors/empty-spec-ids-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { makeChangeRepository, makeGitAdapter, makeChange } from './helpers.js'

/** Stub that derives workspace from the first segment of each spec ID. */
function deriveWorkspaces(specIds: readonly string[]): string[] {
  const set = new Set(specIds.map((id) => id.split('/')[0] ?? 'default'))
  return [...set]
}

describe('EditChange', () => {
  describe('adding spec IDs', () => {
    it('adds spec IDs to the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.change.specIds).toContain('auth/login')
      expect(result.change.specIds).toContain('billing/pay')
    })

    it('does not duplicate spec IDs already present', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['auth/login'] })

      expect(result.change.specIds).toEqual(['auth/login'])
      expect(result.invalidated).toBe(false)
    })
  })

  describe('removing spec IDs', () => {
    it('removes spec IDs from the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'billing/pay'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay'] })

      expect(result.change.specIds).toEqual(['auth/login'])
    })

    it('throws SpecNotInChangeError when removing a spec not in the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      await expect(
        uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay'] }),
      ).rejects.toThrow(SpecNotInChangeError)
    })
  })

  describe('when the change does not exist', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      await expect(uc.execute({ name: 'missing', addSpecIds: ['auth/login'] })).rejects.toThrow(
        ChangeNotFoundError,
      )
    })
  })

  describe('when the edit would leave specIds empty', () => {
    it('throws EmptySpecIdsError', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      await expect(
        uc.execute({ name: 'my-change', removeSpecIds: ['auth/login'] }),
      ).rejects.toThrow(EmptySpecIdsError)
    })
  })

  describe('saving', () => {
    it('saves the updated change to the repository', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      const saved = repo.store.get('my-change')
      expect(saved).toBeDefined()
      expect(saved!.specIds).toContain('billing/pay')
    })
  })

  describe('invalidation', () => {
    it('returns invalidated=true when specIds actually changed', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.invalidated).toBe(true)
    })

    it('returns invalidated=false when no add or remove is provided', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change' })

      expect(result.invalidated).toBe(false)
    })

    it('returns invalidated=false when specIds did not change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, makeGitAdapter(), deriveWorkspaces)

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['auth/login'] })

      expect(result.invalidated).toBe(false)
    })
  })
})
