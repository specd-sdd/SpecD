import { describe, it, expect, vi } from 'vitest'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import { InvalidCreateChangeInputError } from '../../../src/application/errors/invalid-create-change-input-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { OverlapEntry } from '../../../src/domain/value-objects/overlap-entry.js'
import { OverlapReport } from '../../../src/domain/value-objects/overlap-report.js'
import {
  makeChangeRepository,
  makeChange,
  makeSpecRepository,
  testActor,
  makeListWorkspaces,
  makeCreateChange,
  makeGetActiveSchema,
  makeDetectOverlap,
  makeSchema,
} from './helpers.js'

describe('CreateChange', () => {
  describe('given no existing change with that name', () => {
    it('creates and saves a change with the given name', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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

    it('records all specIds on the created event', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login', 'auth/register'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.history[0]).toMatchObject({
        type: 'created',
        specIds: ['auth/login', 'auth/register'],
      })
    })

    it('sets optional description when provided', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map([['default', specRepo]])))

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
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map([['default', specRepo]])))

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository({ specs: [] })]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.specDependsOn.has('default:auth/login')).toBe(false)
    })

    it('resolves active schema when schema fields are omitted', async () => {
      const repo = makeChangeRepository()
      const getActiveSchema = makeGetActiveSchema(makeSchema({ name: 'spec-driven' }))
      const executeSpy = vi.spyOn(getActiveSchema, 'execute')
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { getActiveSchema })

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
      })

      expect(executeSpy).toHaveBeenCalledWith()
      expect(result.change.history[0]).toMatchObject({
        schemaName: 'spec-driven',
        schemaVersion: 1,
      })
    })

    it('skips GetActiveSchema when explicit schema override is provided', async () => {
      const repo = makeChangeRepository()
      const getActiveSchema = makeGetActiveSchema()
      const executeSpy = vi.spyOn(getActiveSchema, 'execute')
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { getActiveSchema })

      await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'custom-schema',
        schemaVersion: 2,
      })

      expect(executeSpy).not.toHaveBeenCalled()
    })

    it('propagates schema resolution errors from GetActiveSchema', async () => {
      const repo = makeChangeRepository()
      const getActiveSchema = {
        execute: async () => {
          throw new SchemaNotFoundError('missing-schema')
        },
      } as unknown as ReturnType<typeof makeGetActiveSchema>
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { getActiveSchema })

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
        }),
      ).rejects.toThrow(SchemaNotFoundError)

      expect(repo.store.size).toBe(0)
    })

    it('includes overlap report when includeOverlapCheck is true', async () => {
      const repo = makeChangeRepository()
      const report = new OverlapReport([
        new OverlapEntry('default:auth/login', [
          { name: 'other-change', state: 'designing' },
          { name: 'add-oauth', state: 'drafting' },
        ]),
      ])
      const detectOverlap = makeDetectOverlap(report)
      const executeSpy = vi.spyOn(detectOverlap, 'execute')
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { detectOverlap })

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
        includeOverlapCheck: true,
      })

      expect(executeSpy).toHaveBeenCalledWith({ name: 'add-oauth' })
      expect(result.overlapReport).toBe(report)
    })

    it('omits overlap report when detectOverlap throws', async () => {
      const repo = makeChangeRepository()
      const detectOverlap = {
        execute: async () => {
          throw new Error('detect failed')
        },
      } as unknown as ReturnType<typeof makeDetectOverlap>
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { detectOverlap })

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
        includeOverlapCheck: true,
      })

      expect(result.overlapReport).toBeUndefined()
      expect(result.change.name).toBe('add-oauth')
    })

    it('skips overlap detection when includeOverlapCheck is absent', async () => {
      const repo = makeChangeRepository()
      const detectOverlap = makeDetectOverlap()
      const executeSpy = vi.spyOn(detectOverlap, 'execute')
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { detectOverlap })

      await uc.execute({
        name: 'add-oauth',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(executeSpy).not.toHaveBeenCalled()
    })

    it('skips overlap detection when specIds is empty', async () => {
      const repo = makeChangeRepository()
      const detectOverlap = makeDetectOverlap()
      const executeSpy = vi.spyOn(detectOverlap, 'execute')
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), { detectOverlap })

      await uc.execute({
        name: 'add-oauth',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
        includeOverlapCheck: true,
      })

      expect(executeSpy).not.toHaveBeenCalled()
    })
  })

  describe('given invalid schema input', () => {
    it('throws when only schemaName is provided', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaName: 'specd-std',
        }),
      ).rejects.toThrow(InvalidCreateChangeInputError)
    })

    it('throws when only schemaVersion is provided', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

      await expect(
        uc.execute({
          name: 'add-oauth',
          specIds: ['auth/login'],
          schemaVersion: 1,
        }),
      ).rejects.toThrow(InvalidCreateChangeInputError)
    })
  })

  describe('given an existing change with that name', () => {
    it('throws ChangeAlreadyExistsError', async () => {
      const existing = makeChange('add-oauth')
      const repo = makeChangeRepository([existing])
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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

      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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

      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()))

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
