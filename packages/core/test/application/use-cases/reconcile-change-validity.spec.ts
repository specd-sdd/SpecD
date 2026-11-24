import { describe, expect, it } from 'vitest'
import { SchemaProviderIdentityMismatchError } from '../../../src/application/errors/schema-provider-identity-mismatch-error.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { Change } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import {
  makeArtifactType,
  makeRealReconcile,
  makeSchema,
  makeSchemaProvider,
  makeWorkflowStep,
  StubChangeRepository,
  testActor,
} from './helpers.js'

const hasher = new NodeContentHasher()
const content = 'hello\n'

function implementingChange(validatedHash: string): Change {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const change = new Change({
    name: 'c1',
    createdAt: at,
    specIds: ['core:change'],
    schemaName: 'test-schema',
    schemaVersion: 1,
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
                validatedHash,
              }),
            ],
          ]),
        }),
      ],
    ]),
    invalidationPolicy: { artifacts: 'surgical', workflow: 'preserve' },
  })
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

function signedOffChange(
  state: 'pending-signoff' | 'signed-off' | 'archivable' | 'archiving',
): Change {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const history = [
    {
      type: 'created' as const,
      at,
      by: testActor,
      specIds: ['core:change'],
      schemaName: 'test-schema',
      schemaVersion: 1,
    },
    {
      type: 'transitioned' as const,
      from: 'drafting' as const,
      to: state === 'pending-signoff' ? ('pending-signoff' as const) : ('signed-off' as const),
      at,
      by: testActor,
    },
    ...(state === 'archivable' || state === 'archiving'
      ? [
          {
            type: 'transitioned' as const,
            from: 'signed-off' as const,
            to: 'archivable' as const,
            at,
            by: testActor,
          },
        ]
      : []),
    ...(state === 'archiving'
      ? [
          {
            type: 'transitioned' as const,
            from: 'archivable' as const,
            to: 'archiving' as const,
            at,
            by: testActor,
          },
        ]
      : []),
  ]
  const change = new Change({
    name: `recover-${state}`,
    createdAt: at,
    specIds: ['core:change'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    history,
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
    ]),
    invalidationPolicy: { artifacts: 'surgical', workflow: 'preserve' },
  })
  change.recordSignoff(
    'Approved',
    {
      version: 1,
      artifacts: {
        version: 1,
        algorithm: 'artifact-pre-hash-v1',
        files: { 'proposal:proposal': `sha256:${'0'.repeat(64)}` },
      },
      implementation: null,
    },
    'verification-1',
    testActor,
    at,
  )
  return change
}

class Repo extends StubChangeRepository {
  override async artifact(): Promise<SpecArtifact | null> {
    return new SpecArtifact('proposal.md', content)
  }
}

describe('ReconcileChangeValidity', () => {
  const schema = makeSchema([makeArtifactType('proposal')])

  function reconciler(change: Change): ReconcileChangeValidity {
    return new ReconcileChangeValidity({
      changes: new Repo([change]),
      resolveChangeSchema: new ResolveChangeSchema(makeSchemaProvider(schema)),
      actor: { identity: async () => testActor },
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should not run')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: new ValidityFingerprintService({
        changes: new Repo([change]),
        hasher,
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider: makeSchemaProvider(schema),
      }),
      approvals: { spec: false, signoff: false },
    })
  }

  it('reopens drifted artifacts once and repeats without a second event', async () => {
    const change = implementingChange('sha256:stale')
    const useCase = new ReconcileChangeValidity({
      changes: new Repo([change]),
      resolveChangeSchema: new ResolveChangeSchema(makeSchemaProvider(schema)),
      actor: { identity: async () => testActor },
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should not run')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: new ValidityFingerprintService({
        changes: new Repo([change]),
        hasher,
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider: makeSchemaProvider(schema),
      }),
      approvals: { spec: false, signoff: false },
    })
    const first = await useCase.execute({ name: 'c1' })
    const second = await useCase.execute({ name: 'c1' })
    expect(first.changed).toBe(true)
    expect(first.change.state).toBe('implementing')
    expect(first.change.getArtifact('proposal')?.getFile('proposal')?.status).toBe(
      'drifted-pending-review',
    )
    expect(second.changed).toBe(false)
    expect(second.change.history.filter((event) => event.type === 'invalidated')).toHaveLength(1)
    expect(second.automaticReturn).toBeNull()
  })

  it('propagates a provider identity mismatch instead of reconciling against another schema', async () => {
    const change = implementingChange(hasher.hash('hello'))
    // Requested by recorded name, answered with a different schema: must fail closed.
    const mismatching = {
      get: async (name?: string) =>
        makeSchema([makeArtifactType('proposal')], [], { name: `not-${name}` }),
    } as unknown as SchemaProvider
    const useCase = new ReconcileChangeValidity({
      changes: new Repo([change]),
      resolveChangeSchema: new ResolveChangeSchema(mismatching),
      actor: { identity: async () => testActor },
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should not run')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: new ValidityFingerprintService({
        changes: new Repo([change]),
        hasher,
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider: mismatching,
      }),
      approvals: { spec: false, signoff: false },
    })

    await expect(useCase.execute({ name: 'c1' })).rejects.toBeInstanceOf(
      SchemaProviderIdentityMismatchError,
    )
  })

  it('does not mutate a fresh aggregate', async () => {
    const change = implementingChange(hasher.hash('hello'))
    const result = await reconciler(change).execute({ name: 'c1' })
    expect(result.changed).toBe(false)
    expect(result.verdict.artifactReviewRequired).toBe(false)
    expect(result.change.history.filter((event) => event.type === 'invalidated')).toHaveLength(0)
  })

  it.each(['signed-off', 'archivable', 'archiving'] as const)(
    'automatically recovers stale sign-off from %s to done exactly once',
    async (state) => {
      const change = signedOffChange(state)
      const repo = new Repo([change])
      const useCase = new ReconcileChangeValidity({
        changes: repo,
        resolveChangeSchema: new ResolveChangeSchema(makeSchemaProvider(schema)),
        actor: { identity: async () => testActor },
        refreshImplementationTracking: {
          execute: async () => {
            throw new Error('refresh should not run')
          },
        } as unknown as RefreshImplementationTracking,
        fingerprint: new ValidityFingerprintService({
          changes: repo,
          hasher,
          binaryHasher: new NodeBinaryContentHasher(),
          schemaProvider: makeSchemaProvider(schema),
        }),
        approvals: { spec: false, signoff: true },
      })

      const first = await useCase.execute({ name: change.name })
      const second = await useCase.execute({ name: change.name })

      expect(first.automaticReturn).toEqual({ cause: 'signoff', from: state, to: 'done' })
      expect(first.change.state).toBe('done')
      expect(
        first.change.history.filter(
          (event) => event.type === 'transitioned' && event.from === state && event.to === 'done',
        ),
      ).toHaveLength(1)
      expect(second.change.state).toBe('done')
      expect(second.changed).toBe(false)
    },
  )
})

describe('ReconcileChangeValidity recovery from parking states', () => {
  const schema = makeSchema([makeArtifactType('proposal')])

  function reconcilerFor(
    change: Change,
    approvals: { spec: boolean; signoff: boolean },
  ): ReconcileChangeValidity {
    const repo = new Repo([change])
    return new ReconcileChangeValidity({
      changes: repo,
      resolveChangeSchema: new ResolveChangeSchema(makeSchemaProvider(schema)),
      actor: { identity: async () => testActor },
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should not run')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: new ValidityFingerprintService({
        changes: repo,
        hasher,
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider: makeSchemaProvider(schema),
      }),
      approvals,
    })
  }

  it('recovers a stale sign-off in pending-signoff to done without throwing', async () => {
    const change = signedOffChange('pending-signoff')
    expect(change.state).toBe('pending-signoff')
    const result = await reconcilerFor(change, { spec: false, signoff: true }).execute({
      name: change.name,
    })
    expect(result.automaticReturn).toEqual({
      cause: 'signoff',
      from: 'pending-signoff',
      to: 'done',
    })
    expect(result.change.state).toBe('done')
  })

  it('recovers a stale approval in pending-spec-approval to designing', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z')
    const change = new Change({
      name: 'stale-spec-approval',
      createdAt: at,
      specIds: ['core:change'],
      schemaName: 'test-schema',
      schemaVersion: 1,
      history: [
        {
          type: 'created',
          at,
          by: testActor,
          specIds: ['core:change'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'drafting', to: 'pending-spec-approval', at, by: testActor },
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
      ]),
      invalidationPolicy: { artifacts: 'surgical', workflow: 'preserve' },
    })
    change.recordSpecApproval(
      'Approved',
      {
        version: 1,
        specIds: ['core:change'],
        artifacts: {
          version: 1,
          algorithm: 'artifact-pre-hash-v1',
          files: { 'proposal:proposal': `sha256:${'0'.repeat(64)}` },
        },
      },
      testActor,
      at,
    )
    expect(change.state).toBe('pending-spec-approval')
    const result = await reconcilerFor(change, { spec: true, signoff: false }).execute({
      name: change.name,
    })
    expect(result.automaticReturn).toEqual({
      cause: 'spec-approval',
      from: 'pending-spec-approval',
      to: 'designing',
    })
    expect(result.change.state).toBe('designing')
  })
})

describe('ReconcileChangeValidity verification topology', () => {
  function doneChange(): Change {
    const at = new Date('2026-01-01T00:00:00.000Z')
    return new Change({
      name: 'done-without-evidence',
      createdAt: at,
      specIds: ['core:change'],
      schemaName: 'test-schema',
      schemaVersion: 1,
      history: [
        {
          type: 'created',
          at,
          by: testActor,
          specIds: ['core:change'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'drafting', to: 'done', at, by: testActor },
      ],
      invalidationPolicy: { artifacts: 'surgical', workflow: 'preserve' },
    })
  }

  it('requires verification evidence at done when verifying is enabled', async () => {
    const repo = new Repo([doneChange()])
    const provider = makeSchemaProvider(makeSchema([makeArtifactType('proposal')]))
    const result = await makeRealReconcile(repo, provider).execute({
      name: 'done-without-evidence',
    })

    expect(result.verdict.verification).toBe('absent')
  })

  it('reports verification not-required with no verification blockers when verifying is disabled', async () => {
    const repo = new Repo([doneChange()])
    const provider = makeSchemaProvider(
      makeSchema(
        [makeArtifactType('proposal')],
        [makeWorkflowStep('verifying', { disabled: true })],
      ),
    )
    const result = await makeRealReconcile(repo, provider).execute({
      name: 'done-without-evidence',
    })

    expect(result.verdict.verification).toBe('not-required')
    expect(
      result.verdict.blockers.filter((blocker) => blocker.code.startsWith('VERIFICATION')),
    ).toEqual([])
  })
})
