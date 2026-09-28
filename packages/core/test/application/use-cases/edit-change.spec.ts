import { describe, it, expect, vi } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeChange,
  makeSpecRepository,
  makeSchemaProvider,
  makeSchema,
  testActor,
  makeListWorkspaces,
  makeObservingReconcile,
  makeSpecApprovalFingerprint,
} from './helpers.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

function createEditChange(
  repo = makeChangeRepository(),
  specs: Map<string, SpecRepository> = new Map(),
) {
  return new EditChange(
    repo,
    makeListWorkspaces(specs),
    makeActorResolver(),
    makeSchemaProvider(makeSchema()),
    undefined,
    makeObservingReconcile(repo),
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
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
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
                schema: { name: 'specd-std', version: 1 },
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
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
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
        invalidation: { artifacts: 'surgical' },
      })

      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'surgical',
        workflow: 'preserve',
      })
      expect(result.validityChanged).toBe(false)
      expect(result.automaticReturn).toBeNull()
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
        invalidation: { artifacts: 'global' },
      })

      expect(result.change.specIds).toEqual(['auth/login', 'auth/logout'])
      expect(result.change.description).toBe('Updated')
      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'global',
        workflow: 'preserve',
      })
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
    })
  })

  describe('approval invalidation', () => {
    it('invalidates active approval when specIds change', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.recordSpecApproval('Testing', makeSpecApprovalFingerprint(change.specIds), testActor)
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
      })

      expect(result.change.activeSpecApproval).toBeDefined()
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
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
      const listWorkspaces = makeListWorkspaces()
      const listWorkspacesSpy = vi.spyOn(listWorkspaces, 'execute')

      const uc = new EditChange(
        repo,
        listWorkspaces,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        refresh as never,
        makeObservingReconcile(repo),
      )

      const result = await uc.execute({
        name: 'c',
        removeSpecIds: ['auth/logout'],
      })

      expect(listWorkspacesSpy).toHaveBeenCalledOnce()
      expect(refresh.execute).toHaveBeenCalledWith({ name: 'c' })
      expect(result.change.implementationLinks).toEqual([])
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
    })
  })

  describe('reconciled scope edit', () => {
    function buildReconciledEdit(change: ReturnType<typeof makeChange>) {
      const repo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(makeSchema())
      const reconcile = new ReconcileChangeValidity({
        changes: repo,
        schemaProvider,
        actor: makeActorResolver(),
        refreshImplementationTracking: {
          execute: async () => ({ implementationTracking: null as never }),
        } as never,
        fingerprint: new ValidityFingerprintService({
          changes: repo,
          hasher: new NodeContentHasher(),
          binaryHasher: new NodeBinaryContentHasher(),
          schemaProvider,
        }),
        approvals: { spec: true, signoff: false },
      })
      const uc = new EditChange(
        repo,
        makeListWorkspaces(),
        makeActorResolver(),
        schemaProvider,
        undefined,
        reconcile,
      )
      return { repo, uc }
    }

    it('returns required spec approval to designing and keeps the approval event', async () => {
      const change = makeChange('c', { specIds: ['auth/login'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)
      change.recordSpecApproval(
        'LGTM',
        {
          version: 1,
          specIds: ['auth/login'],
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
        },
        testActor,
      )
      const { uc } = buildReconciledEdit(change)
      const result = await uc.execute({ name: 'c', addSpecIds: ['auth/logout'] })
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(true)
      expect(result.projectionChanges).toEqual([
        expect.objectContaining({
          projection: 'specApproval',
          cause: 'scope-change',
          differences: [
            expect.objectContaining({
              scope: 'spec',
              key: 'auth/logout',
              kind: 'spec-added',
            }),
          ],
        }),
      ])
      expect(result.automaticReturn).toEqual({
        cause: 'spec-approval',
        from: 'implementing',
        to: 'designing',
      })
      expect(result.change.state).toBe('designing')
      expect(result.change.history.some((event) => event.type === 'spec-approved')).toBe(true)
      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'downstream',
        workflow: 'preserve',
      })
    })

    it('treats scope reordering as a scope edit without invalidating consent', async () => {
      const change = makeChange('reorder', { specIds: ['auth/a', 'auth/b'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)
      change.recordSpecApproval(
        'LGTM',
        {
          version: 1,
          specIds: ['auth/a', 'auth/b'],
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
        },
        testActor,
      )
      const beforeEvents = change.history.filter(
        (event) => event.type === 'approval-invalidated',
      ).length
      const { uc } = buildReconciledEdit(change)

      const result = await uc.execute({
        name: 'reorder',
        removeSpecIds: ['auth/a'],
        addSpecIds: ['auth/a'],
      })

      expect(result.scopeChanged).toBe(true)
      expect(result.projectionChanges).toEqual([])
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
      expect(result.change.specApproval?.status).toBe('valid')
      expect(
        result.change.history.filter((event) => event.type === 'approval-invalidated'),
      ).toHaveLength(beforeEvents)
    })
  })
})
