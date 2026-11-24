import { describe, expect, it } from 'vitest'
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
  makeSchema,
  makeSchemaProvider,
  StubChangeRepository,
  testActor,
} from './helpers.js'

const hasher = new NodeContentHasher()
const content = 'hello\n'
const at = new Date('2026-01-01T00:00:00.000Z')
const schema = makeSchema([makeArtifactType('proposal')])

class Repo extends StubChangeRepository {
  override async artifact(): Promise<SpecArtifact | null> {
    return new SpecArtifact('proposal.md', content)
  }
}

function reconciler(
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

function makeChange(
  name: string,
  states: readonly Parameters<Change['transition']>[0][],
  opts: { validatedHash: string; workflow: 'preserve' | 'redesign' },
): Change {
  const change = new Change({
    name,
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
                validatedHash: opts.validatedHash,
              }),
            ],
          ]),
        }),
      ],
    ]),
    invalidationPolicy: { artifacts: 'surgical', workflow: opts.workflow },
  })
  for (const state of states) change.transition(state, testActor)
  return change
}

const zeroHash: `sha256:${string}` = `sha256:${'0'.repeat(64)}`
const staleSpecFingerprint = {
  version: 1 as const,
  specIds: ['core:change'],
  artifacts: {
    version: 1 as const,
    algorithm: 'artifact-pre-hash-v1' as const,
    files: { 'proposal:proposal': zeroHash },
  },
}

describe('ReconcileChangeValidity recovery rules', () => {
  const atReady = ['designing', 'ready'] as const

  it('commits no recovery for a stale spec approval at ready', async () => {
    const change = makeChange('stale-ready', atReady, {
      validatedHash: hasher.hash(content),
      workflow: 'preserve',
    })
    change.recordSpecApproval('Approved', staleSpecFingerprint, testActor, at)

    const result = await reconciler(change, { spec: true, signoff: false }).execute({
      name: change.name,
    })

    expect(result.verdict.specApproval).toBe('stale')
    expect(result.automaticReturn).toBeNull()
    expect(result.change.state).toBe('ready')
  })

  it('commits no recovery for a revoked spec approval at ready', async () => {
    const change = makeChange('revoked-ready', atReady, {
      validatedHash: hasher.hash(content),
      workflow: 'preserve',
    })
    change.recordSpecApproval('Approved', staleSpecFingerprint, testActor, at)
    change.markApprovalInvalid('spec', 'revoked', {
      at,
      by: testActor,
      cause: 'manual-invalidation',
      reason: 'revoked by operator',
      differences: [],
    })

    const result = await reconciler(change, { spec: true, signoff: false }).execute({
      name: change.name,
    })

    expect(result.verdict.specApproval).toBe('revoked')
    expect(result.automaticReturn).toBeNull()
    expect(result.change.state).toBe('ready')
  })

  it('commits one recovery per reconciliation: archivable to done, then done to designing', async () => {
    const change = makeChange(
      'one-at-a-time',
      ['designing', 'ready', 'implementing', 'verifying', 'done', 'archivable'],
      { validatedHash: 'sha256:drifted', workflow: 'redesign' },
    )
    change.recordSignoff(
      'Approved',
      {
        version: 1,
        artifacts: staleSpecFingerprint.artifacts,
        implementation: null,
      },
      'verification-1',
      testActor,
      at,
    )
    const useCase = reconciler(change, { spec: false, signoff: true })

    const first = await useCase.execute({ name: change.name })
    expect(first.automaticReturn).toMatchObject({
      cause: 'signoff',
      from: 'archivable',
      to: 'done',
    })
    expect(first.change.state).toBe('done')

    const second = await useCase.execute({ name: change.name })
    expect(second.automaticReturn).toMatchObject({
      cause: 'workflow-redesign',
      from: 'done',
      to: 'designing',
    })
    expect(second.change.state).toBe('designing')
  })
})
