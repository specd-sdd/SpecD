import { afterEach, describe, expect, it } from 'vitest'
import { type ActorResolver } from '../../src/application/ports/actor-resolver.js'
import { type PrivacyConfig, type SpecdConfig } from '../../src/application/specd-config.js'
import { ValidityFingerprintService } from '../../src/application/services/validity-fingerprint-service.js'
import { type RefreshImplementationTracking } from '../../src/application/use-cases/refresh-implementation-tracking.js'
import { pass, type Check } from '../../src/domain/services/transition-checks.js'
import { Change, type ActorIdentity, type ChangeEvent } from '../../src/domain/entities/change.js'
import { type ChangeState } from '../../src/domain/value-objects/change-state.js'
import { type ValidityFingerprint } from '../../src/domain/value-objects/validity-fingerprint.js'
import { NodeBinaryContentHasher } from '../../src/infrastructure/node/binary-content-hasher.js'
import { type ActorProvider } from '../../src/composition/actor-provider.js'
import { createCompositionResolver } from '../../src/composition/composition-resolver.js'
import { PrivacyActorResolver } from '../../src/composition/privacy-actor-resolver.js'
import { createApproveSignoff } from '../../src/composition/use-cases/approve-signoff.js'
import { createApproveSpec } from '../../src/composition/use-cases/approve-spec.js'
import {
  createCompleteVerification,
  createInvalidateVerification,
  createReconcileChangeValidity,
  createStartVerification,
  resolveCompleteVerificationDeps,
  resolveInvalidateVerificationDeps,
  resolveReconcileChangeValidityDeps,
  resolveStartVerificationDeps,
} from '../../src/composition/use-cases/verification-factories.js'
import { resolveApproveSpecDeps } from '../../src/composition/use-cases/approve-spec.js'
import { resolveApproveSignoffDeps } from '../../src/composition/use-cases/approve-signoff.js'
import {
  makeChangeRepository,
  makeContentHasher,
  makeSchema,
  makeSchemaProvider,
  testActor,
} from '../application/use-cases/helpers.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './use-cases/helpers.js'

const RAW: ActorIdentity = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  provider: 'git',
  providerId: '12345',
  metadata: { dept: 'Engineering', role: 'Maintainer' },
}

const HASHED_EMAIL = '2a082e338f2d0ad6cc1f0772849e354c1b66c1524973c71177fef39adb922fd0'

const RAW_MARKERS = ['John Doe', 'john.doe@example.com', '12345', 'Engineering', 'Maintainer']

function privacyFor(mode: PrivacyConfig['mode']): PrivacyConfig {
  return mode === 'hash' ? { mode, salt: 'my-secret-salt' } : { mode }
}

function rawResolver(): ActorResolver {
  return {
    identity: async () => ({
      name: RAW.name,
      email: RAW.email,
      provider: 'git',
      providerId: '12345',
      metadata: { dept: 'Engineering', role: 'Maintainer' },
    }),
  }
}

function persistedRecord(change: Change): string {
  return JSON.stringify({
    specApproval: change.specApproval,
    signoff: change.signoff,
    verification: change.verification,
    history: change.history,
  })
}

function assertRawAbsent(record: string): void {
  for (const marker of RAW_MARKERS) {
    expect(record).not.toContain(marker)
  }
}

function changeWith(
  name: string,
  transitions: ReadonlyArray<readonly [ChangeState, ChangeState]>,
): Change {
  const createdAt = new Date('2024-01-01T00:00:00.000Z')
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: ['auth/login'],
      schemaName: 'test-schema',
      schemaVersion: 1,
    },
    ...transitions.map(
      ([from, to]): ChangeEvent => ({
        type: 'transitioned',
        from,
        to,
        at: createdAt,
        by: testActor,
      }),
    ),
  ]
  return new Change({ name, createdAt, specIds: ['auth/login'], history })
}

const readyPath: ReadonlyArray<readonly [ChangeState, ChangeState]> = [
  ['drafting', 'designing'],
  ['designing', 'ready'],
]

const donePath: ReadonlyArray<readonly [ChangeState, ChangeState]> = [
  ...readyPath,
  ['ready', 'implementing'],
  ['implementing', 'verifying'],
  ['verifying', 'done'],
]

describe('privacy-decorated approval and verification identities', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('routes config factories through the single privacy-decorated actor resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-privacy-actor')
    fixture = setup.fixture
    const provider: ActorProvider = {
      name: 'fixture',
      create: async () => rawResolver(),
    }
    const config: SpecdConfig = {
      ...setup.config,
      approvals: { spec: true, signoff: true },
      actorProvider: 'fixture',
      privacy: { mode: 'hash', salt: 'my-secret-salt' },
    }
    const resolver = createCompositionResolver(config, { actorProviders: [provider] })
    const actor = resolver.getActorResolver()

    expect(actor).toBeInstanceOf(PrivacyActorResolver)
    expect(resolveApproveSpecDeps(resolver).actor).toBe(actor)
    expect(resolveApproveSignoffDeps(resolver).actor).toBe(actor)
    expect(resolveReconcileChangeValidityDeps(resolver).actor).toBe(actor)
    expect(resolveStartVerificationDeps(resolver).actor).toBe(actor)
    expect(resolveCompleteVerificationDeps(resolver).actor).toBe(actor)
    expect(resolveInvalidateVerificationDeps(resolver).actor).toBe(actor)

    const identity = await actor.identity()
    expect(identity.name).toBe('J***e')
    expect(identity.email).toBe(HASHED_EMAIL)
    expect(identity.providerId).toBeUndefined()
    expect(identity.metadata).toBeUndefined()
    expect(identity.email).not.toBe(RAW.email)
  })

  it.each(['mask', 'hash', 'anonymous'] as const)(
    'records the %s identity once and omits raw actor fields from the persisted record',
    async (mode) => {
      const actor = new PrivacyActorResolver(rawResolver(), privacyFor(mode))
      const expected = await actor.identity()
      const schema = makeSchema()
      const schemaProvider = makeSchemaProvider(schema)
      const refresh = { execute: async () => undefined } as unknown as RefreshImplementationTracking
      const checks: Check[] = [
        {
          id: 'impl.filesResolved',
          label: 'Checking open implementation files',
          kind: 'predicate',
          execute: async () => pass('impl.filesResolved'),
        },
        {
          id: 'impl.linksInScope',
          label: 'Checking implementation link scope',
          kind: 'predicate',
          execute: async () => pass('impl.linksInScope'),
        },
      ]

      const approvalRepo = makeChangeRepository([changeWith('approve-me', readyPath)])
      const approvalHasher = makeContentHasher()
      const approvalFingerprint = new ValidityFingerprintService({
        changes: approvalRepo,
        hasher: approvalHasher,
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      })
      const approvalReconcile = createReconcileChangeValidity({
        changes: approvalRepo,
        schemaProvider,
        actor,
        refreshImplementationTracking: refresh,
        fingerprint: approvalFingerprint,
        approvals: { spec: true, signoff: true },
      })
      const approved = await createApproveSpec({
        changes: approvalRepo,
        actor,
        schemaProvider,
        contentHasher: approvalHasher,
        approvals: { spec: true, signoff: true },
        reconcile: approvalReconcile,
        fingerprint: approvalFingerprint,
      }).execute({ name: 'approve-me', reason: 'spec looks right' })
      const specEvent = approved.history.find((event) => event.type === 'spec-approved')
      expect(approved.specApproval?.decision.by).toEqual(expected)
      expect(specEvent?.type === 'spec-approved' ? specEvent.by : undefined).toEqual(expected)
      assertRawAbsent(persistedRecord(approved))

      const verifyRepo = makeChangeRepository([changeWith('verify-me', [])])
      const verifyFingerprint = new ValidityFingerprintService({
        changes: verifyRepo,
        hasher: makeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      })
      const verifyReconcile = createReconcileChangeValidity({
        changes: verifyRepo,
        schemaProvider,
        actor,
        refreshImplementationTracking: refresh,
        fingerprint: verifyFingerprint,
        approvals: { spec: true, signoff: true },
      })
      const started = await createStartVerification({
        changes: verifyRepo,
        actor,
        reconcileChangeValidity: verifyReconcile,
        refreshImplementationTracking: refresh,
        fingerprint: verifyFingerprint,
        schemaProvider,
        implementationChecks: checks,
      }).execute({ name: 'verify-me' })
      const startEvent = started.change.history.find(
        (event) => event.type === 'verification-attempt-started',
      )
      expect(started.attempt.startedBy).toEqual(expected)
      expect(
        startEvent?.type === 'verification-attempt-started' ? startEvent.by : undefined,
      ).toEqual(expected)

      const completed = await createCompleteVerification({
        changes: verifyRepo,
        actor,
        reconcileChangeValidity: verifyReconcile,
        fingerprint: verifyFingerprint,
      }).execute({ name: 'verify-me' })
      const completeEvent = completed.change.history.find(
        (event) => event.type === 'verification-completed',
      )
      expect(completed.verification.completedBy).toEqual(expected)
      expect(
        completeEvent?.type === 'verification-completed' ? completeEvent.by : undefined,
      ).toEqual(expected)
      assertRawAbsent(persistedRecord(completed.change))

      const signoffChange = changeWith('sign-me', donePath)
      const seeded = await verifyFingerprint.completeFingerprint(signoffChange)
      const baseline = seeded.fingerprint
      expect(baseline).not.toBeNull()
      signoffChange.startVerification(baseline as ValidityFingerprint, testActor)
      signoffChange.completeVerification(testActor)
      const signoffRepo = makeChangeRepository([signoffChange])
      const signoffFingerprint = new ValidityFingerprintService({
        changes: signoffRepo,
        hasher: makeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      })
      const signoffReconcile = createReconcileChangeValidity({
        changes: signoffRepo,
        schemaProvider,
        actor,
        refreshImplementationTracking: refresh,
        fingerprint: signoffFingerprint,
        approvals: { spec: true, signoff: true },
      })
      const signed = await createApproveSignoff({
        changes: signoffRepo,
        actor,
        schemaProvider,
        contentHasher: makeContentHasher(),
        approvals: { spec: true, signoff: true },
        reconcile: signoffReconcile,
        fingerprint: signoffFingerprint,
        refreshImplementationTracking: refresh,
      }).execute({ name: 'sign-me', reason: 'ship it' })
      const signoffEvent = signed.history.find((event) => event.type === 'signed-off')
      expect(signed.signoff?.decision.by).toEqual(expected)
      expect(signoffEvent?.type === 'signed-off' ? signoffEvent.by : undefined).toEqual(expected)
      assertRawAbsent(persistedRecord(signed))

      const invalidateChange = changeWith('drop-me', donePath)
      const invalidateSeed = await signoffFingerprint.completeFingerprint(invalidateChange)
      expect(invalidateSeed.fingerprint).not.toBeNull()
      invalidateChange.startVerification(
        invalidateSeed.fingerprint as ValidityFingerprint,
        testActor,
      )
      invalidateChange.completeVerification(testActor)
      const invalidateRepo = makeChangeRepository([invalidateChange])
      const invalidateFingerprint = new ValidityFingerprintService({
        changes: invalidateRepo,
        hasher: makeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      })
      const invalidateReconcile = createReconcileChangeValidity({
        changes: invalidateRepo,
        schemaProvider,
        actor,
        refreshImplementationTracking: refresh,
        fingerprint: invalidateFingerprint,
        approvals: { spec: true, signoff: true },
      })
      const invalidated = await createInvalidateVerification({
        changes: invalidateRepo,
        actor,
        reconcileChangeValidity: invalidateReconcile,
      }).execute({ name: 'drop-me', reason: 'evidence withdrawn' })
      const invalidatedEvent = invalidated.change.history.find(
        (event) => event.type === 'verification-invalidated',
      )
      expect(invalidated.invalidated).toBe(true)
      expect(invalidated.verification.invalidation?.by).toEqual(expected)
      expect(
        invalidatedEvent?.type === 'verification-invalidated' ? invalidatedEvent.by : undefined,
      ).toEqual(expected)
      assertRawAbsent(persistedRecord(invalidated.change))

      if (mode === 'anonymous') {
        expect(expected.name).toBe('Anonymous')
        expect(expected.email).toBe('anonymous@getspecd.dev')
      }
      if (mode === 'hash') {
        expect(expected.email).toBe(HASHED_EMAIL)
      }
      if (mode === 'mask') {
        expect(expected.name).toBe('J***e')
        expect(expected.email).toBe('j***e@e***.com')
      }
    },
  )
})
