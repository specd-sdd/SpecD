import { describe, it, expect, vi } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeContentHasher,
  makeChange,
  testActor,
} from './helpers.js'

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
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history: events,
  })
}

describe('ApproveSignoff', () => {
  describe('given the signoff gate is enabled and change is in pending-signoff', () => {
    it('records the signoff event', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const hasher = makeContentHasher()
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        hasher,
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(),
        makeContentHasher(),
        { spec: false, signoff: false },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(),
        makeContentHasher(),
        { spec: false, signoff: false },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema({ name: 'schema-b' })),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

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
      const uc = new ApproveSignoff(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: false, signoff: true },
      )

      await expect(
        uc.execute({
          name: 'missing',
          reason: 'ok',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
