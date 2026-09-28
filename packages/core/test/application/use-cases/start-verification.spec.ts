import { describe, expect, it } from 'vitest'
import { ArchiveImplementationStateError } from '../../../src/domain/errors/archive-implementation-state-error.js'
import { Change } from '../../../src/domain/entities/change.js'
import { fail, pass } from '../../../src/domain/services/transition-checks.js'
import { FingerprintInputError } from '../../../src/application/errors/fingerprint-input-error.js'
import { StartVerification } from '../../../src/application/use-cases/start-verification.js'
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
  artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
  implementation: {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {},
  },
}

function change(): Change {
  return new Change({
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
}

function harness(options?: {
  readonly failCheck?: boolean
  readonly fingerprint?: ValidityFingerprint | null
}) {
  const repo = new StubChangeRepository([change()])
  const schema = makeSchema()
  let refreshed = 0
  const seenContexts: unknown[] = []
  const useCase = new StartVerification({
    changes: repo,
    actor: makeActorResolver(),
    schemaProvider: makeSchemaProvider(schema),
    refreshImplementationTracking: {
      execute: async () => {
        refreshed += 1
      },
    } as unknown as RefreshImplementationTracking,
    fingerprint: {
      completeFingerprint: async () =>
        options?.fingerprint === null
          ? {
              fingerprint: null,
              failures: [
                {
                  scope: 'artifact',
                  key: 'proposal:proposal',
                  reason: 'missing',
                  message: 'missing',
                },
              ],
            }
          : { fingerprint: options?.fingerprint ?? baseline, failures: [] },
    } as never,
    implementationChecks: [
      {
        id: 'impl.filesResolved',
        label: 'Checking open implementation files',
        kind: 'predicate',
        execute: async (ctx) => {
          seenContexts.push(ctx)
          return options?.failCheck === true
            ? fail('impl.filesResolved', 'OPEN_FILES', 'open files', { files: ['src/a.ts'] })
            : pass('impl.filesResolved')
        },
      },
      {
        id: 'impl.linksInScope',
        label: 'Checking implementation link scope',
        kind: 'predicate',
        execute: async (ctx) => {
          seenContexts.push(ctx)
          return pass('impl.linksInScope')
        },
      },
    ],
    reconcileChangeValidity: new ReconcileChangeValidity({
      changes: repo,
      schemaProvider: makeSchemaProvider(schema),
      actor: makeActorResolver(),
      refreshImplementationTracking: {
        execute: async () => {
          throw new Error('refresh should stay outside the reconciler')
        },
      } as unknown as RefreshImplementationTracking,
      fingerprint: {
        completeFingerprint: async () => ({ fingerprint: baseline, failures: [] }),
      } as never,
      approvals: { spec: false, signoff: false },
    }),
  })
  return { useCase, repo, refreshed: () => refreshed, seenContexts }
}

describe('StartVerification', () => {
  it('starts an attempt without moving lifecycle state', async () => {
    const { useCase, refreshed, seenContexts } = harness()
    const result = await useCase.execute({ name: 'c1' })
    expect(refreshed()).toBe(1)
    expect(result.change.state).toBe('drafting')
    expect(result.attempt.id).toBe('verification-attempt-1')
    expect(result.supersededAttemptId).toBeNull()
    expect(result.change.verification.completed).toBeUndefined()
    expect(seenContexts).toHaveLength(2)
    expect(seenContexts).toEqual([
      expect.objectContaining({
        attempt: { scope: 'operation', operation: 'verification-start' },
        validity: expect.objectContaining({ verification: 'not-required' }),
      }),
      expect.objectContaining({
        attempt: { scope: 'operation', operation: 'verification-start' },
        validity: expect.objectContaining({ verification: 'not-required' }),
      }),
    ])
  })

  it('supersedes only the active attempt', async () => {
    const { useCase } = harness()
    await useCase.execute({ name: 'c1' })
    const second = await useCase.execute({ name: 'c1' })
    expect(second.attempt.id).toBe('verification-attempt-2')
    expect(second.supersededAttemptId).toBe('verification-attempt-1')
    expect(second.change.verification.activeAttempt?.id).toBe('verification-attempt-2')
  })

  it('fails before storing a baseline when implementation readiness fails', async () => {
    const { useCase, repo } = harness({ failCheck: true })
    await expect(useCase.execute({ name: 'c1' })).rejects.toBeInstanceOf(
      ArchiveImplementationStateError,
    )
    expect(repo.store.get('c1')?.verification.activeAttempt).toBeUndefined()
  })

  it('does not start an attempt when the fingerprint cannot be collected', async () => {
    const { useCase, repo } = harness({ fingerprint: null })
    await expect(useCase.execute({ name: 'c1' })).rejects.toBeInstanceOf(FingerprintInputError)
    expect(repo.store.get('c1')?.verification.activeAttempt).toBeUndefined()
  })
})
