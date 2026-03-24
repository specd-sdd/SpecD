import { describe, it, expect } from 'vitest'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import { makeChangeRepository, makeActorResolver, makeChange, testActor } from './helpers.js'

describe('CreateChange', () => {
  describe('given no existing change with that name', () => {
    it('creates and saves a change with the given name', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('add-oauth')
      expect(result.changePath).toBe('/test/changes/add-oauth')
      expect(repo.store.has('add-oauth')).toBe(true)
    })

    it('derives workspaces from specIds', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['frontend:ui/login', 'backend:api/auth'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.workspaces).toContain('frontend')
      expect(result.change.workspaces).toContain('backend')
      expect(result.change.specIds).toEqual(['frontend:ui/login', 'backend:api/auth'])
    })

    it('appends a created event with the actor from ActorResolver', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 2,
      })

      expect(result.change.history).toHaveLength(1)
      const evt = result.change.history[0]
      expect(evt?.type).toBe('created')
      if (evt?.type !== 'created') throw new Error('unreachable')
      expect(evt.by).toEqual(testActor)
      expect(evt.schemaName).toBe('specd-std')
      expect(evt.schemaVersion).toBe(2)
      expect(evt.specIds).toEqual(['auth/login'])
    })

    it('leaves the change in drafting state', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.state).toBe('drafting')
    })

    it('allows empty specIds for bootstrapping', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'bootstrap',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specIds).toEqual([])
      expect(result.change.workspaces).toEqual([])
    })

    it('deduplicates specIds', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'dedup-test',
        specIds: ['auth/login', 'auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specIds).toEqual(['auth/login'])
    })
  })

  describe('given a change with that name already exists', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(ChangeAlreadyExistsError)
    })

    it('ChangeAlreadyExistsError has correct code', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'CHANGE_ALREADY_EXISTS' })
    })
  })
})
