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
} from './helpers.js'

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

    it('seeds specDependsOn from spec-lock when the spec already exists', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])],
        artifacts: {
          'auth/login/spec-lock.json': JSON.stringify({
            schema: { name: 'schema-std', version: 1 },
            dependsOn: ['core:storage'],
          }),
        },
      })
      const uc = new CreateChange(repo, new Map([['default', specRepo]]), makeActorResolver())

      const result = await uc.execute({
        name: 'seed-from-sidecar',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.get('auth/login')).toEqual(['core:storage'])
    })

    it('falls back to metadata dependsOn when sidecar is absent', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])],
        artifacts: {
          'auth/login/.specd-metadata.yaml': JSON.stringify({
            dependsOn: ['core:storage', 'core:change'],
          }),
        },
      })
      const uc = new CreateChange(repo, new Map([['default', specRepo]]), makeActorResolver())

      const result = await uc.execute({
        name: 'seed-from-metadata',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.get('auth/login')).toEqual(['core:storage', 'core:change'])
    })

    it('does not seed a missing spec', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(
        repo,
        new Map([['default', makeSpecRepository({ specs: [] })]]),
        makeActorResolver(),
      )

      const result = await uc.execute({
        name: 'missing-spec',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.has('auth/login')).toBe(false)
    })
  })

  describe('given a drafted change with that name already exists', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      existing.draft(testActor)
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

  describe('invalidationPolicy', () => {
    it('seeds the change with an explicit invalidation policy', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'with-policy',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
        invalidationPolicy: 'surgical',
      })

      expect(result.change.invalidationPolicy).toBe('surgical')
    })

    it('defaults to downstream when no policy is provided', async () => {
      const repo = makeChangeRepository()
      const uc = new CreateChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({
        name: 'no-policy',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.invalidationPolicy).toBe('downstream')
    })
  })
})
