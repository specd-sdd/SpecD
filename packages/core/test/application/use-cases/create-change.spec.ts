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
        workspaces: ['default'],
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.name).toBe('add-oauth')
      expect(repo.store.has('add-oauth')).toBe(true)
    })

    it('sets workspaces and specIds from input', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        workspaces: ['frontend', 'backend'],
        specIds: ['ui/login', 'api/auth'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.workspaces).toEqual(['frontend', 'backend'])
      expect(result.specIds).toEqual(['ui/login', 'api/auth'])
    })

    it('appends a created event with the actor from GitAdapter', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        workspaces: ['default'],
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 2,
      })

      expect(result.history).toHaveLength(1)
      const evt = result.history[0]
      expect(evt?.type).toBe('created')
      if (evt?.type === 'created') {
        expect(evt.by).toEqual(testActor)
        expect(evt.schemaName).toBe('specd-std')
        expect(evt.schemaVersion).toBe(2)
        expect(evt.workspaces).toEqual(['default'])
        expect(evt.specIds).toEqual(['auth/login'])
      }
    })

    it('leaves the change in drafting state', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        workspaces: ['default'],
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.state).toBe('drafting')
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
          workspaces: ['default'],
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
          workspaces: ['default'],
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'CHANGE_ALREADY_EXISTS' })
    })
  })
})
