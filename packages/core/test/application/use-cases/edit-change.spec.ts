import { describe, it, expect, vi } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { IncompatibleSchemaError } from '../../../src/domain/errors/incompatible-schema-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeChange,
  makeSpecRepository,
  makeSchemaProvider,
  makeSchema,
  testActor,
  makeListWorkspaces,
} from './helpers.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

function createEditChange(
  repo = makeChangeRepository(),
  specs: Map<string, SpecRepository> = new Map(),
  schema = makeSchema(),
) {
  return new EditChange(
    repo,
    makeListWorkspaces(specs),
    makeActorResolver(),
    makeSchemaProvider(schema),
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

    it('seeds newly added specs from persisted dependencies before metadata fallback', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'auth/logout', filenames: [] })],
            artifacts: {
              'auth/logout/spec-lock.json': JSON.stringify({
                dependsOn: ['default:shared/persisted'],
              }),
              'auth/logout/metadata.json': JSON.stringify({
                dependsOn: ['default:shared/metadata'],
              }),
            },
          }),
        ],
      ])
      const uc = createEditChange(repo, specs)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:auth/logout'],
      })

      expect(result.change.specDependsOn.get('default:auth/logout')).toEqual([
        'default:shared/persisted',
      ])
    })

    it('seeds newly added specs from stale metadata when persisted dependencies are absent', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [
              makeSpec({ workspace: 'default', name: 'auth/logout', filenames: ['spec.md'] }),
            ],
            artifacts: {
              'auth/logout/spec.md': '# Logout flow',
              'auth/logout/spec-lock.json': JSON.stringify({
                schema: { name: 'test-schema', version: 1 },
                dependsOn: ['default:shared/metadata'],
                implementation: [],
              }),
            },
          }),
        ],
      ])
      const uc = createEditChange(repo, specs)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:auth/logout'],
      })

      expect(result.change.specDependsOn.get('default:auth/logout')).toEqual([
        'default:shared/metadata',
      ])
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

    it('triggers refresh implementation tracking when specIds change', async () => {
      const change = makeChange('c', { specIds: ['auth/login', 'auth/logout'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)
      change.trackImplementationFile('src/logout.ts', 'open')
      change.addImplementationLink({
        specId: 'default:auth/logout',
        file: 'src/logout.ts',
        fileLinkExplicit: true,
      })

      const repo = makeChangeRepository([change])
      const refresh = {
        execute: vi.fn(async ({ name }: { name: string }) => {
          await repo.mutate(name, async (c) => {
            c.removeImplementationLink('default:auth/logout', 'src/logout.ts')
          })
          return { implementationTracking: {} as never }
        }),
      }

      const uc = new EditChange(
        repo,
        makeListWorkspaces(),
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        refresh as never,
      )

      const result = await uc.execute({
        name: 'c',
        removeSpecIds: ['auth/logout'],
      })

      expect(refresh.execute).toHaveBeenCalledWith({ name: 'c' })
      expect(result.change.implementationLinks).toEqual([])
    })
  })

  describe('schema compatibility guardrail', () => {
    it('allows uninitialized spec fallback when global schema matches change', async () => {
      const change = makeChange('c', { specIds: ['auth/login'], schemaName: 'test-schema' })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [
              makeSpec({ workspace: 'default', name: 'auth/logout', filenames: ['spec.md'] }),
            ],
          }),
        ],
      ])
      const uc = createEditChange(repo, specs, makeSchema({ name: 'test-schema' }))

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:auth/logout'],
      })

      expect(result.change.specIds).toContain('default:auth/logout')
    })

    it('succeeds when adding a spec with identical schema', async () => {
      const change = makeChange('c', { specIds: ['auth/login'], schemaName: 'schema-custom' })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [
              makeSpec({ workspace: 'default', name: 'auth/logout', filenames: ['spec.md'] }),
            ],
            artifacts: {
              'auth/logout/spec-lock.json': JSON.stringify({
                schema: { name: 'schema-custom', version: 1 },
                dependsOn: [],
              }),
            },
          }),
        ],
      ])
      const uc = createEditChange(repo, specs, makeSchema({ name: 'schema-custom' }))

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:auth/logout'],
      })

      expect(result.change.specIds).toContain('default:auth/logout')
    })

    it('succeeds when adding a spec with a different but compatible schema', async () => {
      const fullstackSchema = makeSchema({
        name: 'schema-fullstack',
        compat: { name: 'schema-ui', version: 1 },
      })
      const change = makeChange('c', { specIds: ['auth/login'], schemaName: 'schema-fullstack' })
      const repo = makeChangeRepository([change])
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
      const uc = createEditChange(repo, specs, fullstackSchema)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:ui/button'],
      })

      expect(result.change.specIds).toContain('default:ui/button')
    })

    it('throws IncompatibleSchemaError and leaves change unmodified when spec schema is incompatible', async () => {
      const uiSchema = makeSchema({ name: 'schema-ui' })
      const change = makeChange('c', { specIds: ['auth/login'], schemaName: 'schema-ui' })
      const repo = makeChangeRepository([change])
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
      const uc = createEditChange(repo, specs, uiSchema)

      await expect(
        uc.execute({
          name: 'c',
          addSpecIds: ['default:api/users'],
        }),
      ).rejects.toThrow(IncompatibleSchemaError)

      const unmodified = await repo.get('c')
      expect(unmodified?.specIds).toEqual(['auth/login'])
    })
  })
})
