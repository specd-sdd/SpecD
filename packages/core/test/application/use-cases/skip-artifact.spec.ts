import { describe, it, expect, vi } from 'vitest'
import { SkipArtifact } from '../../../src/application/use-cases/skip-artifact.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ArtifactNotFoundError } from '../../../src/application/errors/artifact-not-found-error.js'
import { ArtifactNotOptionalError } from '../../../src/domain/errors/artifact-not-optional-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { Change } from '../../../src/domain/entities/change.js'
import { makeChangeRepository, makeActorResolver } from './helpers.js'

/** Creates a Change with a pre-loaded artifact map. */
function makeChangeWithArtifact(name: string, artifact: ChangeArtifact): Change {
  const artifacts = new Map<string, ChangeArtifact>([[artifact.type, artifact]])
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history: [],
    artifacts,
  })
}

describe('SkipArtifact', () => {
  describe('given an optional artifact', () => {
    it('skips the artifact successfully', async () => {
      const artifact = new ChangeArtifact({
        type: 'proposal',
        optional: true,
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', artifactId: 'proposal' })

      const updated = result.getArtifact('proposal')
      expect(updated).not.toBeNull()
      expect(updated!.status).toBe('skipped')
    })

    it('saves the change after skipping', async () => {
      const artifact = new ChangeArtifact({
        type: 'proposal',
        optional: true,
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      await uc.execute({ name: 'my-change', artifactId: 'proposal' })

      const saved = repo.store.get('my-change')
      expect(saved).toBeDefined()
      expect(saved!.getArtifact('proposal')!.status).toBe('skipped')
    })

    it('records the reason when provided', async () => {
      const artifact = new ChangeArtifact({
        type: 'proposal',
        optional: true,
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      const result = await uc.execute({
        name: 'my-change',
        artifactId: 'proposal',
        reason: 'Not needed for this change',
      })

      const skippedEvent = result.history.find((e) => e.type === 'artifact-skipped')
      expect(skippedEvent).toBeDefined()
      if (skippedEvent?.type === 'artifact-skipped') {
        expect(skippedEvent.reason).toBe('Not needed for this change')
      }
    })

    it('omits reason from event when not provided', async () => {
      const artifact = new ChangeArtifact({
        type: 'proposal',
        optional: true,
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      const result = await uc.execute({ name: 'my-change', artifactId: 'proposal' })

      const skippedEvent = result.history.find((e) => e.type === 'artifact-skipped')
      expect(skippedEvent).toBeDefined()
      if (skippedEvent?.type === 'artifact-skipped') {
        expect('reason' in skippedEvent).toBe(false)
      }
    })

    it('persists through ChangeRepository.mutate', async () => {
      const artifact = new ChangeArtifact({
        type: 'proposal',
        optional: true,
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = new SkipArtifact(repo, makeActorResolver())

      await uc.execute({ name: 'my-change', artifactId: 'proposal' })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('when the change does not exist', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new SkipArtifact(repo, makeActorResolver())

      await expect(uc.execute({ name: 'missing', artifactId: 'proposal' })).rejects.toThrow(
        ChangeNotFoundError,
      )
    })
  })

  describe('when the artifact does not exist on the change', () => {
    it('throws ArtifactNotFoundError', async () => {
      const change = new Change({
        name: 'my-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        history: [],
      })
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      await expect(uc.execute({ name: 'my-change', artifactId: 'nonexistent' })).rejects.toThrow(
        ArtifactNotFoundError,
      )
    })
  })

  describe('when the artifact is not optional', () => {
    it('throws ArtifactNotOptionalError', async () => {
      const artifact = new ChangeArtifact({
        type: 'spec',
        optional: false,
        files: new Map([['spec', new ArtifactFile({ key: 'spec', filename: 'spec.md' })]]),
      })
      const change = makeChangeWithArtifact('my-change', artifact)
      const repo = makeChangeRepository([change])
      const uc = new SkipArtifact(repo, makeActorResolver())

      await expect(uc.execute({ name: 'my-change', artifactId: 'spec' })).rejects.toThrow(
        ArtifactNotOptionalError,
      )
    })
  })
})
