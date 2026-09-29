import { describe, expect, it } from 'vitest'
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
  makeSchema,
  makeSchemaProvider,
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

function signedOffChange(state: 'signed-off' | 'archivable' | 'archiving'): Change {
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
      to: 'signed-off' as const,
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
      schemaProvider: makeSchemaProvider(schema),
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
      schemaProvider: makeSchemaProvider(schema),
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
        schemaProvider: makeSchemaProvider(schema),
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
