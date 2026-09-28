import { describe, it, expect, vi } from 'vitest'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ActorResolver } from '../../../src/application/ports/actor-resolver.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeContentHasher,
  makeChange,
  makeArtifactType,
  testActor,
  makeSpecApprovalFingerprint,
} from './helpers.js'

function buildApproveSpec(
  repo: ReturnType<typeof makeChangeRepository>,
  options?: {
    schema?: ReturnType<typeof makeSchema>
    approvals?: { readonly spec: boolean; readonly signoff: boolean }
    actor?: ActorResolver
  },
) {
  const schema = options?.schema ?? makeSchema()
  const approvals = options?.approvals ?? { spec: true, signoff: false }
  const actor = options?.actor ?? makeActorResolver()
  const schemaProvider = makeSchemaProvider(schema)
  const fingerprint = new ValidityFingerprintService({
    changes: repo,
    hasher: makeContentHasher(),
    binaryHasher: new NodeBinaryContentHasher(),
    schemaProvider,
  })
  const reconcile = new ReconcileChangeValidity({
    changes: repo,
    schemaProvider,
    actor,
    refreshImplementationTracking: {
      execute: async () => undefined,
    } as unknown as RefreshImplementationTracking,
    fingerprint,
    approvals,
  })
  return new ApproveSpec(repo, actor, schemaProvider, approvals, reconcile, fingerprint)
}

function makeReadyChange(name: string, schemaName = 'test-schema'): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: ['auth/login'],
      schemaName,
      schemaVersion: 1,
    },
    { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: testActor },
  ]
  return new Change({
    name,
    createdAt,
    specIds: ['auth/login'],
    history: events,
  })
}

function makePendingSpecApprovalChange(name: string, schemaName = 'test-schema'): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: ['auth/login'],
      schemaName,
      schemaVersion: 1,
    },
    { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: testActor },
    {
      type: 'transitioned',
      from: 'ready',
      to: 'pending-spec-approval',
      at: new Date(),
      by: testActor,
    },
  ]
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history: events,
  })
}

describe('ApproveSpec', () => {
  it('resolves one decorated actor and reuses the identical object for projection and event', async () => {
    const change = makeReadyChange('single-actor')
    const repo = makeChangeRepository([change])
    const decorated = {
      name: 'A***a',
      email: 'sha256:decorated@example.invalid',
      provider: 'privacy',
      metadata: { mode: 'hash' },
    }
    const identity = vi.fn().mockResolvedValue(decorated)
    const useCase = buildApproveSpec(repo, { actor: { identity } })

    const approved = await useCase.execute({ name: change.name, reason: 'approved' })
    const event = approved.history.find((candidate) => candidate.type === 'spec-approved')

    expect(identity).toHaveBeenCalledTimes(1)
    expect(approved.specApproval?.decision.by).toBe(decorated)
    expect(event?.type === 'spec-approved' ? event.by : undefined).toBe(decorated)
  })

  describe('given the spec approval gate is enabled and change is in ready', () => {
    it('records consent and stays in ready', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSpec(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'looks good',
      })

      expect(result.state).toBe('ready')
      expect(result.activeSpecApproval?.reason).toBe('looks good')
      expect(result.specApproval?.decision.by).toEqual(testActor)
      const approved = result.history.find((event) => event.type === 'spec-approved')
      expect(approved?.type === 'spec-approved' ? approved.by : undefined).toEqual(testActor)
      expect(result.specApproval?.fingerprint.specIds).toEqual(['auth/login'])
      expect(approved?.type === 'spec-approved' ? approved.fingerprint : undefined).toEqual(
        result.specApproval?.fingerprint,
      )
    })

    it('keeps prior approval events when consent is renewed', async () => {
      const change = makeReadyChange('my-change')
      change.recordSpecApproval('earlier', makeSpecApprovalFingerprint(change.specIds), testActor)
      change.markApprovalInvalid('spec', 'stale', {
        at: new Date('2024-01-03T00:00:00Z'),
        by: testActor,
        cause: 'artifact-drift',
        reason: 'design changed',
        differences: [],
      })
      change.recordSpecApproval(
        'approved after redesign',
        makeSpecApprovalFingerprint(change.specIds),
        testActor,
      )
      const historyBefore = [...change.history]
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSpec(repo)
      const result = await uc.execute({ name: 'my-change', reason: 'renewed' })
      expect(result.specApproval?.decision.reason).toBe('renewed')
      expect(result.history.filter((event) => event.type === 'spec-approved')).toHaveLength(3)
      expect(result.history.slice(0, historyBefore.length)).toEqual(historyBefore)
      expect(result.history.map((event) => event.type).slice(-4)).toEqual([
        'spec-approved',
        'approval-invalidated',
        'spec-approved',
        'spec-approved',
      ])
    })

    it('persists drift review and does not record consent', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const change = new Change({
        name: 'my-change',
        createdAt,
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at: createdAt,
            by: testActor,
            specIds: ['auth/login'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
          { type: 'transitioned', from: 'drafting', to: 'designing', at: createdAt, by: testActor },
          { type: 'transitioned', from: 'designing', to: 'ready', at: createdAt, by: testActor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    status: 'complete',
                    validatedHash: 'sha256:stale',
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('proposal.md', '# Spec'))
      const uc = buildApproveSpec(repo, { schema: makeSchema([makeArtifactType('proposal')]) })
      await expect(uc.execute({ name: 'my-change', reason: 'no' })).rejects.toThrow(
        InvalidStateTransitionError,
      )
      expect(
        repo.store.get('my-change')?.history.some((event) => event.type === 'spec-approved'),
      ).toBe(false)
    })
  })

  describe('given the spec approval gate is enabled and change is in pending-spec-approval (drain)', () => {
    it('appends approval and drain transition without removing the pending history', async () => {
      const change = makePendingSpecApprovalChange('legacy-history')
      const historyBefore = [...change.history]
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)

      const result = await buildApproveSpec(repo).execute({
        name: change.name,
        reason: 'legacy approved',
      })

      expect(result.history.slice(0, historyBefore.length)).toEqual(historyBefore)
      expect(result.history.slice(-2).map((event) => event.type)).toEqual([
        'spec-approved',
        'transitioned',
      ])
      expect(
        result.history.some(
          (event) => event.type === 'transitioned' && event.to === 'pending-spec-approval',
        ),
      ).toBe(true)
    })

    it('records the spec approval event', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSpec(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'looks good',
      })

      expect(result.activeSpecApproval).toBeDefined()
      expect(result.activeSpecApproval?.reason).toBe('looks good')
    })

    it('transitions the change to spec-approved', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSpec(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'looks good',
      })

      expect(result.state).toBe('spec-approved')
    })

    it('computes artifact hashes from loaded artifacts', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSpec(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'approved',
      })

      // The hashes are computed internally and recorded in the approval event
      expect(result.activeSpecApproval?.artifactHashes).toBeDefined()
    })

    it('saves the updated change', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSpec(repo)

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
      })

      expect(repo.store.get('my-change')?.state).toBe('spec-approved')
    })

    it('persists through ChangeRepository.mutate', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSpec(repo)

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
      })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('given the spec approval gate is disabled', () => {
    it('throws ApprovalGateDisabledError before loading the change', async () => {
      const repo = makeChangeRepository()
      const getSpy = vi.spyOn(repo, 'get')
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSpec(repo, { approvals: { spec: false, signoff: false } })

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
        }),
      ).rejects.toThrow(ApprovalGateDisabledError)
      expect(getSpy).not.toHaveBeenCalled()
      expect(mutateSpy).not.toHaveBeenCalled()
    })

    it('ApprovalGateDisabledError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = buildApproveSpec(repo, { approvals: { spec: false, signoff: false } })

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
        }),
      ).rejects.toMatchObject({ code: 'APPROVAL_GATE_DISABLED' })
    })
  })

  describe('given the change is not in a spec-approval wait state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSpec(repo)

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given the active schema differs from the change schema', () => {
    it('throws SchemaMismatchError before mutate', async () => {
      const change = makePendingSpecApprovalChange('my-change', 'schema-a')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSpec(repo, { schema: makeSchema({ name: 'schema-b' }) })

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
        }),
      ).rejects.toThrow(SchemaMismatchError)
      expect(mutateSpy).not.toHaveBeenCalled()
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = buildApproveSpec(repo)

      await expect(
        uc.execute({
          name: 'missing',
          reason: 'ok',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
