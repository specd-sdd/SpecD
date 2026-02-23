import { describe, it, expect } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { makeChangeRepository, makeChange } from './helpers.js'

describe('GetStatus', () => {
  describe('given a change exists', () => {
    it('returns the change', async () => {
      const change = makeChange('add-oauth')
      const repo = makeChangeRepository([change])
      const uc = new GetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.change).toBe(change)
    })

    it('returns empty artifact statuses when change has no artifacts', async () => {
      const change = makeChange('add-oauth')
      const repo = makeChangeRepository([change])
      const uc = new GetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.artifactStatuses).toHaveLength(0)
    })

    it('returns effective status for each artifact', async () => {
      const change = makeChange('add-oauth')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          filename: 'proposal.md',
          status: 'complete',
          requires: [],
        }),
      )
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          requires: ['proposal'],
        }),
      )
      const repo = makeChangeRepository([change])
      const uc = new GetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.artifactStatuses).toHaveLength(2)
      const proposalEntry = result.artifactStatuses.find((e) => e.type === 'proposal')
      const specEntry = result.artifactStatuses.find((e) => e.type === 'spec')
      expect(proposalEntry?.effectiveStatus).toBe('complete')
      expect(specEntry?.effectiveStatus).toBe('complete')
    })

    it('cascades dependency blocking into effective status', async () => {
      const change = makeChange('add-oauth')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          filename: 'proposal.md',
          status: 'in-progress',
          requires: [],
        }),
      )
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          requires: ['proposal'],
        }),
      )
      const repo = makeChangeRepository([change])
      const uc = new GetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      const specEntry = result.artifactStatuses.find((e) => e.type === 'spec')
      expect(specEntry?.effectiveStatus).toBe('in-progress')
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new GetStatus(repo)

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })

    it('ChangeNotFoundError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = new GetStatus(repo)

      await expect(uc.execute({ name: 'missing' })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      })
    })
  })
})
