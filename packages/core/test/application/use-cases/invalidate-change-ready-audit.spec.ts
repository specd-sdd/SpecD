import { describe, expect, it, vi } from 'vitest'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
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
  makeSpecApprovalFingerprint,
  makeSchema,
  makeArtifactType,
  makeWorkflowStep,
  testActor,
} from './helpers.js'

function makeChangeWithDAG(name: string): Change {
  const at = new Date('2024-01-15T10:00:00.000Z')
  const change = new Change({
    name,
    createdAt: at,
    specIds: ['auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
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
  return change
}

describe('InvalidateChange from ready', () => {
  const schema = makeSchema(
    [
      makeArtifactType('proposal'),
      makeArtifactType('design', { requires: ['proposal'] }),
      makeArtifactType('tasks', { requires: ['design'] }),
    ],
    [],
    { name: '@specd/schema-std' },
  )

  function createInvalidate(
    repo: ChangeRepository,
    activeSchema: Schema = schema,
    approvals: { readonly spec: boolean; readonly signoff: boolean } = {
      spec: false,
      signoff: false,
    },
    providedSchemaProvider?: SchemaProvider,
  ): InvalidateChange {
    const schemaProvider = providedSchemaProvider ?? makeSchemaProvider(activeSchema)
    const reconcile = new ReconcileChangeValidity({
      changes: repo,
      resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
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
    return new InvalidateChange(
      repo,
      makeActorResolver(),
      schemaProvider,
      reconcile,
      undefined,
      approvals,
    )
  }

  /** Makes every artifact file readable with stable content so fingerprints can be collected. */
  function stubReadableArtifacts(repo: ReturnType<typeof makeChangeRepository>): void {
    vi.spyOn(repo, 'artifact').mockImplementation(
      async (_change, filename) => new SpecArtifact(filename, `content of ${filename}`),
    )
  }

  /** Records a spec approval whose fingerprint matches the change's current evidence. */
  async function recordValidSpecApproval(
    change: Change,
    repo: ReturnType<typeof makeChangeRepository>,
    activeSchema: Schema,
  ): Promise<void> {
    stubReadableArtifacts(repo)
    const service = new ValidityFingerprintService({
      changes: repo,
      hasher: new NodeContentHasher(),
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(activeSchema),
    })
    const { fingerprint } = await service.specApprovalFingerprint(change)
    if (fingerprint === null) throw new Error('spec approval fingerprint unavailable')
    change.recordSpecApproval('LGTM', fingerprint, testActor)
  }

  /** Records a sign-off whose fingerprint matches the change's current evidence. */
  async function recordValidSignoff(
    change: Change,
    repo: ReturnType<typeof makeChangeRepository>,
    activeSchema: Schema,
  ): Promise<void> {
    stubReadableArtifacts(repo)
    const service = new ValidityFingerprintService({
      changes: repo,
      hasher: new NodeContentHasher(),
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(activeSchema),
    })
    const { fingerprint } = await service.completeFingerprint(change)
    if (fingerprint === null) throw new Error('sign-off fingerprint unavailable')
    change.recordSignoff('Ship it', fingerprint, testActor)
  }

  async function readyChangeWithSpecApproval(): Promise<{
    change: Change
    repo: ReturnType<typeof makeChangeRepository>
  }> {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    await recordValidSpecApproval(change, repo, schema)
    return { change, repo }
  }

  const surgical = { artifacts: 'surgical', workflow: 'preserve' } as const

  it('previews and commits a forced revocation that stays in ready under preserve', async () => {
    const { change, repo } = await readyChangeWithSpecApproval()
    const uc = createInvalidate(repo, schema, { spec: true, signoff: true })
    const result = await uc.execute({
      name: 'c1',
      reason: 'forced',
      targets: [{ artifactId: 'design' }],
      policyOverride: surgical,
      force: true,
    })
    expect(result.change.state).toBe('ready')
    expect(change.state).toBe('ready')
    expect(result.automaticReturn).toBeNull()
  })

  it('goes to designing under redesign and reports the recovery', async () => {
    const { repo } = await readyChangeWithSpecApproval()
    const uc = createInvalidate(repo, schema, { spec: true, signoff: true })
    const result = await uc.execute({
      name: 'c1',
      reason: 'forced',
      targets: [{ artifactId: 'design' }],
      policyOverride: { artifacts: 'surgical', workflow: 'redesign' },
      force: true,
    })
    expect(result.change.state).toBe('designing')
    expect(result.automaticReturn?.to).toBe('designing')
    expect(result.automaticReturn?.from).toBe('ready')
  })

  it('force preview uses the effective policy', async () => {
    const preserved = await readyChangeWithSpecApproval()
    const ucPreserve = createInvalidate(preserved.repo, schema, { spec: true, signoff: true })
    await expect(
      ucPreserve.execute({
        name: 'c1',
        reason: 'x',
        targets: [{ artifactId: 'design' }],
        policyOverride: surgical,
      }),
    ).rejects.toMatchObject({ recoveries: [{ gate: 'spec', target: 'ready' }] })

    const redesign = await readyChangeWithSpecApproval()
    const ucRedesign = createInvalidate(redesign.repo, schema, { spec: true, signoff: true })
    await expect(
      ucRedesign.execute({
        name: 'c1',
        reason: 'x',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'redesign' },
      }),
    ).rejects.toMatchObject({ recoveries: [{ gate: 'spec', target: 'designing' }] })
  })

  it('previews required artifact review from pre-existing pending-review under artifacts none', async () => {
    const withPending = await readyChangeWithSpecApproval()
    // The fixture content no longer matches its validated hash, so the reconciler already holds
    // `design` in review; marking it pending keeps the pre-existing review explicit.
    withPending.change.getArtifact('design')?.markPendingReview()
    const uc = createInvalidate(withPending.repo, schema, { spec: true, signoff: true })
    await expect(
      uc.execute({
        name: 'c1',
        reason: 'x',
        policyOverride: { artifacts: 'none', workflow: 'redesign' },
      }),
    ).rejects.toMatchObject({ recoveries: [{ gate: 'spec', target: 'designing' }] })
  })

  it('previews required artifact review from hash-only drift under artifacts none', async () => {
    // No pending-review flag and no hasDrift: the fixture content only differs from its validated
    // hash, which the reconciler counts as drift, so the preview must agree with its verdict.
    const hashOnly = await readyChangeWithSpecApproval()
    const file = hashOnly.change.getArtifact('design')?.getFile('design')
    expect(file?.status).toBe('complete')
    expect(file?.hasDrift).toBe(false)
    const uc = createInvalidate(hashOnly.repo, schema, { spec: true, signoff: true })
    await expect(
      uc.execute({
        name: 'c1',
        reason: 'x',
        policyOverride: { artifacts: 'none', workflow: 'redesign' },
      }),
    ).rejects.toMatchObject({ recoveries: [{ gate: 'spec', target: 'designing' }] })
  })

  it('forced revocation under redesign with artifacts none and no review stays in ready', async () => {
    const change = makeChangeWithDAG('c1')
    const repo = makeChangeRepository([change])
    stubReadableArtifacts(repo)
    // Align every validated hash with the current content so there is no drift or pending review.
    const service = new ValidityFingerprintService({
      changes: repo,
      hasher: new NodeContentHasher(),
      binaryHasher: new NodeBinaryContentHasher(),
      schemaProvider: makeSchemaProvider(schema),
    })
    const { fingerprint } = await service.completeFingerprint(change)
    if (fingerprint === null) throw new Error('fingerprint unavailable')
    for (const [typeId, artifact] of change.artifacts) {
      for (const file of artifact.files.values()) {
        const hash = fingerprint.artifacts.files[`${typeId}:${file.key}`]
        if (hash === undefined) throw new Error(`missing hash for ${typeId}:${file.key}`)
        file.markComplete(hash)
      }
    }
    await recordValidSpecApproval(change, repo, schema)
    const uc = createInvalidate(repo, schema, { spec: true, signoff: true })
    const result = await uc.execute({
      name: 'c1',
      reason: 'forced',
      policyOverride: { artifacts: 'none', workflow: 'redesign' },
      force: true,
    })
    expect(result.change.state).toBe('ready')
    expect(result.automaticReturn).toBeNull()
  })

  it('does not mutate the change without force', async () => {
    const { change, repo } = await readyChangeWithSpecApproval()
    const uc = createInvalidate(repo, schema, { spec: true, signoff: true })
    await expect(
      uc.execute({
        name: 'c1',
        reason: 'x',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'redesign' },
      }),
    ).rejects.toThrow(InvalidateRequiresForceError)
    expect(change.state).toBe('ready')
    expect(change.specApproval?.status).toBe('valid')
  })
})
