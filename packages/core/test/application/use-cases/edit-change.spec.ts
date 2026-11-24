import { describe, it, expect, vi } from 'vitest'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { IncompatibleSchemaError } from '../../../src/domain/errors/incompatible-schema-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
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
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

function defaultWorkspaces(
  specs: Map<string, SpecRepository> = new Map(),
  ownership: Map<string, 'owned' | 'shared' | 'readOnly'> = new Map(),
) {
  const repos = new Map(specs)
  if (!repos.has('default')) {
    repos.set('default', makeSpecRepository())
  }
  return makeListWorkspaces(repos, ownership)
}

function createEditChange(
  repo = makeChangeRepository(),
  specs: Map<string, SpecRepository> = new Map(),
  schema = makeSchema(),
  ownership: Map<string, 'owned' | 'shared' | 'readOnly'> = new Map(),
) {
  return new EditChange(
    repo,
    defaultWorkspaces(specs, ownership),
    makeActorResolver(),
    makeSchemaProvider(schema),
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

  describe('invalidation policy validation', () => {
    it('rejects an unknown policy with InvalidInputError and persists nothing', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const mutate = vi.spyOn(repo, 'mutate')
      const uc = createEditChange(repo)

      const error = await uc
        .execute({ name: 'c', invalidation: { artifacts: 'sugical' as never } })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidInputError)
      expect((error as Error).message).toContain('sugical')
      expect((error as Error).message).toContain('none, surgical, downstream, global')
      expect(mutate).not.toHaveBeenCalled()
    })

    it('rejects an unknown policy together with otherwise valid edits', async () => {
      const change = makeChange('c', { description: 'old', specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(
        uc.execute({
          name: 'c',
          description: 'new',
          invalidation: { artifacts: 'bogus' as never },
        }),
      ).rejects.toThrow(InvalidInputError)
      expect((await repo.get('c'))!.description).toBe('old')
    })

    it.each(['none', 'surgical', 'downstream', 'global'] as const)('accepts %s', async (policy) => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({ name: 'c', invalidation: { artifacts: policy } })

      expect(result.change.invalidationPolicy.artifacts).toBe(policy)
    })
  })

  describe('edits that change nothing', () => {
    it('does not persist when the resulting specIds, description and policy are unchanged', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'], description: 'same' })
      const repo = makeChangeRepository([change])
      const mutate = vi.spyOn(repo, 'mutate')
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        description: 'same',
        invalidation: change.invalidationPolicy,
        addSpecIds: ['auth/login'],
      })

      expect(result.invalidated).toBe(false)
      expect(mutate).not.toHaveBeenCalled()
    })

    it('still fails when a removal names a spec that is not in the change', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(uc.execute({ name: 'c', removeSpecIds: ['auth/missing'] })).rejects.toThrow(
        SpecNotInChangeError,
      )
    })
  })

  describe('adding specs', () => {
    it('adds new specIds to the change', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
      })

      expect(result.change.specIds).toEqual(['default:auth/login', 'default:auth/logout'])
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
    })

    it('does not duplicate existing specIds', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/login'],
      })

      expect(result.change.specIds).toEqual(['default:auth/login'])
      expect(result.invalidated).toBe(false)
    })

    it('seeds newly added specs from persisted dependencies, ignoring metadata.json', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'auth/logout', filenames: [] })],
            artifacts: {
              'auth/logout/spec-lock.json': JSON.stringify({
                schema: { name: 'test-schema', version: 1 },
                dependsOn: ['default:shared/persisted'],
                implementation: [],
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

    it('seeds newly added specs from the persisted spec-lock state of a spec that also has content files', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
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

    it('seeds an empty list when the added spec has no persisted state, ignoring metadata.json', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
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
              'auth/logout/metadata.json': JSON.stringify({
                dependsOn: ['default:shared/metadata'],
              }),
            },
          }),
        ],
      ])
      const uc = createEditChange(repo, specs)

      const result = await uc.execute({ name: 'c', addSpecIds: ['default:auth/logout'] })

      expect(result.change.specDependsOn.get('default:auth/logout')).toEqual([])
    })

    it('seeds an empty list when the added spec does not exist in its repository', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({ name: 'c', addSpecIds: ['default:auth/brand-new'] })

      expect(result.change.specDependsOn.get('default:auth/brand-new')).toEqual([])
    })
  })

  describe('existing specDependsOn snapshot', () => {
    it('does not overwrite an already seeded specDependsOn entry when the spec is added', async () => {
      const change = makeChange('c', {
        specIds: ['default:auth/login'],
        specDependsOn: new Map([['default:auth/logout', ['default:shared/existing']]]),
      })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        [
          'default',
          makeSpecRepository({
            specs: [makeSpec({ workspace: 'default', name: 'auth/logout', filenames: [] })],
            artifacts: {
              'auth/logout/spec-lock.json': JSON.stringify({
                schema: { name: 'test-schema', version: 1 },
                dependsOn: ['default:shared/persisted'],
                implementation: [],
              }),
            },
          }),
        ],
      ])
      const uc = createEditChange(repo, specs)

      const result = await uc.execute({ name: 'c', addSpecIds: ['default:auth/logout'] })

      expect(result.change.specIds).toContain('default:auth/logout')
      expect(result.change.specDependsOn.get('default:auth/logout')).toEqual([
        'default:shared/existing',
      ])
    })
  })

  describe('removing specs', () => {
    it('removes specIds from the change', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login', 'default:auth/logout'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        removeSpecIds: ['auth/logout'],
      })

      expect(result.change.specIds).toEqual(['default:auth/login'])
      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(false)
      expect(result.invalidated).toBe(false)
    })

    it('throws SpecNotInChangeError when removing a spec that is not in the change', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
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
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['auth/logout'],
        description: 'Updated',
        invalidation: { artifacts: 'global' },
      })

      expect(result.change.specIds).toEqual(['default:auth/login', 'default:auth/logout'])
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
      const change = makeChange('c', { specIds: ['default:auth/login'] })
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
      const change = makeChange('c', { specIds: ['default:auth/login', 'default:auth/logout'] })
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
        resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
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
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)
      change.recordSpecApproval(
        'LGTM',
        {
          version: 1,
          specIds: ['default:auth/login'],
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
              key: 'default:auth/logout',
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

    it('reports stale spec consent in ready without an automatic return', async () => {
      const change = makeChange('in-ready', { specIds: ['default:auth/login'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.recordSpecApproval(
        'LGTM',
        {
          version: 1,
          specIds: ['default:auth/login'],
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
        },
        testActor,
      )
      const { uc } = buildReconciledEdit(change)

      const result = await uc.execute({ name: 'in-ready', addSpecIds: ['auth/logout'] })

      expect(result.scopeChanged).toBe(true)
      expect(result.validityChanged).toBe(true)
      expect(result.projectionChanges).toEqual([
        expect.objectContaining({ projection: 'specApproval', from: 'valid', to: 'stale' }),
      ])
      expect(result.change.specApproval?.status).toBe('stale')
      expect(result.automaticReturn).toBeNull()
      expect(result.change.state).toBe('ready')
    })

    it('treats scope reordering as a scope edit without invalidating consent', async () => {
      const change = makeChange('reorder', { specIds: ['default:auth/a', 'default:auth/b'] })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)
      change.recordSpecApproval(
        'LGTM',
        {
          version: 1,
          specIds: ['default:auth/a', 'default:auth/b'],
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

    it('keeps the persisted scope atomic when reconciliation rejects', async () => {
      const change = makeChange('atomic', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const failure = new Error('reconciliation failed')
      const callbackReached = vi.fn()
      const reconcile = {
        mutate: vi.fn(
          async (
            _input: unknown,
            operation: (
              context: import('../../../src/application/use-cases/reconcile-change-validity.js').ReconciledMutationContext,
            ) => Promise<unknown>,
          ) => {
            const fresh = makeChange('atomic', { specIds: [...change.specIds] })
            return operation({
              change: fresh,
              before: {} as never,
              fingerprint: null,
              reconcileAfter: async () => {
                callbackReached()
                throw failure
              },
            })
          },
        ),
      }
      const uc = new EditChange(
        repo,
        makeListWorkspaces(),
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        undefined,
        reconcile as never,
      )

      await expect(uc.execute({ name: 'atomic', addSpecIds: ['auth/logout'] })).rejects.toBe(
        failure,
      )
      expect(reconcile.mutate).toHaveBeenCalledOnce()
      expect(callbackReached).toHaveBeenCalledOnce()
      const persisted = await repo.get('atomic')
      expect(persisted?.specIds).toEqual(['auth/login'])
      expect(persisted?.history).toEqual(change.history)
      expect(persisted?.artifacts).toEqual(change.artifacts)
      expect(persisted?.specApproval).toEqual(change.specApproval)
      expect(persisted?.signoff).toEqual(change.signoff)
      expect(persisted?.verification).toEqual(change.verification)
    })
  })

  describe('schema compatibility guardrail', () => {
    it('uses the change schema for compatibility and fresh mutation DAG synchronization', async () => {
      const schema = makeSchema({ name: 'custom-workflow' })
      const change = makeChange('c', {
        specIds: ['auth/login'],
        schemaName: 'custom-workflow',
      })
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
      const get = vi.fn(async (ref?: string) => {
        if (ref !== 'custom-workflow') throw new Error('workspace default must not be used')
        return schema
      })
      const uc = new EditChange(
        repo,
        makeListWorkspaces(specs),
        makeActorResolver(),
        { get } as SchemaProvider,
        undefined,
        makeObservingReconcile(repo),
      )

      const result = await uc.execute({ name: 'c', addSpecIds: ['default:auth/logout'] })

      expect(result.change.specIds).toContain('default:auth/logout')
      expect(get).toHaveBeenCalledOnce()
      expect(get).toHaveBeenCalledWith('custom-workflow')
    })

    it('leaves scope unchanged when sovereign schema resolution fails', async () => {
      const change = makeChange('c', {
        specIds: ['default:auth/login'],
        schemaName: 'missing-workflow',
      })
      const repo = makeChangeRepository([change])
      const failure = new Error('sovereign schema unavailable')
      const uc = new EditChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        makeActorResolver(),
        { get: vi.fn(async () => Promise.reject(failure)) } as SchemaProvider,
        undefined,
        makeObservingReconcile(repo),
      )

      await expect(uc.execute({ name: 'c', addSpecIds: ['default:auth/logout'] })).rejects.toBe(
        failure,
      )
      expect(repo.store.get('c')?.specIds).toEqual(['default:auth/login'])
    })

    it('allows uninitialized spec fallback when the change schema is resolved by its recorded name', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'], schemaName: 'test-schema' })
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

    it('resolves the actor once and shares it between the edit and reconciliation', async () => {
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
      const schema = makeSchema({ name: 'test-schema' })
      const schemaProvider = makeSchemaProvider(schema)
      const identity = vi.fn(async () => testActor)
      const actor = { identity }
      const reconcile = new ReconcileChangeValidity({
        changes: repo,
        resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
        actor,
        refreshImplementationTracking: {
          execute: async () => undefined,
        } as unknown as RefreshImplementationTracking,
        fingerprint: new ValidityFingerprintService({
          changes: repo,
          hasher: new NodeContentHasher(),
          binaryHasher: new NodeBinaryContentHasher(),
          schemaProvider,
        }),
        approvals: { spec: false, signoff: false },
      })
      const uc = new EditChange(
        repo,
        makeListWorkspaces(specs),
        actor,
        schemaProvider,
        undefined,
        reconcile,
      )

      await uc.execute({ name: 'c', addSpecIds: ['default:auth/logout'] })

      expect(identity).toHaveBeenCalledTimes(1)
    })

    it('succeeds when adding a spec with identical schema', async () => {
      const change = makeChange('c', {
        specIds: ['default:auth/login'],
        schemaName: 'schema-custom',
      })
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
      const change = makeChange('c', {
        specIds: ['default:auth/login'],
        schemaName: 'schema-fullstack',
      })
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
      const change = makeChange('c', { specIds: ['default:auth/login'], schemaName: 'schema-ui' })
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
      expect(unmodified?.specIds).toEqual(['default:auth/login'])
    })
  })

  describe('spec ID validation', () => {
    it('rejects an invalid segment', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(uc.execute({ name: 'c', addSpecIds: ['Core/Foo'] })).rejects.toThrow(
        InvalidSpecIdError,
      )
      expect(change.specIds).toEqual(['default:auth/login'])
    })

    it('rejects a comma in a capability segment', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(uc.execute({ name: 'c', addSpecIds: ['auth/a,b'] })).rejects.toThrow(
        InvalidSpecIdError,
      )
    })

    it('rejects an unknown workspace', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(uc.execute({ name: 'c', addSpecIds: ['missing:auth/login'] })).rejects.toThrow(
        WorkspaceNotFoundError,
      )
    })

    it('normalizes bare addSpecIds to fully qualified IDs', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({ name: 'c', addSpecIds: ['auth/logout'] })
      expect(result.change.specIds).toEqual(['default:auth/login', 'default:auth/logout'])
    })

    it('stores nothing when one of several addSpecIds is invalid', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      await expect(
        uc.execute({ name: 'c', addSpecIds: ['auth/logout', 'Auth/Bad'] }),
      ).rejects.toThrow(InvalidSpecIdError)
      expect(change.specIds).toEqual(['default:auth/login'])
    })

    it('accepts a non-existent spec ID', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = createEditChange(repo)

      const result = await uc.execute({
        name: 'c',
        addSpecIds: ['default:does-not-exist'],
      })
      expect(result.change.specIds).toContain('default:does-not-exist')
    })

    it('rejects readOnly specs with one line per offender and applies nothing', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        ['default', makeSpecRepository()],
        ['platform', makeSpecRepository({ ownership: 'readOnly' })],
      ])
      const ownership = new Map<'platform' | 'default', 'owned' | 'readOnly'>([
        ['default', 'owned'],
        ['platform', 'readOnly'],
      ])
      const uc = createEditChange(repo, specs, makeSchema(), ownership)

      await expect(
        uc.execute({
          name: 'c',
          addSpecIds: ['platform:tokens', 'platform:sessions'],
        }),
      ).rejects.toThrow(ReadOnlyWorkspaceError)

      try {
        await uc.execute({
          name: 'c',
          addSpecIds: ['platform:tokens', 'platform:sessions'],
        })
      } catch (err) {
        const message = (err as Error).message
        expect(message).toContain(
          'Cannot add spec "platform:tokens" to change — workspace "platform" is readOnly.',
        )
        expect(message).toContain(
          'Cannot add spec "platform:sessions" to change — workspace "platform" is readOnly.',
        )
        expect(message.split('\n').filter((l) => l.startsWith('Cannot add spec'))).toHaveLength(2)
      }
      expect(change.specIds).toEqual(['default:auth/login'])
    })

    it('skips ownership checks on removal and normalizes bare remove IDs', async () => {
      const change = makeChange('c', {
        specIds: ['default:auth/login', 'platform:tokens'],
      })
      const repo = makeChangeRepository([change])
      const specs = new Map([
        ['default', makeSpecRepository()],
        ['platform', makeSpecRepository({ ownership: 'readOnly' })],
      ])
      const ownership = new Map([['platform', 'readOnly' as const]])
      const uc = createEditChange(repo, specs, makeSchema(), ownership)

      const result = await uc.execute({
        name: 'c',
        removeSpecIds: ['platform:tokens'],
      })
      expect(result.change.specIds).toEqual(['default:auth/login'])
    })
  })

  describe('audit hardening', () => {
    it('rejects an empty added ID with InvalidSpecIdError', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const uc = createEditChange(makeChangeRepository([change]))

      await expect(uc.execute({ name: 'c', addSpecIds: [''] })).rejects.toThrow(InvalidSpecIdError)
      expect(change.specIds).toEqual(['default:auth/login'])
    })

    it('quotes the raw value in SpecNotInChangeError for an invalid removal ID', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const uc = createEditChange(makeChangeRepository([change]))

      const err = await uc
        .execute({ name: 'c', removeSpecIds: ['Bad Id'] })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(SpecNotInChangeError)
      expect((err as Error).message).toContain('Bad Id')
    })

    it('removes default:auth/login when given the bare ID', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login', 'default:auth/logout'] })
      const uc = createEditChange(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'c', removeSpecIds: ['auth/login'] })

      expect(result.change.specIds).toEqual(['default:auth/logout'])
    })

    it('adds nothing when a mixed owned/readOnly list is rejected and lists only readOnly specs', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const specs = new Map([
        ['default', makeSpecRepository()],
        ['platform', makeSpecRepository({ ownership: 'readOnly' })],
      ])
      const ownership = new Map([['platform', 'readOnly' as const]])
      const uc = createEditChange(makeChangeRepository([change]), specs, makeSchema(), ownership)

      const err = await uc
        .execute({ name: 'c', addSpecIds: ['default:auth/new', 'platform:tokens'] })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
      const lines = (err as Error).message.split('\n').filter((l) => l.startsWith('Cannot add'))
      expect(lines).toEqual([
        'Cannot add spec "platform:tokens" to change — workspace "platform" is readOnly.',
      ])
      expect(change.specIds).toEqual(['default:auth/login'])
    })

    it('collapses a removal listed twice (a and default:a) into one removal', async () => {
      const change = makeChange('c', { specIds: ['default:a', 'default:b'] })
      const uc = createEditChange(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'c', removeSpecIds: ['a', 'default:a'] })

      expect(result.change.specIds).toEqual(['default:b'])
    })

    it('does not resolve the actor for an idempotent add', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const actor = makeActorResolver()
      const identity = vi.spyOn(actor, 'identity')
      const repo = makeChangeRepository([change])
      const uc = new EditChange(
        repo,
        defaultWorkspaces(),
        actor,
        makeSchemaProvider(makeSchema()),
        undefined,
        makeObservingReconcile(repo),
      )

      const result = await uc.execute({ name: 'c', addSpecIds: ['auth/login'] })

      expect(result.invalidated).toBe(false)
      expect(identity).not.toHaveBeenCalled()
    })

    it('resolves the actor when the spec list actually changes', async () => {
      const change = makeChange('c', { specIds: ['default:auth/login'] })
      const actor = makeActorResolver()
      const identity = vi.spyOn(actor, 'identity')
      const repo = makeChangeRepository([change])
      const uc = new EditChange(
        repo,
        defaultWorkspaces(),
        actor,
        makeSchemaProvider(makeSchema()),
        undefined,
        makeObservingReconcile(repo),
      )

      await uc.execute({ name: 'c', addSpecIds: ['auth/logout'] })

      expect(identity).toHaveBeenCalledTimes(1)
    })

    it('unscaffolds removed IDs and does not unscaffold on add', async () => {
      const change = makeChange('c', { specIds: ['default:a', 'default:b'] })
      const repo = makeChangeRepository([change])
      const unscaffold = vi.spyOn(repo, 'unscaffold')
      const uc = createEditChange(repo)

      await uc.execute({ name: 'c', removeSpecIds: ['a'] })
      expect(unscaffold).toHaveBeenCalledTimes(1)
      expect(unscaffold).toHaveBeenCalledWith(expect.anything(), ['default:a'])

      unscaffold.mockClear()
      await uc.execute({ name: 'c', addSpecIds: ['c'] })
      expect(unscaffold).not.toHaveBeenCalled()
    })
  })
})
