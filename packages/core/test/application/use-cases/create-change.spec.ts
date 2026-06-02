import { describe, it, expect } from 'vitest'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeChange,
  makeSpecRepository,
  testActor,
  makeListWorkspaces,
} from './helpers.js'

describe('CreateChange', () => {
  describe('given no existing change with that name', () => {
    it('creates and saves a change with the given name', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('add-oauth')
      expect(repo.store.get('add-oauth')).toBeDefined()
    })

    it('scaffolds the change directory', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.changePath).toBe('/test/changes/add-oauth')
    })

    it('seeds the creation history event', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.history).toHaveLength(1)
      expect(result.change.history[0]).toMatchObject({
        type: 'created',
        by: testActor,
        specIds: ['auth/login'],
      })
    })

    it('sets optional description when provided', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        description: 'New login method',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.description).toBe('New login method')
    })

    it('seeds invalidation policy when provided', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
        invalidationPolicy: 'surgical',
      })

      expect(result.change.invalidationPolicy).toBe('surgical')
    })

    it('defaults invalidation policy to downstream', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.invalidationPolicy).toBe('downstream')
    })

    it('loads and seeds persisted dependencies for existing specs', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('auth/login'), [])],
        artifacts: {
          'auth/login/spec-lock.json': JSON.stringify({
            dependsOn: ['default:shared/auth'],
          }),
        },
      })
      const uc = new CreateChange(
        repo,
        makeListWorkspaces(new Map([['default', specRepo]])),
        makeActorResolver(),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.get('default:auth/login')).toEqual(['default:shared/auth'])
    })

    it('falls back to metadata for dependencies when sidecar is absent', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('auth/login'), [])],
        artifacts: {
          'auth/login/metadata.json': JSON.stringify({
            dependsOn: ['default:shared/auth'],
          }),
        },
      })
      const uc = new CreateChange(
        repo,
        makeListWorkspaces(new Map([['default', specRepo]])),
        makeActorResolver(),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.get('default:auth/login')).toEqual(['default:shared/auth'])
    })

    it('does not seed dependsOn for non-existent specs (newly created)', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository({ specs: [] })]])),
        makeActorResolver(),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.has('default:auth/login')).toBe(false)
    })
  })

  describe('given an existing change with that name', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(ChangeAlreadyExistsError)
    })
  })

  describe('given an existing draft with that name', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      await repo.mutate('add-oauth', (c) => {
        c.transition('designing', testActor)
        c.transition('ready', testActor)
        c.transition('implementing', testActor)
        c.draft(testActor, 'Testing', true)
        return c
      })

      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(ChangeAlreadyExistsError)
    })
  })

  describe('given an existing discarded change with that name', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      await repo.mutate('add-oauth', (c) => {
        c.discard('Testing', testActor)
        return c
      })

      const uc = new CreateChange(repo, makeListWorkspaces(new Map()), makeActorResolver())

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(ChangeAlreadyExistsError)
    })
  })
})
