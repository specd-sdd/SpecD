import { describe, it, expect, vi } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { VerificationNotFoundError } from '../../../src/application/errors/verification-not-found-error.js'
import { VerificationInProgressError } from '../../../src/application/errors/verification-in-progress-error.js'
import { VerificationStaleError } from '../../../src/application/errors/verification-stale-error.js'
import { VerificationFingerprintMismatchError } from '../../../src/application/errors/verification-fingerprint-mismatch-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { type ValidityFingerprint } from '../../../src/domain/value-objects/validity-fingerprint.js'
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
  testActor,
} from './helpers.js'

const emptyFingerprint: ValidityFingerprint = {
  version: 1,
  artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
  implementation: {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {},
  },
}

function withCurrentVerification(change: Change): Change {
  change.startVerification(emptyFingerprint, testActor)
  change.completeVerification(testActor)
  return change
}

function buildApproveSignoff(
  repo: ReturnType<typeof makeChangeRepository>,
  options?: {
    schema?: ReturnType<typeof makeSchema>
    approvals?: { readonly spec: boolean; readonly signoff: boolean }
    fingerprint?: ValidityFingerprintService
    actor?: ActorResolver
  },
) {
  const schema = options?.schema ?? makeSchema()
  const approvals = options?.approvals ?? { spec: false, signoff: true }
  const actor = options?.actor ?? makeActorResolver()
  const schemaProvider = makeSchemaProvider(schema)
  const fingerprint =
    options?.fingerprint ??
    new ValidityFingerprintService({
      changes: repo,
      hasher: makeContentHasher(),
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider,
    })
  const refresh = { execute: async () => undefined } as unknown as RefreshImplementationTracking
  const reconcile = new ReconcileChangeValidity({
    changes: repo,
    schemaProvider,
    actor,
    refreshImplementationTracking: refresh,
    fingerprint,
    approvals,
  })
  return new ApproveSignoff(repo, actor, schemaProvider, approvals, reconcile, fingerprint, refresh)
}

function makeDoneWithoutVerification(name: string): Change {
  const source = makeDoneChange(`${name}-source`)
  return new Change({
    name,
    createdAt: source.createdAt,
    specIds: source.specIds,
    history: source.history.filter(
      (event) =>
        event.type !== 'verification-attempt-started' && event.type !== 'verification-completed',
    ),
  })
}

function makeDoneChange(name: string, schemaName = 'test-schema'): Change {
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
    { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: testActor },
  ]
  return withCurrentVerification(
    new Change({
      name,
      createdAt,
      specIds: ['auth/login'],
      history: events,
    }),
  )
}

function makePendingSignoffChange(name: string, schemaName = 'test-schema'): Change {
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
    { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'done', to: 'pending-signoff', at: new Date(), by: testActor },
  ]
  return withCurrentVerification(
    new Change({
      name,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      specIds: ['auth/login'],
      history: events,
    }),
  )
}

describe('ApproveSignoff', () => {
  it('resolves one decorated actor and reuses the identical object for projection and event', async () => {
    const change = withCurrentVerification(makeDoneChange('single-actor'))
    const repo = makeChangeRepository([change])
    const decorated = {
      name: 'Anonymous',
      email: 'anonymous@getspecd.dev',
      provider: 'privacy',
      metadata: { mode: 'anonymous' },
    }
    const identity = vi.fn().mockResolvedValue(decorated)
    const useCase = buildApproveSignoff(repo, { actor: { identity } })

    const signed = await useCase.execute({ name: change.name, reason: 'ship it' })
    const event = signed.history.find((candidate) => candidate.type === 'signed-off')

    expect(identity).toHaveBeenCalledTimes(1)
    expect(signed.signoff?.decision.by).toBe(decorated)
    expect(event?.type === 'signed-off' ? event.by : undefined).toBe(decorated)
  })

  describe('verification eligibility errors', () => {
    it('uses VerificationNotFoundError when verification never completed', async () => {
      const change = makeDoneWithoutVerification('missing-verification')
      const uc = buildApproveSignoff(makeChangeRepository([change]))
      await expect(uc.execute({ name: change.name, reason: 'ship' })).rejects.toBeInstanceOf(
        VerificationNotFoundError,
      )
    })

    it('uses VerificationInProgressError for active-only evidence', async () => {
      const change = makeDoneWithoutVerification('active-verification')
      change.startVerification(emptyFingerprint, testActor)
      const uc = buildApproveSignoff(makeChangeRepository([change]))
      await expect(uc.execute({ name: change.name, reason: 'ship' })).rejects.toBeInstanceOf(
        VerificationInProgressError,
      )
    })

    it('uses VerificationStaleError for stale completed evidence', async () => {
      const change = makeDoneChange('stale-verification')
      change.invalidateVerification({
        at: new Date(),
        by: testActor,
        cause: 'verification-invalidated',
        reason: 'withdrawn',
        differences: [],
      })
      const uc = buildApproveSignoff(makeChangeRepository([change]))
      await expect(uc.execute({ name: change.name, reason: 'ship' })).rejects.toBeInstanceOf(
        VerificationStaleError,
      )
    })

    it('uses VerificationStaleError for legacy-unknown completed evidence', async () => {
      const current = makeDoneChange('legacy-verification-source')
      const completed = current.verification.completed!
      const change = new Change({
        name: 'legacy-verification',
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        specIds: current.specIds,
        history: current.history,
        verification: {
          completed: {
            ...completed,
            fingerprint: { ...completed.fingerprint, implementation: null },
          },
        },
      })
      const uc = buildApproveSignoff(makeChangeRepository([change]))

      await expect(uc.execute({ name: change.name, reason: 'ship' })).rejects.toBeInstanceOf(
        VerificationStaleError,
      )
    })

    it('uses VerificationFingerprintMismatchError only for a fresh comparison mismatch', async () => {
      const change = makeDoneChange('mismatch-verification')
      const repo = makeChangeRepository([change])
      const changed: ValidityFingerprint = {
        ...emptyFingerprint,
        implementation: {
          ...emptyFingerprint.implementation,
          files: {
            'src/change.ts': {
              hash: `sha256:${'a'.repeat(64)}`,
              content: 'text',
              normalization: 'text-v1',
            },
          },
        },
      }
      let calls = 0
      const fingerprint = {
        completeFingerprint: async () => ({
          fingerprint: calls++ === 0 ? emptyFingerprint : changed,
          failures: [],
        }),
      } as unknown as ValidityFingerprintService
      const uc = buildApproveSignoff(repo, { fingerprint })
      await expect(uc.execute({ name: change.name, reason: 'ship' })).rejects.toBeInstanceOf(
        VerificationFingerprintMismatchError,
      )
    })
  })

  describe('given the signoff gate is enabled and change is in done', () => {
    it('records consent and stays in done', async () => {
      const change = makeDoneChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSignoff(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'implementation approved',
      })

      expect(result.state).toBe('done')
      expect(result.activeSignoff?.reason).toBe('implementation approved')
    })

    it('renews sign-off append-only after preserving prior consent and invalidation', async () => {
      const change = makeDoneChange('renew-signoff')
      const completed = change.verification.completed!
      change.recordSignoff('earlier', emptyFingerprint, completed.id, testActor)
      change.markApprovalInvalid('signoff', 'stale', {
        at: new Date('2024-01-03T00:00:00Z'),
        by: testActor,
        cause: 'verification-invalidated',
        reason: 'repeat verification',
        differences: [],
      })
      change.recordSignoff(
        'approved after reverification',
        emptyFingerprint,
        completed.id,
        testActor,
      )
      const historyBefore = [...change.history]
      const repo = makeChangeRepository([change])

      const result = await buildApproveSignoff(repo).execute({
        name: change.name,
        reason: 'renewed sign-off',
      })

      expect(result.signoff?.decision.reason).toBe('renewed sign-off')
      expect(result.history.slice(0, historyBefore.length)).toEqual(historyBefore)
      expect(result.history.map((event) => event.type).slice(-4)).toEqual([
        'signed-off',
        'approval-invalidated',
        'signed-off',
        'signed-off',
      ])
    })
  })

  describe('given the signoff gate is enabled and change is in pending-signoff', () => {
    it('appends sign-off and drain transition without removing the pending history', async () => {
      const change = makePendingSignoffChange('legacy-signoff-history')
      const historyBefore = [...change.history]
      const repo = makeChangeRepository([change])

      const result = await buildApproveSignoff(repo).execute({
        name: change.name,
        reason: 'legacy signed',
      })

      expect(result.history.slice(0, historyBefore.length)).toEqual(historyBefore)
      expect(result.history.slice(-2).map((event) => event.type)).toEqual([
        'signed-off',
        'transitioned',
      ])
      expect(
        result.history.some(
          (event) => event.type === 'transitioned' && event.to === 'pending-signoff',
        ),
      ).toBe(true)
    })

    it('records the signoff event', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSignoff(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'implementation approved',
      })

      expect(result.activeSignoff).toBeDefined()
      expect(result.activeSignoff?.reason).toBe('implementation approved')
    })

    it('transitions the change to signed-off', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSignoff(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'ok',
      })

      expect(result.state).toBe('signed-off')
    })

    it('computes artifact hashes from loaded artifacts', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = buildApproveSignoff(repo)

      const result = await uc.execute({
        name: 'my-change',
        reason: 'signed off',
      })

      expect(result.activeSignoff?.artifactHashes).toBeDefined()
    })

    it('saves the updated change', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSignoff(repo)

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
      })

      expect(repo.store.get('my-change')?.state).toBe('signed-off')
    })

    it('persists through ChangeRepository.mutate', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSignoff(repo)

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
      })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('given the signoff gate is disabled', () => {
    it('throws ApprovalGateDisabledError', async () => {
      const repo = makeChangeRepository()
      const getSpy = vi.spyOn(repo, 'get')
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSignoff(repo, { approvals: { spec: false, signoff: false } })

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
      const uc = buildApproveSignoff(repo, { approvals: { spec: false, signoff: false } })

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
        }),
      ).rejects.toMatchObject({ code: 'APPROVAL_GATE_DISABLED' })
    })
  })

  describe('given the change is not in pending-signoff state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = buildApproveSignoff(repo)

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
      const change = makePendingSignoffChange('my-change', 'schema-a')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = buildApproveSignoff(repo, { schema: makeSchema({ name: 'schema-b' }) })

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
      const uc = buildApproveSignoff(repo)

      await expect(
        uc.execute({
          name: 'missing',
          reason: 'ok',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
