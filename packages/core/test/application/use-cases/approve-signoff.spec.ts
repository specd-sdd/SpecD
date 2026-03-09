import { describe, it, expect, vi } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  makeChangeRepository,
  makeGitAdapter,
  makeSchemaRegistry,
  makeSchema,
  makeContentHasher,
  testActor,
} from './helpers.js'

function makePendingSignoffChange(name: string): Change {
  const events: ChangeEvent[] = [
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
    workspaces: ['default'],
    specIds: ['auth/login'],
    history: events,
  })
}

const defaultInput = {
  approvalsSignoff: true,
  schemaRef: '@specd/schema-std',
  workspaceSchemasPaths: new Map<string, string>(),
}

describe('ApproveSignoff', () => {
  describe('given the signoff gate is enabled and change is in pending-signoff', () => {
    it('records the signoff event', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'my-change',
        reason: 'implementation approved',
        ...defaultInput,
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
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'my-change',
        reason: 'ok',
        ...defaultInput,
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
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        hasher,
      )

      const result = await uc.execute({
        name: 'my-change',
        reason: 'signed off',
        ...defaultInput,
      })

      expect(result.activeSignoff?.artifactHashes).toBeDefined()
    })

    it('saves the updated change', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
        ...defaultInput,
      })

      expect(repo.store.get('my-change')?.state).toBe('signed-off')
    })
  })

  describe('given the signoff gate is disabled', () => {
    it('throws ApprovalGateDisabledError', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(),
        makeContentHasher(),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          approvalsSignoff: false,
          schemaRef: '@specd/schema-std',
          workspaceSchemasPaths: new Map(),
        }),
      ).rejects.toThrow(ApprovalGateDisabledError)
    })

    it('ApprovalGateDisabledError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(),
        makeContentHasher(),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          approvalsSignoff: false,
          schemaRef: '@specd/schema-std',
          workspaceSchemasPaths: new Map(),
        }),
      ).rejects.toMatchObject({ code: 'APPROVAL_GATE_DISABLED' })
    })
  })

  describe('given the change is not in pending-signoff state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = new Change({
        name: 'my-change',
        createdAt: new Date(),
        workspaces: ['default'],
        specIds: ['auth/login'],
        history: [],
      })
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        makeContentHasher(),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          ...defaultInput,
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(
        repo,
        makeGitAdapter(),
        makeSchemaRegistry(makeSchema()),
        makeContentHasher(),
      )

      await expect(
        uc.execute({
          name: 'missing',
          reason: 'ok',
          ...defaultInput,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
