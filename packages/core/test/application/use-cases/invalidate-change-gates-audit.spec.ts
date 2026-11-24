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
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { InvalidateRequiresForceError } from '../../../src/application/errors/invalidate-requires-force-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  testActor,
} from './helpers.js'

function artifact(type: string, requires: string[]): [string, ChangeArtifact] {
  return [
    type,
    new ChangeArtifact({
      type,
      requires,
      files: new Map([
        [
          type,
          new ArtifactFile({
            key: type,
            filename: `${type}.md`,
            status: 'complete',
            validatedHash: `sha256:${type}`,
          }),
        ],
      ]),
    }),
  ]
}

function makeImplementingChange(name: string): Change {
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
      artifact('proposal', []),
      artifact('design', ['proposal']),
      artifact('tasks', ['design']),
    ]),
  })
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

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
  approvals: { readonly spec: boolean; readonly signoff: boolean },
): InvalidateChange {
  const schemaProvider = makeSchemaProvider(schema)
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

function stubReadableArtifacts(repo: ReturnType<typeof makeChangeRepository>): void {
  vi.spyOn(repo, 'artifact').mockImplementation(
    async (_change, filename) => new SpecArtifact(filename, `content of ${filename}`),
  )
}

function fingerprintService(repo: ReturnType<typeof makeChangeRepository>, active: Schema) {
  return new ValidityFingerprintService({
    changes: repo,
    hasher: new NodeContentHasher(),
    binaryHasher: new NodeBinaryContentHasher(),
    schemaProvider: makeSchemaProvider(active),
  })
}

/** Records a spec approval whose fingerprint matches the current evidence. */
async function recordValidSpecApproval(
  change: Change,
  repo: ReturnType<typeof makeChangeRepository>,
): Promise<void> {
  stubReadableArtifacts(repo)
  const { fingerprint } = await fingerprintService(repo, schema).specApprovalFingerprint(change)
  if (fingerprint === null) throw new Error('spec approval fingerprint unavailable')
  change.recordSpecApproval('LGTM', fingerprint, testActor)
}

/** Records a sign-off whose fingerprint matches the current evidence. */
async function recordValidSignoff(
  change: Change,
  repo: ReturnType<typeof makeChangeRepository>,
): Promise<void> {
  stubReadableArtifacts(repo)
  const { fingerprint } = await fingerprintService(repo, schema).completeFingerprint(change)
  if (fingerprint === null) throw new Error('sign-off fingerprint unavailable')
  change.recordSignoff('Ship it', fingerprint, testActor)
}

const surgicalDesign = {
  targets: [{ artifactId: 'design' }],
  policyOverride: { artifacts: 'surgical', workflow: 'preserve' },
} as const

type Gates = { readonly spec: boolean; readonly signoff: boolean }

async function build(
  name: string,
  advance: readonly ('verifying' | 'done' | 'archivable')[],
  consent: { spec?: boolean; signoff?: boolean },
) {
  const change = makeImplementingChange(name)
  for (const state of advance) change.transition(state, testActor)
  const repo = makeChangeRepository([change])
  if (consent.spec === true) await recordValidSpecApproval(change, repo)
  if (consent.signoff === true) await recordValidSignoff(change, repo)
  return { change, repo }
}

async function rejection(
  uc: InvalidateChange,
  name: string,
): Promise<InvalidateRequiresForceError> {
  const error = await uc
    .execute({ name, reason: 'review', ...surgicalDesign })
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(InvalidateRequiresForceError)
  return error as InvalidateRequiresForceError
}

describe('InvalidateChange considers only enabled approval gates', () => {
  const specOff: Gates = { spec: false, signoff: false }

  it.each([
    { label: 'implementing', advance: [] },
    { label: 'verifying', advance: ['verifying'] },
    { label: 'done', advance: ['verifying', 'done'] },
  ] as const)(
    'revokes a valid spec approval of a disabled gate in $label without force and keeps the state',
    async ({ label, advance }) => {
      const { change, repo } = await build(`off-${label}`, advance, { spec: true })
      expect(change.specApproval?.status).toBe('valid')
      const uc = createInvalidate(repo, specOff)

      const result = await uc.execute({ name: change.name, reason: 'review', ...surgicalDesign })

      expect(result.change.state).toBe(label)
      expect(result.automaticReturn).toBeNull()
      expect(result.change.specApproval?.status).toBe('revoked')
    },
  )

  it('lists only the enabled sign-off gate, targeting done, when the spec gate is off', async () => {
    const { change, repo } = await build('signoff-only', ['verifying', 'done', 'archivable'], {
      spec: true,
      signoff: true,
    })
    const uc = createInvalidate(repo, { spec: false, signoff: true })

    const error = await rejection(uc, change.name)

    expect(error.recoveries).toEqual([{ gate: 'signoff', target: 'done' }])
    expect(error.gates).toEqual(['signoff'])
    expect(change.state).toBe('archivable')
    expect(change.specApproval?.status).toBe('valid')
    expect(change.signoff?.status).toBe('valid')
  })

  it('previews done when only the sign-off consent exists', async () => {
    const { change, repo } = await build('only-signoff', ['verifying', 'done', 'archivable'], {
      signoff: true,
    })
    const uc = createInvalidate(repo, { spec: true, signoff: true })

    const error = await rejection(uc, change.name)

    expect(error.recoveries).toEqual([{ gate: 'signoff', target: 'done' }])
  })

  it('with force revokes disabled and enabled consent together', async () => {
    const { change, repo } = await build('force-mixed', ['verifying', 'done', 'archivable'], {
      spec: true,
      signoff: true,
    })
    const uc = createInvalidate(repo, { spec: false, signoff: true })

    const result = await uc.execute({
      name: change.name,
      reason: 'review',
      force: true,
      ...surgicalDesign,
    })

    expect(result.change.state).toBe('done')
    expect(result.change.signoff?.status).toBe('revoked')
    expect(result.change.specApproval?.status).toBe('revoked')
  })

  it.each([
    { signoffConsent: false, expected: [{ gate: 'spec', target: 'designing' }] },
    {
      signoffConsent: true,
      expected: [
        { gate: 'spec', target: 'designing' },
        { gate: 'signoff', target: 'designing' },
      ],
    },
  ])(
    'combined preview with both gates enabled, signoff consent=$signoffConsent',
    async ({ signoffConsent, expected }) => {
      const { change, repo } = await build(
        `combined-${String(signoffConsent)}`,
        ['verifying', 'done'],
        {
          spec: true,
          signoff: signoffConsent,
        },
      )
      const uc = createInvalidate(repo, { spec: true, signoff: true })
      const error = await rejection(uc, change.name)
      expect(error.recoveries).toEqual(expected)
    },
  )

  it('revokes a disabled sign-off gate in archivable without force and reports no recovery', async () => {
    const { change, repo } = await build('off-signoff', ['verifying', 'done', 'archivable'], {
      signoff: true,
    })
    expect(change.signoff?.status).toBe('valid')
    const events = change.history.length
    const uc = createInvalidate(repo, specOff)

    const result = await uc.execute({ name: change.name, reason: 'review', ...surgicalDesign })

    expect(result.change.state).toBe('archivable')
    expect(result.automaticReturn).toBeNull()
    expect(result.change.signoff?.status).toBe('revoked')
    expect(result.change.history.slice(events).filter((e) => e.type === 'transitioned')).toEqual([])
  })

  it('records one approval-invalidated event and reports the projection change for a disabled gate', async () => {
    const { change, repo } = await build('off-history', [], { spec: true })
    const before = change.history.length
    const uc = createInvalidate(repo, specOff)

    const result = await uc.execute({ name: change.name, reason: 'review', ...surgicalDesign })

    const events = result.change.history
      .slice(before)
      .filter((e) => e.type === 'approval-invalidated')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'approval-invalidated',
      gate: 'spec',
      status: 'revoked',
      cause: 'manual-invalidation',
    })
    expect(
      result.change.history.filter(
        (e) => e.type === 'approval-invalidated' && e.gate === 'spec' && e.status === 'revoked',
      ),
    ).toHaveLength(1)
    expect(result.projectionChanges).toContainEqual(
      expect.objectContaining({
        projection: 'specApproval',
        from: 'valid',
        to: 'revoked',
        cause: 'manual-invalidation',
      }),
    )
  })

  it('moves nothing for a disabled gate under redesign with artifact policy none and no drift', async () => {
    const { change, repo } = await build('off-redesign', [], { spec: true })
    // Align every validated hash with the current evidence so no artifact counts as drifted.
    const { fingerprint } = await fingerprintService(repo, schema).completeFingerprint(change)
    for (const [typeId, art] of change.artifacts) {
      for (const file of art.files.values()) {
        const hash = fingerprint?.artifacts.files[`${typeId}:${file.key}`]
        if (hash === undefined) throw new Error('missing fingerprint hash')
        file.markComplete(hash)
      }
    }
    const uc = createInvalidate(repo, specOff)

    const result = await uc.execute({
      name: change.name,
      reason: 'review',
      policyOverride: { artifacts: 'none', workflow: 'redesign' },
    })

    expect(result.change.state).toBe('implementing')
    expect(result.automaticReturn).toBeNull()
    expect(result.change.specApproval?.status).toBe('revoked')
  })

  it('does not restore a revoked consent when the gate is re-enabled later', async () => {
    const { change, repo } = await build('re-enable', [], { spec: true })
    await createInvalidate(repo, specOff).execute({
      name: change.name,
      reason: 'review',
      ...surgicalDesign,
    })
    expect(change.specApproval?.status).toBe('revoked')
    stubReadableArtifacts(repo)

    const schemaProvider = makeSchemaProvider(schema)
    const reconcile = new ReconcileChangeValidity({
      changes: repo,
      resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
      actor: makeActorResolver(),
      refreshImplementationTracking: {
        execute: async () => ({ trackedFiles: [], links: [] }),
      } as unknown as RefreshImplementationTracking,
      fingerprint: fingerprintService(repo, schema),
      approvals: { spec: true, signoff: false },
    })
    const result = await reconcile.execute({ name: change.name })

    expect(result.change.specApproval?.status).toBe('revoked')
    expect(result.automaticReturn).not.toBeNull()
    expect(result.change.state).toBe('designing')
  })

  it.each([
    { state: 'pending-spec-approval', via: ['ready'], consent: { spec: true } },
    { state: 'spec-approved', via: ['ready'], consent: { spec: true } },
    {
      state: 'pending-signoff',
      via: ['implementing', 'verifying', 'done'],
      consent: { signoff: true },
    },
    { state: 'signed-off', via: ['implementing', 'verifying', 'done'], consent: { signoff: true } },
  ] as const)(
    'revokes disabled-gate consent in legacy parking state $state without force and keeps the state',
    async ({ state, via, consent }) => {
      const change = makeImplementingChange(`legacy-${state}`)
      const at = new Date('2024-02-01T10:00:00.000Z')
      const prior = via[via.length - 1] === 'ready' ? 'ready' : 'done'
      const legacy = new Change({
        name: change.name,
        createdAt: change.createdAt,
        specIds: [...change.specIds],
        schemaName: change.schemaName,
        schemaVersion: change.schemaVersion,
        history: [
          ...change.history,
          { type: 'transitioned', at, by: testActor, from: 'implementing', to: prior },
          { type: 'transitioned', at, by: testActor, from: prior, to: state },
        ],
        artifacts: new Map(change.artifacts),
      })
      expect(legacy.state).toBe(state)
      const repo = makeChangeRepository([legacy])
      if ('spec' in consent) await recordValidSpecApproval(legacy, repo)
      if ('signoff' in consent) await recordValidSignoff(legacy, repo)
      const uc = createInvalidate(repo, specOff)

      const result = await uc.execute({ name: legacy.name, reason: 'review', ...surgicalDesign })

      expect(result.change.state).toBe(state)
      expect(result.automaticReturn).toBeNull()
      const record = 'spec' in consent ? result.change.specApproval : result.change.signoff
      expect(record?.status).toBe('revoked')
    },
  )

  describe('re-enabling a gate after a disabled-gate revocation', () => {
    function changeAt(name: string, states: readonly string[]): Change {
      const base = makeImplementingChange(name)
      const at = new Date('2024-02-01T10:00:00.000Z')
      const history = [...base.history.filter((e) => e.type === 'created')]
      let from = 'draft'
      for (const to of states) {
        history.push({ type: 'transitioned', at, by: testActor, from, to } as never)
        from = to
      }
      return new Change({
        name,
        createdAt: base.createdAt,
        specIds: [...base.specIds],
        schemaName: base.schemaName,
        schemaVersion: base.schemaVersion,
        history,
        artifacts: new Map(base.artifacts),
      })
    }

    async function reEnable(repo: ReturnType<typeof makeChangeRepository>, name: string, a: Gates) {
      stubReadableArtifacts(repo)
      const schemaProvider = makeSchemaProvider(schema)
      const reconcile = new ReconcileChangeValidity({
        changes: repo,
        resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
        actor: makeActorResolver(),
        refreshImplementationTracking: {
          execute: async () => ({ trackedFiles: [], links: [] }),
        } as unknown as RefreshImplementationTracking,
        fingerprint: fingerprintService(repo, schema),
        approvals: a,
      })
      return reconcile.execute({ name })
    }

    it.each([
      { state: 'designing', states: ['designing'], expected: 'designing' },
      { state: 'ready', states: ['designing', 'ready'], expected: 'ready' },
      {
        state: 'pending-spec-approval',
        states: ['designing', 'ready', 'pending-spec-approval'],
        expected: 'designing',
      },
    ])(
      'revoked spec consent with the spec gate re-enabled in $state ends in $expected',
      async ({ state, states, expected }) => {
        const change = changeAt(`reenable-${state}`, states)
        expect(change.state).toBe(state)
        const repo = makeChangeRepository([change])
        await recordValidSpecApproval(change, repo)
        await createInvalidate(repo, specOff).execute({
          name: change.name,
          reason: 'review',
          ...surgicalDesign,
        })
        expect(change.specApproval?.status).toBe('revoked')
        expect(change.state).toBe(state)

        const result = await reEnable(repo, change.name, { spec: true, signoff: false })

        expect(result.change.specApproval?.status).toBe('revoked')
        expect(result.change.state).toBe(expected)
      },
    )

    it('revoked sign-off with the sign-off gate re-enabled returns archivable to done', async () => {
      const { change, repo } = await build(
        'reenable-signoff',
        ['verifying', 'done', 'archivable'],
        {
          signoff: true,
        },
      )
      await createInvalidate(repo, specOff).execute({
        name: change.name,
        reason: 'review',
        ...surgicalDesign,
      })
      expect(change.signoff?.status).toBe('revoked')
      expect(change.state).toBe('archivable')

      const result = await reEnable(repo, change.name, { spec: false, signoff: true })

      expect(result.change.signoff?.status).toBe('revoked')
      expect(result.change.state).toBe('done')
    })
  })

  it('mixed valid consent of an enabled and a disabled gate requires force and revokes nothing', async () => {
    const { change, repo } = await build('mixed-guard', ['verifying', 'done', 'archivable'], {
      spec: true,
      signoff: true,
    })
    const before = change.history.length
    const uc = createInvalidate(repo, { spec: true, signoff: false })

    const error = await rejection(uc, change.name)

    expect(error.gates).toEqual(['spec'])
    expect(change.specApproval?.status).toBe('valid')
    expect(change.signoff?.status).toBe('valid')
    // The reconciler pre-pass may record fixture artifact drift; no consent event is added.
    expect(change.history.slice(before).filter((e) => e.type === 'approval-invalidated')).toEqual(
      [],
    )
    expect(change.state).toBe('archivable')

    const result = await uc.execute({
      name: change.name,
      reason: 'review',
      force: true,
      ...surgicalDesign,
    })
    expect(result.change.specApproval?.status).toBe('revoked')
    expect(result.change.signoff?.status).toBe('revoked')
  })
})
