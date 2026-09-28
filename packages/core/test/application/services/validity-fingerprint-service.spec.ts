import { describe, expect, it } from 'vitest'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { Change } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import {
  makeArtifactType,
  makeChangeRepository,
  makeSchema,
  makeSchemaProvider,
  StubChangeRepository,
  testActor,
} from '../use-cases/helpers.js'

const hasher = new NodeContentHasher()

function changeWithProposal(content: string): Change {
  const at = new Date('2026-01-01T00:00:00.000Z')
  return new Change({
    name: 'c1',
    createdAt: at,
    specIds: ['core:change'],
    history: [
      {
        type: 'created',
        at,
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'test-schema',
        schemaVersion: 1,
      },
    ],
    artifacts: new Map([
      [
        'proposal',
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: hasher.hash(content),
              }),
            ],
          ]),
        }),
      ],
      [
        'tasks',
        new ChangeArtifact({
          type: 'tasks',
          requires: [],
          files: new Map([
            [
              'tasks',
              new ArtifactFile({
                key: 'tasks',
                filename: 'tasks.md',
                status: 'complete',
                validatedHash: 'sha256:ignored',
              }),
            ],
          ]),
        }),
      ],
    ]),
    implementationLinks: [
      { specId: 'core:change', file: 'src/a.ts', fileLinkExplicit: true },
      { specId: 'core:change', file: './src/a.ts', fileLinkExplicit: true },
    ],
  })
}

class FingerprintRepo extends StubChangeRepository {
  constructor(change: Change) {
    super([change])
  }

  override async artifact(): Promise<SpecArtifact | null> {
    return new SpecArtifact('proposal.md', 'hello\n')
  }

  override async implementationFile(
    _change: Change,
    projectRelativePath: string,
  ): Promise<
    | { readonly status: 'found'; readonly path: string; readonly bytes: Uint8Array }
    | { readonly status: 'missing'; readonly path: string }
  > {
    if (projectRelativePath === 'src/a.ts') {
      return {
        status: 'found',
        path: projectRelativePath,
        bytes: new TextEncoder().encode('export const a = 1\n'),
      }
    }
    return { status: 'missing', path: projectRelativePath }
  }
}

describe('ValidityFingerprintService', () => {
  const schema = makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('tasks', { hasTasks: true }),
  ])

  it('hashes non-task artifacts, deduplicates links, and excludes task content', async () => {
    const change = changeWithProposal('hello\n')
    const service = new ValidityFingerprintService({
      changes: new FingerprintRepo(change),
      hasher,
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(schema),
    })
    const result = await service.completeFingerprint(change)
    expect(result.failures).toEqual([])
    expect(result.fingerprint?.artifacts.files).toEqual({
      'proposal:proposal': hasher.hash('hello\n'),
    })
    expect(result.fingerprint?.implementation.files['src/a.ts']).toEqual(
      expect.objectContaining({ content: 'text', normalization: 'text-v1' }),
    )
    expect(Object.keys(result.fingerprint?.implementation.files ?? {})).toEqual(['src/a.ts'])
  })

  it('excludes a hasTasks artifact whose file is not named tasks.md', async () => {
    const change = changeWithProposal('hello\n')
    change.setArtifact(
      new ChangeArtifact({
        type: 'checklist',
        files: new Map([
          [
            'checklist',
            new ArtifactFile({
              key: 'checklist',
              filename: 'checklist.md',
              status: 'complete',
              validatedHash: 'sha256:ignored',
            }),
          ],
        ]),
      }),
    )
    const checklistSchema = makeSchema([
      makeArtifactType('proposal'),
      makeArtifactType('checklist', { hasTasks: true, output: 'checklist.md' }),
    ])
    const service = new ValidityFingerprintService({
      changes: new FingerprintRepo(change),
      hasher,
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(checklistSchema),
    })
    const result = await service.completeFingerprint(change)
    expect(result.failures).toEqual([])
    expect(result.fingerprint?.artifacts.files).toEqual({
      'proposal:proposal': hasher.hash('hello\n'),
    })
    expect(result.fingerprint?.artifacts.files).not.toHaveProperty('checklist:checklist')
  })

  it('returns a null fingerprint when an implementation file is missing', async () => {
    const change = changeWithProposal('hello\n')
    const repo = makeChangeRepository([change])
    const service = new ValidityFingerprintService({
      changes: repo,
      hasher,
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(schema),
    })
    const result = await service.completeFingerprint(change)
    expect(result.fingerprint).toBeNull()
    expect(result.failures.map((failure) => failure.reason)).toContain('missing')
  })
})
