import { describe, expect, it, vi } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { GetChangeArtifact } from '../../../src/application/use-cases/get-change-artifact.js'
import { ChangeArtifactFileNotFoundError } from '../../../src/application/errors/change-artifact-file-not-found-error.js'
import { makeChangeRepository, testActor } from './helpers.js'

const fixedUpdatedAt = new Date('2026-05-25T10:00:00.000Z')

function makeChangeWithProposal(): Change {
  const proposal = new ChangeArtifact({
    type: 'proposal',
    optional: false,
    requires: [],
    files: new Map([
      [
        'proposal',
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'complete',
          validatedHash: 'sha256:old',
        }),
      ],
    ]),
  })
  return new Change({
    name: 'studio-save',
    createdAt: fixedUpdatedAt,
    updatedAt: fixedUpdatedAt,
    specIds: ['core:change'],
    history: [
      {
        type: 'created',
        at: fixedUpdatedAt,
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'schema-std',
        schemaVersion: 1,
      },
    ],
    artifacts: new Map([['proposal', proposal]]),
  })
}

describe('GetChangeArtifact', () => {
  it('returns content and originalHash from repository', async () => {
    const change = makeChangeWithProposal()
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(
      new SpecArtifact('proposal.md', '# Title', 'sha256:hash'),
    )

    const sut = new GetChangeArtifact(repo)
    const result = await sut.execute({ name: 'studio-save', filename: 'proposal.md' })

    expect(result.content).toBe('# Title')
    expect(result.originalHash).toBe('sha256:hash')
  })

  it('keeps updatedAt stable across repeated reads', async () => {
    const change = makeChangeWithProposal()
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(
      new SpecArtifact('proposal.md', '# Title', 'sha256:hash'),
    )
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const saveSpy = vi.spyOn(repo, 'save')

    const sut = new GetChangeArtifact(repo)
    await sut.execute({ name: 'studio-save', filename: 'proposal.md' })
    await sut.execute({ name: 'studio-save', filename: 'proposal.md' })

    const persisted = await repo.get('studio-save')
    expect(persisted?.updatedAt.toISOString()).toBe(fixedUpdatedAt.toISOString())
    expect(mutateSpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('rejects untracked filenames before read', async () => {
    const repo = makeChangeRepository([makeChangeWithProposal()])
    const artifactSpy = vi.spyOn(repo, 'artifact')

    const sut = new GetChangeArtifact(repo)

    await expect(
      sut.execute({ name: 'studio-save', filename: 'missing.md' }),
    ).rejects.toBeInstanceOf(ChangeArtifactFileNotFoundError)
    expect(artifactSpy).not.toHaveBeenCalled()
  })

  it('does not call mutate on the happy path', async () => {
    const repo = makeChangeRepository([makeChangeWithProposal()])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    vi.spyOn(repo, 'artifact').mockResolvedValue(
      new SpecArtifact('proposal.md', '# Title', 'sha256:hash'),
    )

    const sut = new GetChangeArtifact(repo)
    await sut.execute({ name: 'studio-save', filename: 'proposal.md' })

    expect(mutateSpy).not.toHaveBeenCalled()
  })
})
