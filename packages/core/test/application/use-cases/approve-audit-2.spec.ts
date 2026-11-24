import { describe, it, expect, vi } from 'vitest'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { type ValidityFingerprint } from '../../../src/domain/value-objects/validity-fingerprint.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeWorkflowStep,
  makeContentHasher,
  makeSpecApprovalFingerprint,
  testActor,
} from './helpers.js'

const emptyFingerprint: ValidityFingerprint = {
  version: 1,
  artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
  implementation: {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {},
  },
}

const PATH_TO_DONE = ['designing', 'ready', 'implementing', 'verifying', 'done'] as const

function makeChangeAt(
  name: string,
  path: readonly string[],
  artifacts?: Map<string, ChangeArtifact>,
): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: ['auth/login'],
      schemaName: 'test-schema',
      schemaVersion: 1,
    },
  ]
  let previous = 'drafting'
  for (const state of path) {
    history.push({
      type: 'transitioned',
      from: previous,
      to: state,
      at: new Date(),
      by: testActor,
    } as ChangeEvent)
    previous = state
  }
  return new Change({
    name,
    createdAt,
    specIds: ['auth/login'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    history,
    ...(artifacts !== undefined ? { artifacts } : {}),
  })
}

function proposalArtifact(
  status: 'complete' | 'pending-review',
  validatedHash?: string,
): Map<string, ChangeArtifact> {
  return new Map([
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
              status,
              ...(validatedHash !== undefined ? { validatedHash } : {}),
            }),
          ],
        ]),
      }),
    ],
  ])
}

function build(
  repo: ReturnType<typeof makeChangeRepository>,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
) {
  const actor = makeActorResolver()
  const schemaProvider = makeSchemaProvider(schema)
  const fingerprint = new ValidityFingerprintService({
    changes: repo,
    hasher: makeContentHasher(),
    binaryHasher: new NodeBinaryContentHasher(),
    schemaProvider,
  })
  const refresh = { execute: async () => undefined } as unknown as RefreshImplementationTracking
  const reconcile = new ReconcileChangeValidity({
    changes: repo,
    resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
    actor,
    refreshImplementationTracking: refresh,
    fingerprint,
    approvals,
  })
  return {
    fingerprint,
    reconcile,
    spec: new ApproveSpec(repo, actor, schemaProvider, approvals, reconcile, fingerprint),
    signoff: new ApproveSignoff(
      repo,
      actor,
      schemaProvider,
      approvals,
      reconcile,
      fingerprint,
      refresh,
    ),
  }
}

/** Schema whose steps require the `proposal` artifact where consent is given. */
const requiringSchema = makeSchema(
  [makeArtifactType('proposal')],
  [
    makeWorkflowStep('ready', { requires: ['proposal'] }),
    makeWorkflowStep('verifying', { disabled: true }),
    makeWorkflowStep('done', { requires: ['proposal'] }),
  ],
)

describe('ApproveSpec consent renewal only in ready', () => {
  it('routes stale consent through designing and persists the recovery without a pending state', async () => {
    const change = makeChangeAt('stale-impl', ['designing', 'ready', 'implementing'])
    // Valid per projection but its scope no longer matches the change specs: stale per fingerprint.
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const schema = makeSchema()
    const { spec } = build(repo, { spec: true, signoff: false }, schema)

    const error = await spec
      .execute({ name: 'stale-impl', reason: 'renew' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidStateTransitionError)
    const persisted = repo.store.get('stale-impl')!
    // Recovery committed: back in designing, no new consent, no pending state, nothing deleted.
    expect(persisted.state).toBe('designing')
    expect(persisted.specApproval?.status).not.toBe('valid')
    expect(persisted.history.filter((event) => event.type === 'spec-approved')).toHaveLength(1)
    expect(persisted.history.some((event) => event.type === 'transitioned')).toBe(true)
    expect(persisted.state).not.toMatch(/^pending/)

    // Still not approvable in designing.
    await expect(spec.execute({ name: 'stale-impl', reason: 'renew' })).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    )
  })

  it('renews stale consent once the change is back in ready', async () => {
    const change = makeChangeAt('flow', ['designing', 'ready', 'implementing'])
    // Valid per projection but its scope no longer matches the change specs: stale per fingerprint.
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const schema = makeSchema()
    const { spec } = build(repo, { spec: true, signoff: false }, schema)

    // From implementing: recovery returns the change to designing and nothing is approved.
    await expect(spec.execute({ name: 'flow', reason: 'renew' })).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    )
    const recovered = repo.store.get('flow')!
    expect(recovered.state).toBe('designing')
    expect(recovered.specApproval?.status).toBe('stale')

    // Back in ready the stale consent no longer sends the change back to designing.
    recovered.transition('ready', testActor, schema, { spec: true, signoff: false })
    const renewed = await spec.execute({ name: 'flow', reason: 'renew' })

    expect(renewed.state).toBe('ready')
    expect(renewed.specApproval?.status).toBe('valid')
    expect(renewed.specApproval?.decision.reason).toBe('renew')
    expect(renewed.history.filter((event) => event.type === 'spec-approved')).toHaveLength(2)
  })

  it('keeps a stale consent in ready without recovering and still blocks nothing else', async () => {
    const change = makeChangeAt('stale-in-ready', ['designing', 'ready'])
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const schema = makeSchema()
    const { reconcile } = build(repo, { spec: true, signoff: false }, schema)

    const first = await reconcile.execute({ name: 'stale-in-ready' })
    const second = await reconcile.execute({ name: 'stale-in-ready' })

    expect(first.change.state).toBe('ready')
    expect(first.automaticReturn).toBeNull()
    expect(first.verdict.specApproval).toBe('stale')
    expect(second.change.state).toBe('ready')
    expect(second.automaticReturn).toBeNull()
    expect(second.change.history.filter((event) => event.type === 'transitioned')).toHaveLength(2)
  })
})

describe('ApproveSignoff consent renewal only in done', () => {
  it('rejects sign-off renewal from implementing and verifying', async () => {
    for (const path of [
      ['designing', 'ready', 'implementing'],
      ['designing', 'ready', 'implementing', 'verifying'],
    ]) {
      const change = makeChangeAt('wrong', path)
      const repo = makeChangeRepository([change])
      const { signoff } = build(repo, { spec: false, signoff: true }, requiringSchema)
      await expect(signoff.execute({ name: 'wrong', reason: 'x' })).rejects.toBeInstanceOf(
        InvalidStateTransitionError,
      )
      expect(repo.store.get('wrong')?.signoff).toBeUndefined()
    }
  })
})

describe('missing required artifact blocks approval', () => {
  it('ApproveSpec rejects a missing required artifact without recording consent', async () => {
    const change = makeChangeAt('no-artifact', ['designing', 'ready'])
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const { spec } = build(repo, { spec: true, signoff: false }, requiringSchema)

    const error = await spec.execute({ name: 'no-artifact', reason: 'go' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidStateTransitionError)
    expect((error as InvalidStateTransitionError).reason).toMatchObject({
      type: 'incomplete-artifact',
      artifactId: 'proposal',
    })
    expect(repo.store.get('no-artifact')?.specApproval).toBeUndefined()
    expect(
      repo.store.get('no-artifact')?.history.some((event) => event.type === 'spec-approved'),
    ).toBe(false)
  })

  it('ApproveSpec rejects a required artifact that is pending review', async () => {
    const change = makeChangeAt(
      'pending',
      ['designing', 'ready'],
      proposalArtifact('pending-review'),
    )
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('proposal.md', '# P'))
    const { spec } = build(repo, { spec: true, signoff: false }, requiringSchema)

    await expect(spec.execute({ name: 'pending', reason: 'go' })).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    )
    expect(repo.store.get('pending')?.specApproval).toBeUndefined()
  })

  it('ApproveSignoff rejects a missing required artifact without recording sign-off', async () => {
    const change = makeChangeAt('no-artifact', PATH_TO_DONE)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(null)
    const { signoff } = build(repo, { spec: false, signoff: true }, requiringSchema)

    const error = await signoff
      .execute({ name: 'no-artifact', reason: 'go' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidStateTransitionError)
    expect((error as InvalidStateTransitionError).reason).toMatchObject({
      type: 'incomplete-artifact',
      artifactId: 'proposal',
    })
    expect(repo.store.get('no-artifact')?.signoff).toBeUndefined()
  })
})

describe('reconciliation blocks approving a changed snapshot', () => {
  it('ApproveSignoff persists the artifact review and adds no sign-off event', async () => {
    const change = makeChangeAt(
      'drifted',
      PATH_TO_DONE,
      proposalArtifact('complete', 'sha256:stale'),
    )
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('proposal.md', '# Changed'))
    const { signoff } = build(repo, { spec: false, signoff: true }, requiringSchema)

    await expect(signoff.execute({ name: 'drifted', reason: 'late' })).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    )

    const persisted = repo.store.get('drifted')!
    expect(persisted.history.some((event) => event.type === 'signed-off')).toBe(false)
    expect(persisted.signoff).toBeUndefined()
    // The canonical effect of the reconciliation is committed even though approval failed.
    expect(persisted.getArtifact('proposal')?.status).not.toBe('complete')
  })

  it('ApproveSignoff does not sign a snapshot whose verification went stale', async () => {
    const change = makeChangeAt(
      'stale-verify',
      PATH_TO_DONE,
      proposalArtifact('complete', 'sha256:stale'),
    )
    change.startVerification(emptyFingerprint, testActor)
    change.completeVerification(testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('proposal.md', '# Changed'))
    const enabledVerifying = makeSchema(
      [makeArtifactType('proposal')],
      [makeWorkflowStep('done', { requires: ['proposal'] })],
    )
    const { signoff } = build(repo, { spec: false, signoff: true }, enabledVerifying)

    await expect(signoff.execute({ name: 'stale-verify', reason: 'late' })).rejects.toThrow()

    const persisted = repo.store.get('stale-verify')!
    expect(persisted.history.some((event) => event.type === 'signed-off')).toBe(false)
    expect(persisted.signoff).toBeUndefined()
  })
})
