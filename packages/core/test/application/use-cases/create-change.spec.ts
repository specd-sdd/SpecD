import { describe, it, expect } from 'vitest'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import { makeChangeRepository, makeGitAdapter, makeChange, testActor } from './helpers.js'

describe('CreateChange', () => {
  describe('given no existing change with that name', () => {
    it('creates and saves a change with the given name', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.name).toBe('add-oauth')
      expect(repo.store.has('add-oauth')).toBe(true)
    })

    it('derives workspaces from specIds', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['frontend:ui/login', 'backend:api/auth'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.workspaces).toContain('frontend')
      expect(result.workspaces).toContain('backend')
      expect(result.specIds).toEqual(['frontend:ui/login', 'backend:api/auth'])
    })

    it('appends a created event with the actor from GitAdapter', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 2,
      })

      expect(result.history).toHaveLength(1)
      const evt = result.history[0]
      expect(evt?.type).toBe('created')
      if (evt?.type !== 'created') throw new Error('unreachable')
      expect(evt.by).toEqual(testActor)
      expect(evt.schemaName).toBe('specd-std')
      expect(evt.schemaVersion).toBe(2)
      expect(evt.specIds).toEqual(['auth/login'])
    })

    it('leaves the change in drafting state', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.state).toBe('drafting')
    })

    it('allows empty specIds for bootstrapping', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'bootstrap',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.specIds).toEqual([])
      expect(result.workspaces).toEqual([])
    })
  })

  describe('given a change with that name already exists', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      const uc = new CreateChange(repo, makeGitAdapter())

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
      const uc = new CreateChange(repo, makeGitAdapter())

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
