import { describe, it, expect, vi } from 'vitest'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { FingerprintInputError } from '../../../src/application/errors/fingerprint-input-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { boundFromStates } from '../../../src/domain/services/check-bindings.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ImplementationFileReadResult } from '../../../src/application/ports/change-repository.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeWorkflowStep,
  makeContentHasher,
  makeSpecApprovalFingerprint,
  testActor,
} from './helpers.js'

const PATH_TO_DONE = ['designing', 'ready', 'implementing', 'verifying', 'done'] as const

function makeChangeAt(name: string, path: readonly string[], specIds = ['auth/login']): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds,
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
    specIds,
    schemaName: 'test-schema',
    schemaVersion: 1,
    history,
  })
}

function build(
  repo: ReturnType<typeof makeChangeRepository>,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema = makeSchema(),
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

const disabledVerifying = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])

describe('ApproveSpec eligible states and parking states', () => {
  it('reads the eligible states from the approval.spec bindings', () => {
    expect([...boundFromStates('approval.spec')].sort()).toEqual(
      ['pending-spec-approval', 'ready', 'spec-approved'].sort(),
    )
  })

  it.each(['designing', 'implementing', 'verifying', 'done'] as const)(
    'rejects consent from %s with InvalidStateTransitionError',
    async (state) => {
      const path = PATH_TO_DONE.slice(0, PATH_TO_DONE.indexOf(state) + 1)
      const change = makeChangeAt('wrong-state', path)
      const repo = makeChangeRepository([change])
      vi.spyOn(repo, 'artifact').mockResolvedValue(null)
      const { spec } = build(repo, { spec: true, signoff: false })

      await expect(spec.execute({ name: 'wrong-state', reason: 'ok' })).rejects.toBeInstanceOf(
        InvalidStateTransitionError,
      )
    },
  )

  it('records consent in the spec-approved parking state without transitioning', async () => {
    const change = makeChangeAt('parked-spec', ['designing', 'ready', 'spec-approved'])
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
    const { spec } = build(repo, { spec: true, signoff: false })
    const before = change.history.length

    const result = await spec.execute({ name: 'parked-spec', reason: 'renewed' })

    expect(result.state).toBe('spec-approved')
    expect(result.activeSpecApproval?.reason).toBe('renewed')
    const added = result.history.slice(before).map((event) => event.type)
    expect(added).toContain('spec-approved')
    expect(added).not.toContain('transitioned')
  })
})

describe('ApproveSignoff eligible states and parking states', () => {
  it('reads the eligible states from the approval.signoff bindings', () => {
    expect([...boundFromStates('approval.signoff')].sort()).toEqual(
      ['done', 'pending-signoff', 'signed-off'].sort(),
    )
  })

  it.each(['designing', 'implementing', 'verifying'] as const)(
    'rejects consent from %s with InvalidStateTransitionError',
    async (state) => {
      const path = PATH_TO_DONE.slice(0, PATH_TO_DONE.indexOf(state) + 1)
      const change = makeChangeAt('wrong-state', path)
      const repo = makeChangeRepository([change])
      const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)

      await expect(signoff.execute({ name: 'wrong-state', reason: 'ok' })).rejects.toBeInstanceOf(
        InvalidStateTransitionError,
      )
    },
  )

  it('records sign-off in the signed-off parking state without transitioning', async () => {
    const change = makeChangeAt('parked-signoff', [...PATH_TO_DONE, 'signed-off'])
    const repo = makeChangeRepository([change])
    const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)
    const before = change.history.length

    const result = await signoff.execute({ name: 'parked-signoff', reason: 'renewed' })

    expect(result.state).toBe('signed-off')
    expect(result.signoff?.status).toBe('valid')
    const added = result.history.slice(before).map((event) => event.type)
    expect(added).toContain('signed-off')
    expect(added).not.toContain('transitioned')
  })
})

describe('historic parking states with stale consent', () => {
  it('recovers a stale spec-approved change to designing, then fails the approval', async () => {
    const change = makeChangeAt('historic-spec', ['designing', 'ready', 'spec-approved'])
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'artifact').mockResolvedValue(new SpecArtifact('spec.md', '# Spec'))
    const { spec } = build(repo, { spec: true, signoff: false })

    const error = await spec
      .execute({ name: 'historic-spec', reason: 'renew' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidStateTransitionError)
    expect((error as InvalidStateTransitionError).message).toContain('designing')
    const persisted = repo.store.get('historic-spec')!
    expect(persisted.state).toBe('designing')
    expect(persisted.specApproval?.status).toBe('stale')
  })

  it('recovers a stale signed-off change to done and records the renewed sign-off there', async () => {
    const change = makeChangeAt('historic-signoff', [...PATH_TO_DONE, 'signed-off'])
    change.recordSignoff(
      'old',
      {
        version: 1,
        artifacts: {
          version: 1,
          algorithm: 'artifact-pre-hash-v1',
          files: { 'proposal:proposal': 'sha256:gone' },
        },
        implementation: null,
      },
      testActor,
    )
    const repo = makeChangeRepository([change])
    const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)

    const result = await signoff.execute({ name: 'historic-signoff', reason: 'renewed' })

    expect(result.state).toBe('done')
    expect(result.signoff?.status).toBe('valid')
    expect(result.signoff?.decision.reason).toBe('renewed')
    expect(repo.store.get('historic-signoff')!.state).toBe('done')
  })
})

describe('ApproveSignoff whole-file implementation fingerprint', () => {
  const found = (path: string, text: string): ImplementationFileReadResult =>
    ({
      status: 'found',
      path,
      bytes: new TextEncoder().encode(text),
    }) as ImplementationFileReadResult

  function linkedDoneChange(): Change {
    const change = makeChangeAt('linked', PATH_TO_DONE, ['auth/login', 'auth/other'])
    change.addImplementationLink({
      specId: 'auth/login',
      file: 'src/b.ts',
      fileLinkExplicit: true,
      symbols: ['alpha'],
    })
    change.addImplementationLink({
      specId: 'auth/other',
      file: 'src/b.ts',
      fileLinkExplicit: false,
      symbols: ['beta'],
    })
    change.addImplementationLink({ specId: 'auth/login', file: 'src/a.ts', fileLinkExplicit: true })
    return change
  }

  it('hashes each project-relative path once, in lexical order, as a whole file', async () => {
    const change = linkedDoneChange()
    const repo = makeChangeRepository([change])
    const read = vi
      .spyOn(repo, 'implementationFile')
      .mockImplementation(async (_c, path) => found(path, `content of ${path}`))
    const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)

    const result = await signoff.execute({ name: 'linked', reason: 'ship it' })

    // Reconciliation and sign-off each collect the fingerprint: every pass reads each path once.
    const paths = read.mock.calls.map((call) => call[1])
    expect(paths.length % 2).toBe(0)
    for (let index = 0; index < paths.length; index += 2) {
      expect(paths.slice(index, index + 2)).toEqual(['src/a.ts', 'src/b.ts'])
    }
    const files = result.signoff?.fingerprint.implementation?.files ?? {}
    expect(Object.keys(files)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(files['src/a.ts']?.content).toBe('text')
  })

  it('fails sign-off when a linked file is unreadable', async () => {
    const change = linkedDoneChange()
    const repo = makeChangeRepository([change])
    vi.spyOn(repo, 'implementationFile').mockImplementation(async (_c, path) =>
      path === 'src/b.ts'
        ? ({ status: 'missing', path } as ImplementationFileReadResult)
        : found(path, 'ok'),
    )
    const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)

    const error = await signoff
      .execute({ name: 'linked', reason: 'ship it' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FingerprintInputError)
    expect(change.signoff).toBeUndefined()
  })

  it('records an empty implementation map, distinct from unknown, when no files are linked', async () => {
    const change = makeChangeAt('no-links', PATH_TO_DONE)
    const repo = makeChangeRepository([change])
    const { signoff } = build(repo, { spec: false, signoff: true }, disabledVerifying)

    const result = await signoff.execute({ name: 'no-links', reason: 'ship it' })

    expect(result.signoff?.fingerprint.implementation).not.toBeNull()
    expect(result.signoff?.fingerprint.implementation?.files).toEqual({})
  })
})
