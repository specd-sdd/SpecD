import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidInvalidateTargetError } from '../../../src/application/errors/invalid-invalidate-target-error.js'
import { InvalidateRequiresForceError } from '../../../src/application/errors/invalidate-requires-force-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  testActor,
} from './helpers.js'

function makeChangeWithDAG(name: string): Change {
  const at = new Date('2024-01-15T10:00:00.000Z')
  const change = new Change({
    name,
    createdAt: at,
    specIds: ['auth/login'],
    history: [
      {
        type: 'created',
        at,
        by: testActor,
        specIds: ['auth/login'],
        schemaName: '@specd/schema-std',
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
                validatedHash: 'sha256:p',
              }),
            ],
          ]),
        }),
      ],
      [
        'design',
        new ChangeArtifact({
          type: 'design',
          requires: ['proposal'],
          files: new Map([
            [
              'design',
              new ArtifactFile({
                key: 'design',
                filename: 'design.md',
                status: 'complete',
                validatedHash: 'sha256:d',
              }),
            ],
          ]),
        }),
      ],
      [
        'tasks',
        new ChangeArtifact({
          type: 'tasks',
          requires: ['design'],
          files: new Map([
            [
              'tasks',
              new ArtifactFile({
                key: 'tasks',
                filename: 'tasks.md',
                status: 'complete',
                validatedHash: 'sha256:t',
              }),
            ],
          ]),
        }),
      ],
    ]),
  })
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

describe('InvalidateChange', () => {
  const schema = makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('design', { requires: ['proposal'] }),
    makeArtifactType('tasks', { requires: ['design'] }),
  ])

  it('throws ChangeNotFoundError when change does not exist', async () => {
    const uc = new InvalidateChange(
      makeChangeRepository(),
      makeActorResolver(),
      makeSchemaProvider(schema),
    )
    await expect(uc.execute({ name: 'missing', reason: 'test' })).rejects.toThrow(
      ChangeNotFoundError,
    )
  })

  describe('target validation', () => {
    it('rejects targets with none policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: 'none',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('not allowed with policy'),
      })
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: 'none',
        }),
      ).rejects.toThrow(InvalidInvalidateTargetError)
    })

    it('rejects targets with global policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: 'global',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('not allowed with policy'),
      })
    })

    it('requires targets with surgical policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({ name: 'c1', reason: 'test', policyOverride: 'surgical' }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('At least one --target'),
      })
    })

    it('requires targets with downstream policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({ name: 'c1', reason: 'test', policyOverride: 'downstream' }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('At least one --target'),
      })
    })

    it('rejects unknown artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'unknown' }],
          policyOverride: 'surgical',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining("Unknown artifact 'unknown'"),
      })
    })

    it('rejects specId on scope:change artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design', specId: 'foo' }],
          policyOverride: 'surgical',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('is scope:change'),
      })
    })
  })

  describe('approval guard', () => {
    it('blocks invalidation when change has active spec approval', async () => {
      const change = makeChangeWithDAG('c1')
      change.recordSpecApproval('LGTM', { proposal: 'sha256:p' }, testActor)
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: 'surgical',
        }),
      ).rejects.toMatchObject({
        code: 'INVALIDATE_REQUIRES_FORCE',
        message: expect.stringContaining('invalidate the active approval/signoff'),
      })
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: 'surgical',
        }),
      ).rejects.toThrow(InvalidateRequiresForceError)
    })

    it('allows invalidation with force when change has active approval', async () => {
      const change = makeChangeWithDAG('c1')
      change.recordSpecApproval('LGTM', { proposal: 'sha256:p' }, testActor)
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      const result = await uc.execute({
        name: 'c1',
        reason: 'forced',
        targets: [{ artifactId: 'design' }],
        policyOverride: 'surgical',
        force: true,
      })
      expect(result.change.state).toBe('designing')
    })
  })

  describe('policy none', () => {
    it('transitions to designing but returns empty affected set', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        policyOverride: 'none',
      })
      expect(result.effectivePolicy).toBe('none')
      expect(result.affected).toHaveLength(0)
      expect(result.change.state).toBe('designing')
      expect(result.change.getArtifact('design')?.status).toBe('complete')
    })
  })

  describe('policy surgical', () => {
    it('reopens only the targeted artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'design' }],
        policyOverride: 'surgical',
      })
      expect(result.effectivePolicy).toBe('surgical')
      expect(result.change.getArtifact('proposal')?.status).toBe('complete')
      expect(result.change.getArtifact('design')?.status).toBe('pending-review')
      expect(result.change.getArtifact('tasks')?.status).toBe('complete')
      expect(result.affected).toHaveLength(1)
      expect(result.affected[0]).toEqual(
        expect.objectContaining({ artifactId: 'design', expansion: 'direct' }),
      )
    })
  })

  describe('policy downstream', () => {
    it('reopens targets and DAG descendants', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'design' }],
        policyOverride: 'downstream',
      })
      expect(result.change.getArtifact('proposal')?.status).toBe('complete')
      expect(result.change.getArtifact('design')?.status).toBe('pending-review')
      expect(result.change.getArtifact('tasks')?.status).toBe('pending-review')
      const types = result.affected.map((a) => a.artifactId).sort()
      expect(types).toEqual(['design', 'tasks'])
      expect(result.affected.find((a) => a.artifactId === 'tasks')?.expansion).toBe('downstream')
    })

    it('reports affected artifacts in linear DAG-forest traversal order', async () => {
      const schemaWithBranches = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('design', { requires: ['proposal'] }),
        makeArtifactType('verify', { requires: ['proposal'] }),
        makeArtifactType('tasks', { requires: ['design'] }),
        makeArtifactType('notes', { requires: ['verify'] }),
      ])
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c1',
        createdAt: at,
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at,
            by: testActor,
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
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
                    validatedHash: 'sha256:p',
                  }),
                ],
              ]),
            }),
          ],
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: ['proposal'],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    status: 'complete',
                    validatedHash: 'sha256:d',
                  }),
                ],
              ]),
            }),
          ],
          [
            'verify',
            new ChangeArtifact({
              type: 'verify',
              requires: ['proposal'],
              files: new Map([
                [
                  'verify',
                  new ArtifactFile({
                    key: 'verify',
                    filename: 'verify.md',
                    status: 'complete',
                    validatedHash: 'sha256:v',
                  }),
                ],
              ]),
            }),
          ],
          [
            'tasks',
            new ChangeArtifact({
              type: 'tasks',
              requires: ['design'],
              files: new Map([
                [
                  'tasks',
                  new ArtifactFile({
                    key: 'tasks',
                    filename: 'tasks.md',
                    status: 'complete',
                    validatedHash: 'sha256:t',
                  }),
                ],
              ]),
            }),
          ],
          [
            'notes',
            new ChangeArtifact({
              type: 'notes',
              requires: ['verify'],
              files: new Map([
                [
                  'notes',
                  new ArtifactFile({
                    key: 'notes',
                    filename: 'notes.md',
                    status: 'complete',
                    validatedHash: 'sha256:n',
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })
      change.transition('designing', testActor)
      change.transition('ready', testActor)
      change.transition('implementing', testActor)

      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(
        repo,
        makeActorResolver(),
        makeSchemaProvider(schemaWithBranches),
      )
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'proposal' }, { artifactId: 'verify' }],
        policyOverride: 'downstream',
      })

      expect(result.affected.map((entry) => entry.artifactId)).toEqual([
        'proposal',
        'verify',
        'design',
        'tasks',
        'notes',
      ])
    })
  })

  describe('policy global', () => {
    it('reopens all artifacts', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        policyOverride: 'global',
      })
      expect(result.change.getArtifact('proposal')?.status).toBe('pending-review')
      expect(result.change.getArtifact('design')?.status).toBe('pending-review')
      expect(result.change.getArtifact('tasks')?.status).toBe('pending-review')
      const types = result.affected.map((a) => a.artifactId).sort()
      expect(types).toEqual(['design', 'proposal', 'tasks'])
    })
  })

  it('uses change persisted policy when no override provided', async () => {
    const change = makeChangeWithDAG('c1')
    change.invalidationPolicy = 'surgical'
    const repo = makeChangeRepository([change])
    const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
    const result = await uc.execute({
      name: 'c1',
      reason: 'review',
      targets: [{ artifactId: 'design' }],
    })
    expect(result.effectivePolicy).toBe('surgical')
    expect(result.change.getArtifact('tasks')?.status).toBe('complete')
  })

  it('accumulates all target errors instead of throwing on first', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
    await expect(
      uc.execute({
        name: 'c1',
        reason: 'test',
        targets: [{ artifactId: 'unknown' }, { artifactId: 'design', specId: 'foo' }],
        policyOverride: 'surgical',
      }),
    ).rejects.toThrow('Invalid targets:')
    try {
      await uc.execute({
        name: 'c1',
        reason: 'test',
        targets: [{ artifactId: 'unknown' }, { artifactId: 'design', specId: 'foo' }],
        policyOverride: 'surgical',
      })
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain("Unknown artifact 'unknown'")
      expect(msg).toContain('is scope:change')
    }
  })

  it('does not set hasDrift when invalidating with artifact-review-required cause', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
    const result = await uc.execute({
      name: 'c1',
      reason: 'manual review',
      targets: [{ artifactId: 'design' }],
      policyOverride: 'surgical',
    })
    const designFile = result.change.getArtifact('design')?.getFile('design')
    expect(designFile?.hasDrift).toBe(false)
  })

  it('records invalidated event with cause artifact-review-required and the reason', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
    const result = await uc.execute({
      name: 'c1',
      reason: 'semantic drift detected',
      targets: [{ artifactId: 'design' }],
      policyOverride: 'surgical',
    })
    const invalidated = result.change.history.filter((e) => e.type === 'invalidated')
    expect(invalidated).toHaveLength(1)
    expect(invalidated[0]).toEqual(
      expect.objectContaining({
        type: 'invalidated',
        cause: 'artifact-review-required',
        message: 'semantic drift detected',
      }),
    )
  })

  it('succeeds when target file is already in pending-review', async () => {
    const change = makeChangeWithDAG('c1')
    const designArtifact = change.getArtifact('design')
    if (designArtifact === null) {
      throw new Error('expected design artifact')
    }
    const designFile = designArtifact.getFile('design')
    if (designFile === undefined) {
      throw new Error('expected design file')
    }
    designFile.markPendingReview()
    const repo = makeChangeRepository([change])
    const uc = new InvalidateChange(repo, makeActorResolver(), makeSchemaProvider(schema))
    const result = await uc.execute({
      name: 'c1',
      reason: 're-invalidate',
      targets: [{ artifactId: 'design' }],
      policyOverride: 'surgical',
    })
    expect(result.change.state).toBe('designing')
    expect(result.change.getArtifact('design')?.status).toBe('pending-review')
  })
})
