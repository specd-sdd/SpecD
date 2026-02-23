import { describe, it, expect } from 'vitest'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { makeChangeRepository, makeGitAdapter, testActor } from './helpers.js'

function makePendingSpecApprovalChange(name: string): Change {
  const events: ChangeEvent[] = [
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
    workspaces: ['default'],
    specIds: ['auth/login'],
    history: events,
  })
}

describe('ApproveSpec', () => {
  describe('given the spec approval gate is enabled and change is in pending-spec-approval', () => {
    it('records the spec approval event', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSpec(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        reason: 'looks good',
        artifactHashes: { 'spec.md': 'sha256:abc' },
        approvalsSpec: true,
      })

      expect(result.activeSpecApproval).toBeDefined()
      expect(result.activeSpecApproval?.reason).toBe('looks good')
    })

    it('transitions the change to spec-approved', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSpec(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        reason: 'looks good',
        artifactHashes: { 'spec.md': 'sha256:abc' },
        approvalsSpec: true,
      })

      expect(result.state).toBe('spec-approved')
    })

    it('records the artifact hashes in the approval event', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSpec(repo, makeGitAdapter())
      const hashes = { 'proposal.md': 'sha256:aaa', 'spec.md': 'sha256:bbb' }

      const result = await uc.execute({
        name: 'my-change',
        reason: 'approved',
        artifactHashes: hashes,
        approvalsSpec: true,
      })

      expect(result.activeSpecApproval?.artifactHashes).toEqual(hashes)
    })

    it('saves the updated change', async () => {
      const change = makePendingSpecApprovalChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new ApproveSpec(repo, makeGitAdapter())

      await uc.execute({
        name: 'my-change',
        reason: 'ok',
        artifactHashes: {},
        approvalsSpec: true,
      })

      expect(repo.store.get('my-change')?.state).toBe('spec-approved')
    })
  })

  describe('given the spec approval gate is disabled', () => {
    it('throws ApprovalGateDisabledError before loading the change', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSpec(repo, makeGitAdapter())

      await expect(
        uc.execute({
          name: 'my-change',
          reason: 'ok',
          artifactHashes: {},
          approvalsSpec: false,
        }),
      ).rejects.toThrow(ApprovalGateDisabledError)
    })

    it('ApprovalGateDisabledError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSpec(repo, makeGitAdapter())

      await expect(
        uc.execute({ name: 'my-change', reason: 'ok', artifactHashes: {}, approvalsSpec: false }),
      ).rejects.toMatchObject({ code: 'APPROVAL_GATE_DISABLED' })
    })
  })

  describe('given the change is not in pending-spec-approval state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = new Change({
        name: 'my-change',
        createdAt: new Date(),
        workspaces: ['default'],
        specIds: ['auth/login'],
        history: [],
      })
      const repo = makeChangeRepository([change])
      const uc = new ApproveSpec(repo, makeGitAdapter())

      await expect(
        uc.execute({ name: 'my-change', reason: 'ok', artifactHashes: {}, approvalsSpec: true }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new ApproveSpec(repo, makeGitAdapter())

      await expect(
        uc.execute({ name: 'missing', reason: 'ok', artifactHashes: {}, approvalsSpec: true }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })
})
