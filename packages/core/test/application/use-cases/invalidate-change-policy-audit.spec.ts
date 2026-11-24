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

describe('InvalidateChange policy and audit scenarios', () => {
  describe('gate priority wins over preserve', () => {
    async function setup() {
      const change = makeImplementingChange('both-gates')
      change.transition('verifying', testActor)
      change.transition('done', testActor)
      const repo = makeChangeRepository([change])
      await recordValidSpecApproval(change, repo)
      await recordValidSignoff(change, repo)
      expect(change.specApproval?.status).toBe('valid')
      expect(change.signoff?.status).toBe('valid')
      return { change, repo }
    }

    it('requires force when both consents are valid and reports both gates', async () => {
      const { change, repo } = await setup()
      const uc = createInvalidate(repo, { spec: true, signoff: true })

      const error = await uc
        .execute({ name: change.name, reason: 'review', ...surgicalDesign })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidateRequiresForceError)
      expect(change.specApproval?.status).toBe('valid')
      expect(change.signoff?.status).toBe('valid')
    })

    it('previews one combined recovery to designing for the whole revoked gate set', async () => {
      const { change, repo } = await setup()
      const uc = createInvalidate(repo, { spec: true, signoff: true })

      const error = await uc
        .execute({ name: change.name, reason: 'review', ...surgicalDesign })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidateRequiresForceError)
      expect((error as InvalidateRequiresForceError).recoveries).toEqual([
        { gate: 'spec', target: 'designing' },
        { gate: 'signoff', target: 'designing' },
      ])
    })

    it('returns spec recovery to designing, keeps audit evidence, and is idempotent on repeat', async () => {
      const { change, repo } = await setup()
      const uc = createInvalidate(repo, { spec: true, signoff: true })

      const first = await uc.execute({
        name: change.name,
        reason: 'review',
        force: true,
        ...surgicalDesign,
      })

      expect(first.automaticReturn).toMatchObject({ cause: 'spec-approval', to: 'designing' })
      expect(first.change.state).toBe('designing')
      const projections = first.projectionChanges.map((item) => item.projection)
      expect(projections).toContain('specApproval')
      expect(projections).toContain('signoff')
      // Audit evidence is retained: the projections still exist, no longer valid.
      expect(first.change.specApproval).toBeDefined()
      expect(first.change.specApproval?.status).not.toBe('valid')
      expect(first.change.signoff).toBeDefined()
      expect(first.change.signoff?.status).not.toBe('valid')
      expect(first.change.history.filter((e) => e.type === 'spec-approved')).toHaveLength(1)
      expect(first.change.history.filter((e) => e.type === 'signed-off')).toHaveLength(1)

      const historyAfterFirst = first.change.history.length
      const second = await uc.execute({
        name: change.name,
        reason: 'review',
        force: true,
        ...surgicalDesign,
      })

      expect(second.projectionChanges).toEqual([])
      expect(second.automaticReturn).toBeNull()
      expect(second.change.state).toBe('designing')
      const transitions = second.change.history.filter((e) => e.type === 'transitioned')
      expect(
        transitions.filter((e) => e.type === 'transitioned' && e.to === 'designing'),
      ).toHaveLength(
        2, // initial entry + the single recovery
      )
      expect(
        second.change.history.slice(historyAfterFirst).filter((e) => e.type === 'transitioned'),
      ).toEqual([])
    })
  })

  describe('workflow-only policy override', () => {
    it('keeps the artifact dimension from the persisted policy and does not alter normalization', async () => {
      const change = makeImplementingChange('wf-only')
      change.invalidationPolicy = { artifacts: 'surgical', workflow: 'preserve' }
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      const result = await uc.execute({
        name: 'wf-only',
        reason: 'only workflow',
        targets: [{ artifactId: 'design' }],
        policyOverride: { workflow: 'redesign' },
      })

      expect(result.effectivePolicy).toEqual({ artifacts: 'surgical', workflow: 'redesign' })
      // Surgical expansion: only the target, no descendants.
      expect(result.affected.map((file) => file.artifactId)).toEqual(['design'])
      expect(result.affected[0]?.expansion).toBe('direct')
      expect(result.change.getArtifact('tasks')?.status).toBe('complete')
    })

    it('still demands targets when the persisted artifact policy requires them', async () => {
      const change = makeImplementingChange('wf-only-targets')
      change.invalidationPolicy = { artifacts: 'surgical', workflow: 'preserve' }
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      await expect(
        uc.execute({
          name: 'wf-only-targets',
          reason: 'no targets',
          policyOverride: { workflow: 'redesign' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INVALIDATE_TARGET' })
    })

    it('rejects targets when the persisted artifact policy forbids them', async () => {
      const change = makeImplementingChange('wf-only-global')
      change.invalidationPolicy = { artifacts: 'global', workflow: 'preserve' }
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      await expect(
        uc.execute({
          name: 'wf-only-global',
          reason: 'targets not allowed',
          targets: [{ artifactId: 'design' }],
          policyOverride: { workflow: 'redesign' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INVALIDATE_TARGET' })
    })
  })

  describe('invalid policy value', () => {
    // Real src gap (not fixed here): InvalidateChange never validates override values against
    // isArtifactInvalidationPolicy / isWorkflowInvalidationPolicy. With targets present an
    // unsupported value passes validateCommandShape and the change is mutated.
    it('rejects an unsupported artifact policy value before mutation', async () => {
      const change = makeImplementingChange('bad-artifacts')
      const repo = makeChangeRepository([change])
      const before = change.history.length
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      await expect(
        uc.execute({
          name: 'bad-artifacts',
          reason: 'bogus',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'bogus' as never },
        }),
      ).rejects.toThrow()
      expect(repo.store.get('bad-artifacts')?.history).toHaveLength(before)
      expect(change.getArtifact('design')?.status).toBe('complete')
    })

    it('rejects an unsupported workflow policy value before mutation', async () => {
      const change = makeImplementingChange('bad-workflow')
      const repo = makeChangeRepository([change])
      const before = change.history.length
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      await expect(
        uc.execute({
          name: 'bad-workflow',
          reason: 'bogus',
          targets: [{ artifactId: 'design' }],
          policyOverride: { artifacts: 'surgical', workflow: 'bogus' as never },
        }),
      ).rejects.toThrow()
      expect(repo.store.get('bad-workflow')?.history).toHaveLength(before)
      expect(change.getArtifact('design')?.status).toBe('complete')
    })

    it('rejects an unsupported artifact value when no target is supplied, leaving the change untouched', async () => {
      const change = makeImplementingChange('bad-no-target')
      const repo = makeChangeRepository([change])
      const before = change.history.length
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      await expect(
        uc.execute({
          name: 'bad-no-target',
          reason: 'bogus',
          policyOverride: { artifacts: 'bogus' as never },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INVALIDATE_TARGET' })
      expect(repo.store.get('bad-no-target')?.history).toHaveLength(before)
    })
  })

  describe('execution override is not persisted', () => {
    it('uses the overlaid policy for the run and leaves the change default unchanged', async () => {
      const change = makeImplementingChange('no-persist')
      const defaultPolicy = { ...change.invalidationPolicy }
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, { spec: false, signoff: false })

      const result = await uc.execute({
        name: 'no-persist',
        reason: 'override',
        targets: [{ artifactId: 'design' }],
        policyOverride: { artifacts: 'surgical', workflow: 'redesign' },
      })

      expect(result.effectivePolicy).toEqual({ artifacts: 'surgical', workflow: 'redesign' })
      expect(result.change.getArtifact('design')?.status).toBe('pending-review')
      expect(result.change.getArtifact('tasks')?.status).toBe('complete')
      expect(result.change.invalidationPolicy).toEqual(defaultPolicy)
      expect(repo.store.get('no-persist')?.invalidationPolicy).toEqual(defaultPolicy)
    })
  })

  describe('idempotent output on repeat', () => {
    it('reports no new projection or recovery effects when the same invalidity is applied again', async () => {
      const change = makeImplementingChange('repeat')
      const repo = makeChangeRepository([change])
      const uc = createInvalidate(repo, { spec: false, signoff: false })
      const input = { name: 'repeat', reason: 'again', ...surgicalDesign }

      await uc.execute(input)
      const second = await uc.execute(input)

      expect(second.projectionChanges).toEqual([])
      expect(second.automaticReturn).toBeNull()
      expect(second.change.state).toBe('implementing')
      expect(second.change.getArtifact('design')?.status).toBe('pending-review')
      expect(second.affected.map((file) => file.artifactId)).toContain('design')
    })
  })
})
