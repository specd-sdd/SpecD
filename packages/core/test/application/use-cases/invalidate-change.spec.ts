import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidInvalidateTargetError } from '../../../src/application/errors/invalid-invalidate-target-error.js'
import { InvalidateRequiresForceError } from '../../../src/application/errors/invalidate-requires-force-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeSpecApprovalFingerprint,
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

  function createInvalidate(
    repo: ChangeRepository,
    activeSchema: Schema = schema,
    approvals: { readonly spec: boolean; readonly signoff: boolean } = {
      spec: false,
      signoff: false,
    },
  ): InvalidateChange {
    const schemaProvider = makeSchemaProvider(activeSchema)
    const reconcile = new ReconcileChangeValidity({
      changes: repo,
      schemaProvider,
      actor: makeActorResolver(),
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should not run')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: new ValidityFingerprintService({
        changes: repo,
        hasher: new NodeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      }),
      approvals,
    })
    return new InvalidateChange(repo, makeActorResolver(), schemaProvider, reconcile)
  }

  it('throws ChangeNotFoundError when change does not exist', async () => {
    const uc = createInvalidate(makeChangeRepository())
    await expect(uc.execute({ name: 'missing', reason: 'test' })).rejects.toThrow(
      ChangeNotFoundError,
    )
  })

  describe('target validation', () => {
    it('rejects targets with none policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'none' },
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
          policyOverride: { artifacts: 'none' },
        }),
      ).rejects.toThrow(InvalidInvalidateTargetError)
    })

    it('rejects targets with global policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'global' },
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('not allowed with policy'),
      })
    })

    it('requires targets with surgical policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({ name: 'c1', reason: 'test', policyOverride: { artifacts: 'surgical' } }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('At least one --target'),
      })
    })

    it('requires targets with downstream policy', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({ name: 'c1', reason: 'test', policyOverride: { artifacts: 'downstream' } }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining('At least one --target'),
      })
    })

    it('rejects unknown artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'unknown' }],
          policyOverride: { artifacts: 'surgical' },
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_INVALIDATE_TARGET',
        message: expect.stringContaining("Unknown artifact 'unknown'"),
      })
    })

    it('rejects specId on scope:change artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design', specId: 'foo' }],
          policyOverride: { artifacts: 'surgical' },
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
      change.recordSpecApproval(
        'LGTM',
        makeSpecApprovalFingerprint(change.specIds, { proposal: 'sha256:p' }),
        testActor,
      )
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'surgical' },
        }),
      ).rejects.toMatchObject({
        code: 'INVALIDATE_REQUIRES_FORCE',
        message: expect.stringContaining('revoke the reported gate(s)'),
      })
      await expect(
        uc.execute({
          name: 'c1',
          reason: 'test',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'surgical' },
        }),
      ).rejects.toThrow(InvalidateRequiresForceError)
    })

    it('allows invalidation with force when change has active approval', async () => {
      const change = makeChangeWithDAG('c1')
      change.recordSpecApproval(
        'LGTM',
        makeSpecApprovalFingerprint(change.specIds, { proposal: 'sha256:p' }),
        testActor,
      )
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      const result = await uc.execute({
        name: 'c1',
        reason: 'forced',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical' },
        force: true,
      })
      expect(result.change.state).toBe('implementing')
    })

    it('returns to designing when forced revocation affects required spec approval', async () => {
      const change = makeChangeWithDAG('c1')
      change.recordSpecApproval(
        'LGTM',
        makeSpecApprovalFingerprint(change.specIds, { proposal: 'sha256:p' }),
        testActor,
      )
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, schema, { spec: true, signoff: true })
      const result = await uc.execute({
        name: 'c1',
        reason: 'forced',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'preserve' },
        force: true,
      })
      expect(result.automaticReturn).toEqual({
        cause: 'spec-approval',
        from: 'implementing',
        to: 'designing',
      })
      expect(result.change.state).toBe('designing')
      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'downstream',
        workflow: 'preserve',
      })
      expect(result.projectionChanges.map((changeItem) => changeItem.projection)).toContain(
        'specApproval',
      )
      expect(result.reason).toBe('forced')
    })

    it('does not require force for already-stale historical approval evidence', async () => {
      const change = makeChangeWithDAG('c1')
      change.recordSpecApproval(
        'LGTM',
        makeSpecApprovalFingerprint(change.specIds, { proposal: 'sha256:p' }),
        testActor,
      )
      change.markApprovalInvalid('spec', 'stale', {
        at: new Date(),
        by: testActor,
        cause: 'artifact-drift',
        reason: 'Already stale',
        differences: [],
      })
      const result = await createInvalidate(makeChangeRepository([change]), schema, {
        spec: true,
        signoff: false,
      }).execute({
        name: change.name,
        reason: 'review stale evidence',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'preserve' },
      })

      expect(result.reason).toBe('review stale evidence')
      expect(result.projectionChanges).not.toContainEqual(
        expect.objectContaining({ projection: 'specApproval', to: 'revoked' }),
      )
    })

    it('reports the evaluator-selected done target for forced valid sign-off', async () => {
      const change = makeChangeWithDAG('c1')
      change.transition('verifying', testActor)
      change.transition('done', testActor)
      change.transition('archivable', testActor)
      change.recordSignoff('Ship it', {}, testActor)
      const result = await createInvalidate(makeChangeRepository([change]), schema, {
        spec: false,
        signoff: true,
      }).execute({
        name: change.name,
        reason: 'withdraw sign-off',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'preserve' },
        force: true,
      })

      expect(result.automaticReturn).toEqual({
        cause: 'signoff',
        from: 'archivable',
        to: 'done',
      })
      expect(result.change.state).toBe('done')
      expect(result.nextAction).toMatchObject({ targetStep: 'done', command: '/specd-verify' })
    })
  })

  describe('policy none', () => {
    it('reopens nothing and returns an empty affected set', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        policyOverride: { artifacts: 'none' },
      })
      expect(result.effectivePolicy).toEqual({ artifacts: 'none', workflow: 'preserve' })
      expect(result.affected).toHaveLength(0)
      expect(result.change.state).toBe('implementing')
      expect(result.change.getArtifact('design')?.status).toBe('complete')
    })
  })

  describe('policy surgical', () => {
    it('reopens only the targeted artifact', async () => {
      const change = makeChangeWithDAG('c1')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo)
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical' },
      })
      expect(result.effectivePolicy).toEqual({ artifacts: 'surgical', workflow: 'preserve' })
      expect(result.change.invalidationPolicy).toEqual({
        artifacts: 'downstream',
        workflow: 'preserve',
      })
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
      const uc = createInvalidate(repo)
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'downstream' },
      })
      expect(result.change.getArtifact('proposal')?.status).toBe('complete')
      expect(result.change.getArtifact('design')?.status).toBe('pending-review')
      expect(result.change.getArtifact('tasks')?.status).toBe('pending-review')
      const types = result.affected.map((a) => a.artifactId).sort()
      expect(types).toEqual(['design', 'tasks'])
      expect(result.affected.find((a) => a.artifactId === 'tasks')?.expansion).toBe('downstream')
    })

    it('reports downstream affected artifacts in schema topological order', async () => {
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
      const uc = createInvalidate(repo, schemaWithBranches)
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        targets: [{ artifactId: 'proposal' }, { artifactId: 'verify' }],
        policyOverride: { artifacts: 'downstream' },
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
      const uc = createInvalidate(repo)
      const result = await uc.execute({
        name: 'c1',
        reason: 'review',
        policyOverride: { artifacts: 'global' },
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
    const uc = createInvalidate(repo)
    const result = await uc.execute({
      name: 'c1',
      reason: 'review',
      targets: [{ artifactId: 'design' }],
    })
    expect(result.effectivePolicy).toEqual({ artifacts: 'surgical', workflow: 'redesign' })
    expect(result.change.getArtifact('tasks')?.status).toBe('complete')
  })

  it('accumulates all target errors instead of throwing on first', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    const uc = createInvalidate(repo)
    await expect(
      uc.execute({
        name: 'c1',
        reason: 'test',
        targets: [{ artifactId: 'unknown' }, { artifactId: 'design', specId: 'foo' }],
        policyOverride: { artifacts: 'surgical' },
      }),
    ).rejects.toThrow('Invalid targets:')
    try {
      await uc.execute({
        name: 'c1',
        reason: 'test',
        targets: [{ artifactId: 'unknown' }, { artifactId: 'design', specId: 'foo' }],
        policyOverride: { artifacts: 'surgical' },
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
    const uc = createInvalidate(repo)
    const result = await uc.execute({
      name: 'c1',
      reason: 'manual review',
      targets: [{ artifactId: 'design' }],
      policyOverride: { artifacts: 'surgical' },
    })
    const designFile = result.change.getArtifact('design')?.getFile('design')
    expect(designFile?.hasDrift).toBe(false)
  })

  it('records invalidated event with cause artifact-review-required and the reason', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    const uc = createInvalidate(repo)
    const result = await uc.execute({
      name: 'c1',
      reason: 'semantic drift detected',
      targets: [{ artifactId: 'design' }],
      policyOverride: { artifacts: 'surgical' },
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
    const uc = createInvalidate(repo)
    const result = await uc.execute({
      name: 'c1',
      reason: 're-invalidate',
      targets: [{ artifactId: 'design' }],
      policyOverride: { artifacts: 'surgical' },
    })
    expect(result.change.state).toBe('implementing')
    expect(result.change.getArtifact('design')?.status).toBe('pending-review')
  })
})
