import { describe, expect, it, vi } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { SaveChangeArtifact } from '../../../src/application/use-cases/save-change-artifact.js'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { SaveRequiresForceError } from '../../../src/application/errors/save-requires-force-error.js'
import { ChangeArtifactFileNotFoundError } from '../../../src/application/errors/change-artifact-file-not-found-error.js'
import { makeChangeRepository, makeSchemaProvider, testActor } from './helpers.js'

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
    createdAt: new Date('2026-05-25T10:00:00.000Z'),
    updatedAt: new Date('2026-05-25T10:00:00.000Z'),
    specIds: ['core:change'],
    history: [
      {
        type: 'created',
        at: new Date('2026-05-25T10:00:00.000Z'),
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'schema-std',
        schemaVersion: 1,
      },
    ],
    artifacts: new Map([['proposal', proposal]]),
  })
}

describe('SaveChangeArtifact', () => {
  it('rejects untracked filenames before write', async () => {
    const repo = makeChangeRepository([makeChangeWithProposal()])
    const sut = new SaveChangeArtifact(repo, makeSchemaProvider(), {
      hash: (content) => `sha256:${content.length}`,
    })

    await expect(
      sut.execute({
        name: 'studio-save',
        filename: 'missing.md',
        content: 'x',
        originalHash: 'sha256:0',
        actor: testActor,
      }),
    ).rejects.toBeInstanceOf(ChangeArtifactFileNotFoundError)
  })

  it('requires force when approval is active', async () => {
    const change = makeChangeWithProposal()
    change.recordSpecApproval('ok', { proposal: 'sha256:p' }, testActor)
    const repo = makeChangeRepository([change])
    const sut = new SaveChangeArtifact(repo, makeSchemaProvider(), { hash: () => 'sha256:1' })

    await expect(
      sut.execute({
        name: 'studio-save',
        filename: 'proposal.md',
        content: 'new',
        originalHash: 'sha256:old',
        actor: testActor,
      }),
    ).rejects.toBeInstanceOf(SaveRequiresForceError)
  })

  it('saves tracked content and bumps updatedAt', async () => {
    const repo = makeChangeRepository([makeChangeWithProposal()])
    const written: SpecArtifact[] = []
    vi.spyOn(repo, 'saveArtifact').mockImplementation(async (_change, artifact) => {
      written.push(artifact)
    })
    vi.spyOn(repo, 'reconcileArtifactDrift').mockResolvedValue(false)

    const sut = new SaveChangeArtifact(repo, makeSchemaProvider(), {
      hash: () => 'sha256:abc',
    })

    const result = await sut.execute({
      name: 'studio-save',
      filename: 'proposal.md',
      content: 'hello',
      originalHash: 'sha256:old',
      actor: testActor,
    })

    expect(result.contentHash).toBe('sha256:abc')
    expect(result.invalidated).toBe(false)
    expect(written[0]?.content).toBe('hello')

    const persisted = await repo.get('studio-save')
    expect(persisted?.getArtifact('proposal')?.files.get('proposal')?.status).toBe('in-progress')
    expect(persisted?.updatedAt.getTime()).toBeGreaterThan(
      new Date('2026-05-25T10:00:00.000Z').getTime(),
    )
  })
})

describe('GetStatus ifModifiedSince', () => {
  it('short-circuits when client revision is current', async () => {
    const change = makeChangeWithProposal()
    const repo = makeChangeRepository([change])
    const sut = new GetStatus(repo, makeSchemaProvider(), { spec: false, signoff: false })

    const result = await sut.execute({
      name: 'studio-save',
      ifModifiedSince: change.updatedAt.toISOString(),
    })

    expect(result.unchanged).toBe(true)
    expect(result.artifactStatuses).toHaveLength(0)
    expect(result.change).toBeDefined()
    if (!result.change) {
      throw new Error('Expected active change in GetStatus result')
    }
    expect(result.change.updatedAt.toISOString()).toBe(change.updatedAt.toISOString())
  })
})
