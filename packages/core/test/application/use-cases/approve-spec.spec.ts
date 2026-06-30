import { describe, it, expect, vi } from 'vitest'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
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
  describe('given the spec approval gate is enabled and change is in pending-spec-approval', () => {
    it('records the spec approval event', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
      )

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
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
      )

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
      const hasher = makeContentHasher()
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        hasher,
        { spec: true, signoff: false },
      )

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
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
      )

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
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
      )

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
      const uc = new ApproveSpec(
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
      const uc = new ApproveSpec(
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

  describe('given the change is not in pending-spec-approval state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
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
      const change = makePendingSpecApprovalChange('my-change', 'schema-a')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema({ name: 'schema-b' })),
        makeContentHasher(),
        { spec: true, signoff: false },
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
      const uc = new ApproveSpec(
        repo,
        makeActorResolver(),
        makeSchemaProvider(makeSchema()),
        makeContentHasher(),
        { spec: true, signoff: false },
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
