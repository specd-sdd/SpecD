import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { VerificationNotFoundError } from '../../../src/application/errors/verification-not-found-error.js'
import { InvalidateVerification } from '../../../src/application/use-cases/invalidate-verification.js'
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

function completedChange(options?: { readonly signoff?: boolean }): Change {
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
  const completed = change.completeVerification(testActor, new Date('2026-01-03T00:00:00.000Z'))
  if (options?.signoff === true) {
    change.recordSignoff(
      'ok',
      baseline,
      completed.id,
      testActor,
      new Date('2026-01-04T00:00:00.000Z'),
    )
  }
  return change
}

/** Advances a fixture through the canonical delivery axis. */
function moveTo(change: Change, target: 'archivable' | 'archiving'): void {
  for (const state of [
    'designing',
    'ready',
    'implementing',
    'verifying',
    'done',
    'archivable',
  ] as const) {
    change.transition(state, testActor)
  }
  if (target === 'archiving') {
    change.transition('archiving', testActor)
  }
}

function harness(current: Change) {
  const repo = new StubChangeRepository([current])
  const schema = makeSchema()
  const useCase = new InvalidateVerification({
    changes: repo,
    actor: makeActorResolver(),
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
      approvals: { spec: true, signoff: true },
    }),
  })
  return { useCase, repo }
}

describe('InvalidateVerification', () => {
  it('marks completed evidence and a valid sign-off stale once', async () => {
    const { useCase } = harness(completedChange({ signoff: true }))
    const first = await useCase.execute({ name: 'c1', reason: 'evidence withdrawn' })
    expect(first.invalidated).toBe(true)
    expect(first.signoffChanged).toBe(true)
    expect(first.verification.status).toBe('stale')
    expect(first.change.state).toBe('drafting')
    const events = first.change.history.filter((event) => event.type === 'verification-invalidated')
    expect(events).toHaveLength(1)
    const second = await useCase.execute({ name: 'c1', reason: 'again' })
    expect(second.invalidated).toBe(false)
    expect(second.reason).toBe('evidence withdrawn')
    expect(
      second.change.history.filter((event) => event.type === 'verification-invalidated'),
    ).toHaveLength(1)
  })

  it('rejects attempt-only evidence without mutation', async () => {
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
    change.startVerification(baseline, testActor)
    const { useCase, repo } = harness(change)
    await expect(useCase.execute({ name: 'c1', reason: 'no' })).rejects.toBeInstanceOf(
      VerificationNotFoundError,
    )
    expect(repo.store.get('c1')?.verification.activeAttempt).toBeDefined()
    expect(
      repo.store.get('c1')?.history.some((event) => event.type === 'verification-invalidated'),
    ).toBe(false)
  })

  it.each(['archivable', 'archiving'] as const)(
    'recommends verification in place when invalidated from %s without gate recovery',
    async (state) => {
      const change = completedChange()
      moveTo(change, state)
      const { useCase } = harness(change)

      const result = await useCase.execute({ name: 'c1', reason: 'withdrawn' })

      expect(result.change.state).toBe(state)
      expect(result.automaticReturn).toBeNull()
      expect(result.nextAction).toMatchObject({
        targetStep: state,
        command: '/specd-verify',
      })
    },
  )

  it('keeps sign-off recovery ahead of in-place late-state guidance', async () => {
    const change = completedChange({ signoff: true })
    moveTo(change, 'archivable')
    const { useCase } = harness(change)

    const result = await useCase.execute({ name: 'c1', reason: 'withdrawn' })

    expect(result.change.state).toBe('done')
    expect(result.automaticReturn).toMatchObject({ from: 'archivable', to: 'done' })
    expect(result.nextAction).toMatchObject({ targetStep: 'done', command: '/specd-verify' })
  })
})
