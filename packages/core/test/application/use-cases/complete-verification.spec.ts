import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { VerificationAttemptNotFoundError } from '../../../src/application/errors/verification-attempt-not-found-error.js'
import { VerificationFingerprintMismatchError } from '../../../src/application/errors/verification-fingerprint-mismatch-error.js'
import { CompleteVerification } from '../../../src/application/use-cases/complete-verification.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ValidityFingerprint } from '../../../src/domain/value-objects/validity-fingerprint.js'
import {
  makeActorResolver,
  makeSchema,
  makeSchemaProvider,
  StubChangeRepository,
  testActor,
} from './helpers.js'

const baseline: ValidityFingerprint = {
  version: 1,
  artifacts: {
    version: 1,
    algorithm: 'artifact-pre-hash-v1',
    files: { 'proposal:proposal': 'sha256:aa' },
  },
  implementation: {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {},
  },
}

const drifted: ValidityFingerprint = {
  ...baseline,
  artifacts: { ...baseline.artifacts, files: { 'proposal:proposal': 'sha256:bb' } },
}

function startedChange(): Change {
  const change = new Change({
    name: 'c1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    specIds: ['core:change'],
    history: [
      {
        type: 'created',
        at: new Date('2026-01-01T00:00:00.000Z'),
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'test-schema',
        schemaVersion: 1,
      },
    ],
  })
  change.startVerification(baseline, testActor, new Date('2026-01-02T00:00:00.000Z'))
  return change
}

function harness(fingerprint: ValidityFingerprint | null, current = startedChange()) {
  const repo = new StubChangeRepository([current])
  const schema = makeSchema()
  const useCase = new CompleteVerification({
    changes: repo,
    actor: makeActorResolver(),
    fingerprint: {
      completeFingerprint: async () =>
        fingerprint === null
          ? {
              fingerprint: null,
              failures: [
                { scope: 'implementation', key: 'src/a.ts', reason: 'missing', message: 'missing' },
              ],
            }
          : { fingerprint, failures: [] },
    } as never,
    reconcileChangeValidity: new ReconcileChangeValidity({
      changes: repo,
      schemaProvider: makeSchemaProvider(schema),
      actor: makeActorResolver(),
      refreshImplementationTracking: {
        execute: async () => undefined,
      } as unknown as RefreshImplementationTracking,
      fingerprint: {
        completeFingerprint: async () => ({ fingerprint: baseline, failures: [] }),
      } as never,
      approvals: { spec: false, signoff: false },
    }),
  })
  return { useCase, repo }
}

describe('CompleteVerification', () => {
  it('records completed evidence when the fresh fingerprint matches the baseline', async () => {
    const { useCase } = harness(baseline)
    const result = await useCase.execute({ name: 'c1' })
    expect(result.verification.status).toBe('valid')
    expect(result.verification.attemptId).toBe('verification-attempt-1')
    expect(result.change.verification.activeAttempt).toBeUndefined()
    expect(result.change.state).toBe('drafting')
  })

  it('leaves the baseline unchanged when the fingerprint mismatches', async () => {
    const { useCase, repo } = harness(drifted)
    await expect(useCase.execute({ name: 'c1' })).rejects.toBeInstanceOf(
      VerificationFingerprintMismatchError,
    )
    const stored = repo.store.get('c1')
    expect(stored?.verification.activeAttempt?.id).toBe('verification-attempt-1')
    expect(stored?.verification.completed).toBeUndefined()
    expect(stored?.history.some((event) => event.type === 'verification-completed')).toBe(false)
  })

  it('rejects completion when no attempt is active', async () => {
    const bare = new Change({
      name: 'c1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      specIds: ['core:change'],
      history: [
        {
          type: 'created',
          at: new Date('2026-01-01T00:00:00.000Z'),
          by: testActor,
          specIds: ['core:change'],
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
      ],
    })
    const { useCase } = harness(baseline, bare)
    await expect(useCase.execute({ name: 'c1' })).rejects.toBeInstanceOf(
      VerificationAttemptNotFoundError,
    )
  })
})
