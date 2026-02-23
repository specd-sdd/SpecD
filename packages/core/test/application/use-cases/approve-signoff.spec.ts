import { describe, it, expect } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { makeChangeRepository, makeGitAdapter, testActor } from './helpers.js'

function makePendingSignoffChange(name: string): Change {
  const events: ChangeEvent[] = [
    { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: testActor },
    { type: 'transitioned', from: 'implementing', to: 'done', at: new Date(), by: testActor },
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

describe('ApproveSignoff', () => {
  describe('given the signoff gate is enabled and change is in pending-signoff', () => {
    it('records the signoff event', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        reason: 'implementation approved',
        artifactHashes: { 'spec.md': 'sha256:xyz' },
        approvalsSignoff: true,
      })

      expect(result.activeSignoff).toBeDefined()
      expect(result.activeSignoff?.reason).toBe('implementation approved')
    })

    it('transitions the change to signed-off', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        reason: 'ok',
        artifactHashes: {},
        approvalsSignoff: true,
      })

      expect(result.state).toBe('signed-off')
    })

    it('records the artifact hashes in the signoff event', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSignoff(repo, makeGitAdapter())
      const hashes = { 'spec.md': 'sha256:aaa', 'tasks.md': 'sha256:bbb' }

      const result = await uc.execute({
        name: 'my-change',
        reason: 'signed off',
        artifactHashes: hashes,
        approvalsSignoff: true,
      })

      expect(result.activeSignoff?.artifactHashes).toEqual(hashes)
    })

    it('saves the updated change', async () => {
      const change = makePendingSignoffChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
        artifactHashes: {},
        approvalsSignoff: true,
      })

      expect(repo.store.get('my-change')?.state).toBe('signed-off')
    })
  })

  describe('given the signoff gate is disabled', () => {
    it('throws ApprovalGateDisabledError', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          artifactHashes: {},
          approvalsSignoff: false,
        }),
      ).rejects.toThrow(ApprovalGateDisabledError)
    })

    it('ApprovalGateDisabledError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          artifactHashes: {},
          approvalsSignoff: false,
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
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      await expect(
        uc.execute({ name: 'my-change', reason: 'ok', artifactHashes: {}, approvalsSignoff: true }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSignoff(repo, makeGitAdapter())

      await expect(
        uc.execute({ name: 'missing', reason: 'ok', artifactHashes: {}, approvalsSignoff: true }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
