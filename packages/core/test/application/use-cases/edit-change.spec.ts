import { describe, it, expect } from 'vitest'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  testActor,
  makeListWorkspaces,
} from './helpers.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'

function createEditChange(
  repo = makeChangeRepository(),
  specs: Map<string, SpecRepository> = new Map(),
) {
  return new EditChange(
    repo,
    makeListWorkspaces(specs),
    makeActorResolver(),
    makeSchemaProvider(makeSchema()),
  )
}

describe('EditChange', () => {
  describe('given no existing change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = createEditChange()
      await expect(
        uc.execute({
          name: 'missing',
          addSpecIds: ['auth/logout'],
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('no-op edits', () => {
    it('returns the same change when no changes are provided', async () => {
      const change = makeChange('c')
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({ name: 'c' })

      expect(result.change).toEqual(change)
      expect(result.invalidated).toBe(false)
    })
  })

  describe('adding specs', () => {
    it('adds new specIds to the change', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
      })

      expect(result.change.specIds).toEqual(['auth/login', 'auth/logout'])
      expect(result.invalidated).toBe(true)
    })

    it('does not duplicate existing specIds', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/login'],
      })

      expect(result.change.specIds).toEqual(['auth/login'])
      expect(result.invalidated).toBe(false)
    })
  })

  describe('removing specs', () => {
    it('removes specIds from the change', async () => {
      const change = makeChange('c', { specIds: ['auth/login', 'auth/logout'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        removeSpecIds: ['auth/logout'],
      })

      expect(result.change.specIds).toEqual(['auth/login'])
      expect(result.invalidated).toBe(true)
    })

    it('throws SpecNotInChangeError when removing a spec that is not in the change', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(
        uc.execute({
          name: 'c',
          removeSpecIds: ['auth/logout'],
        }),
      ).rejects.toThrow(SpecNotInChangeError)
    })
  })

  describe('description update', () => {
    it('updates the change description', async () => {
      const change = makeChange('c')
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        description: 'New description',
      })

      expect(result.change.description).toBe('New description')
      expect(result.invalidated).toBe(false)
    })
  })

  describe('invalidation policy update', () => {
    it('updates the invalidation policy', async () => {
      const change = makeChange('c')
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        invalidationPolicy: 'surgical',
      })

      expect(result.change.invalidationPolicy).toBe('surgical')
      expect(result.invalidated).toBe(false)
    })
  })

  describe('combined edits', () => {
    it('applies all requested changes', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
        description: 'Updated',
        invalidationPolicy: 'global',
      })

      expect(result.change.specIds).toEqual(['auth/login', 'auth/logout'])
      expect(result.change.description).toBe('Updated')
      expect(result.change.invalidationPolicy).toBe('global')
      expect(result.invalidated).toBe(true)
    })
  })

  describe('approval invalidation', () => {
    it('invalidates active approval when specIds change', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.recordSpecApproval('Testing', {}, testActor)
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
      })

      expect(result.change.activeSpecApproval).toBeUndefined()
      expect(result.invalidated).toBe(true)
    })
  })
})
