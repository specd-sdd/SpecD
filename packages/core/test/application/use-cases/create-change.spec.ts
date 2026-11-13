import { describe, it, expect, vi } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import { InvalidCreateChangeInputError } from '../../../src/application/errors/invalid-create-change-input-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { IncompatibleSchemaError } from '../../../src/domain/errors/incompatible-schema-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
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
  describe('invalidation policy validation', () => {
    it('rejects an unknown policy with InvalidInputError and creates nothing', async () => {
      const repo = makeChangeRepository()
      const createSpy = vi.spyOn(repo, 'create')
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const error = await uc
        .execute({
          name: 'add-oauth',
          specIds: [],
          schemaName: 'specd-std',
          schemaVersion: 1,
          invalidation: { artifacts: 'sugical' as never, workflow: 'preserve' },
        })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidInputError)
      expect((error as Error).message).toContain('sugical')
      expect((error as Error).message).toContain('none, surgical, downstream, global')
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('rejects an unknown workflow policy with InvalidInputError and creates nothing', async () => {
      const repo = makeChangeRepository()
      const createSpy = vi.spyOn(repo, 'create')
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const error = await uc
        .execute({
          name: 'add-oauth',
          specIds: [],
          schemaName: 'specd-std',
          schemaVersion: 1,
          invalidation: { artifacts: 'surgical', workflow: 'bogus' as never },
        })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidInputError)
      expect((error as Error).message).toContain('bogus')
      expect((error as Error).message).toContain('preserve, redesign')
      expect(createSpy).not.toHaveBeenCalled()
    })

    it.each(['none', 'surgical', 'downstream', 'global'] as const)('accepts %s', async (policy) => {
      const uc = makeCreateChange(
        makeChangeRepository(),
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
        invalidation: { artifacts: policy, workflow: 'preserve' },
      })

      expect(result.change.invalidationPolicy.artifacts).toBe(policy)
    })
  })

  describe('given no existing change with that name', () => {
    it('creates a change via repository create then scaffold', async () => {
      const repo = makeChangeRepository()
      const createSpy = vi.spyOn(repo, 'create')
      const scaffoldSpy = vi.spyOn(repo, 'scaffold')
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('add-oauth')
      expect(repo.store.get('add-oauth')).toBeDefined()
      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).toHaveBeenCalledWith(result.change)
      expect(scaffoldSpy).toHaveBeenCalledTimes(1)
      const createOrder = createSpy.mock.invocationCallOrder[0]
      const scaffoldOrder = scaffoldSpy.mock.invocationCallOrder[0]
      expect(createOrder).toBeDefined()
      expect(scaffoldOrder).toBeDefined()
      expect(createOrder!).toBeLessThan(scaffoldOrder!)
    })

    it('scaffolds the change directory', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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
        specIds: ['default:auth/login'],
      })
    })

    it('records all specIds on the created event', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login', 'auth/register'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.history[0]).toMatchObject({
        type: 'created',
        specIds: ['default:auth/login', 'default:auth/register'],
      })
    })

    it('sets optional description when provided', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
        invalidation: { artifacts: 'surgical', workflow: 'preserve' },
      })

      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'surgical',
        workflow: 'preserve',
      })
    })

    it('defaults invalidation policy to downstream', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'downstream',
        workflow: 'preserve',
      })
    })

    it('uses the injected project invalidation policy when input omits an override', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), {
        defaultInvalidation: { artifacts: 'surgical', workflow: 'redesign' },
      })

      const result = await uc.execute({
        name: 'configured-policy',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'surgical',
        workflow: 'redesign',
      })
    })

    it('prefers an explicit invalidation policy over the injected project default', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(repo, makeListWorkspaces(new Map()), {
        defaultInvalidation: { artifacts: 'global', workflow: 'redesign' },
      })

      const result = await uc.execute({
        name: 'explicit-policy',
        specIds: [],
        schemaName: 'specd-std',
        schemaVersion: 1,
        invalidation: { artifacts: 'none', workflow: 'preserve' },
      })

      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'none',
        workflow: 'preserve',
      })
      expect(result.change.history).toHaveLength(1)
    })

    it('loads and seeds persisted dependencies for existing specs', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/login', filenames: [] })],
        artifacts: {
          'auth/login/spec-lock.json': JSON.stringify({
            schema: { name: 'specd-std', version: 1 },
            dependsOn: ['default:shared/auth'],
            implementation: [],
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

    it('falls back to persisted state for dependencies when sidecar is absent', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [
          makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec-lock.json'] }),
        ],
        artifacts: {
          'auth/login/spec-lock.json': JSON.stringify({
            schema: { name: 'specd-std', version: 1 },
            dependsOn: ['default:shared/auth'],
            implementation: [],
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

    it('still falls back to persisted state for dependencies when metadata cache is stale', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [
          makeSpec({
            workspace: 'default',
            name: 'auth/login',
            filenames: ['spec.md', 'spec-lock.json'],
          }),
        ],
        artifacts: {
          'auth/login/spec.md': '# Login flow',
          'auth/login/spec-lock.json': JSON.stringify({
            schema: { name: 'specd-std', version: 1 },
            dependsOn: ['default:shared/auth'],
            implementation: [],
          }),
          'auth/login/metadata.json': JSON.stringify({
            dependsOn: ['default:other/dep'],
            contentHashes: { 'spec.md': 'sha256:' + 'a'.repeat(64) },
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

    it('prefers persisted dependencies over metadata fallback when both exist', async () => {
      const repo = makeChangeRepository()
      const specRepo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/login', filenames: [] })],
        artifacts: {
          'auth/login/spec-lock.json': JSON.stringify({
            schema: { name: 'specd-std', version: 1 },
            dependsOn: ['default:shared/persisted'],
            implementation: [],
          }),
          'auth/login/metadata.json': JSON.stringify({
            dependsOn: ['default:shared/metadata'],
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

      expect(result.change.specDependsOn.get('default:auth/login')).toEqual([
        'default:shared/persisted',
      ])
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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { getActiveSchema },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { getActiveSchema },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { getActiveSchema },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { detectOverlap },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { detectOverlap },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { detectOverlap },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        { detectOverlap },
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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

      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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

      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

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

  describe('schema compatibility guardrail', () => {
    it('allows uninitialized spec fallback when global schema matches change', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })],
          }),
        ],
      ])
      const uc = makeCreateChange(repo, makeListWorkspaces(specs))

      const result = await uc.execute({
        name: 'new-change',
        specIds: ['default:auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('new-change')
    })

    it('succeeds when adding a spec with identical schema', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })],
            artifacts: {
              'auth/login/spec-lock.json': JSON.stringify({
                schema: { name: 'schema-custom', version: 1 },
                dependsOn: [],
              }),
            },
          }),
        ],
      ])
      const uc = makeCreateChange(repo, makeListWorkspaces(specs), {
        getActiveSchema: makeGetActiveSchema(makeSchema({ name: 'schema-custom' })),
      })

      const result = await uc.execute({
        name: 'new-change',
        specIds: ['default:auth/login'],
        schemaName: 'schema-custom',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('new-change')
    })

    it('succeeds when adding a spec with a different but compatible schema', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'ui/button', filenames: ['spec.md'] })],
            artifacts: {
              'ui/button/spec-lock.json': JSON.stringify({
                schema: { name: 'schema-ui', version: 1 },
                dependsOn: [],
              }),
            },
          }),
        ],
      ])
      const fullstackSchema = makeSchema({
        name: 'schema-fullstack',
        compat: { name: 'schema-ui', version: 1 },
      })
      const uc = makeCreateChange(repo, makeListWorkspaces(specs), {
        getActiveSchema: makeGetActiveSchema(fullstackSchema),
      })

      const result = await uc.execute({
        name: 'new-change',
        specIds: ['default:ui/button'],
        schemaName: 'schema-fullstack',
        schemaVersion: 1,
      })

      expect(result.change.name).toBe('new-change')
    })

    it('throws IncompatibleSchemaError and aborts creation when spec schema is incompatible', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'api/users', filenames: ['spec.md'] })],
            artifacts: {
              'api/users/spec-lock.json': JSON.stringify({
                schema: { name: 'schema-api', version: 1 },
                dependsOn: [],
              }),
            },
          }),
        ],
      ])
      const uiSchema = makeSchema({ name: 'schema-ui' })
      const uc = makeCreateChange(repo, makeListWorkspaces(specs), {
        getActiveSchema: makeGetActiveSchema(uiSchema),
      })

      await expect(
        uc.execute({
          name: 'new-change',
          specIds: ['default:api/users'],
          schemaName: 'schema-ui',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(IncompatibleSchemaError)

      expect(repo.store.get('new-change')).toBeUndefined()
    })
  })

  describe('spec ID validation', () => {
    it('rejects an invalid segment and creates nothing', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(
        uc.execute({
          name: 'bad',
          specIds: ['Core/Foo'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(InvalidSpecIdError)
      expect(repo.store.get('bad')).toBeUndefined()
    })

    it('rejects a comma in a capability segment', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(
        uc.execute({
          name: 'bad',
          specIds: ['auth/a,b'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(InvalidSpecIdError)
    })

    it('rejects an unknown workspace', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(
        uc.execute({
          name: 'bad',
          specIds: ['missing:auth/login'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(WorkspaceNotFoundError)
    })

    it('normalizes bare specIds to fully qualified IDs', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'add-oauth',
        specIds: ['auth/login'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })
      expect(result.change.specIds).toEqual(['default:auth/login'])
    })

    it('creates nothing when one of several specIds is invalid', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(
        uc.execute({
          name: 'partial',
          specIds: ['auth/login', 'Auth/Bad'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(InvalidSpecIdError)
      expect(repo.store.get('partial')).toBeUndefined()
    })

    it('accepts a non-existent spec ID', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'new-spec',
        specIds: ['default:brand-new'],
        schemaName: 'specd-std',
        schemaVersion: 1,
      })
      expect(result.change.specIds).toEqual(['default:brand-new'])
    })

    it('rejects readOnly specs with one line per offender and creates nothing', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        ['default', makeSpecRepository()],
        ['platform', makeSpecRepository({ ownership: 'readOnly' })],
      ])
      const ownership = new Map([['platform', 'readOnly' as const]])
      const uc = makeCreateChange(repo, makeListWorkspaces(specs, ownership))

      await expect(
        uc.execute({
          name: 'ro',
          specIds: ['platform:tokens', 'platform:sessions'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        }),
      ).rejects.toThrow(ReadOnlyWorkspaceError)

      try {
        await uc.execute({
          name: 'ro',
          specIds: ['platform:tokens', 'platform:sessions'],
          schemaName: 'specd-std',
          schemaVersion: 1,
        })
      } catch (err) {
        const message = (err as Error).message
        expect(message).toContain(
          'Cannot add spec "platform:tokens" to change — workspace "platform" is readOnly.',
        )
        expect(message).toContain(
          'Cannot add spec "platform:sessions" to change — workspace "platform" is readOnly.',
        )
      }
      expect(repo.store.get('ro')).toBeUndefined()
    })
  })

  describe('audit hardening', () => {
    const base = { schemaName: 'specd-std', schemaVersion: 1 } as const

    it('reports ChangeAlreadyExistsError before InvalidSpecIdError', async () => {
      const repo = makeChangeRepository([makeChange('dup')])
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(uc.execute({ name: 'dup', specIds: ['Bad Id'], ...base })).rejects.toThrow(
        ChangeAlreadyExistsError,
      )
    })

    it('rejects an empty spec ID', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      await expect(uc.execute({ name: 'x', specIds: [''], ...base })).rejects.toThrow(
        InvalidSpecIdError,
      )
      expect(repo.store.get('x')).toBeUndefined()
    })

    it('collapses duplicate IDs after normalization', async () => {
      const repo = makeChangeRepository()
      const uc = makeCreateChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
      )

      const result = await uc.execute({
        name: 'dedupe',
        specIds: ['auth/login', 'default:auth/login'],
        ...base,
      })

      expect(result.change.specIds).toEqual(['default:auth/login'])
    })

    it('lists only the readOnly specs when owned and readOnly specs are mixed', async () => {
      const repo = makeChangeRepository()
      const specs = new Map([
        ['default', makeSpecRepository()],
        ['platform', makeSpecRepository({ ownership: 'readOnly' })],
      ])
      const ownership = new Map([['platform', 'readOnly' as const]])
      const uc = makeCreateChange(repo, makeListWorkspaces(specs, ownership))

      const err = await uc
        .execute({ name: 'mixed', specIds: ['default:auth/new', 'platform:tokens'], ...base })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
      const lines = (err as Error).message.split('\n').filter((l) => l.startsWith('Cannot add'))
      expect(lines).toEqual([
        'Cannot add spec "platform:tokens" to change — workspace "platform" is readOnly.',
      ])
      expect(repo.store.get('mixed')).toBeUndefined()
    })
  })
})
