import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type Change } from '../../../src/domain/entities/change.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import {
  fail,
  startVerificationAction,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import {
  makeChangeRepository,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  testActor,
} from './helpers.js'

function makeStdSchema(): Schema {
  return makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('specs', { scope: 'spec' }),
    makeArtifactType('verify', { scope: 'spec', requires: ['specs'] }),
  ])
}

function makeGetStatus(
  change: Change,
  verdict: ChangeValidityVerdict,
  opts: {
    approvals?: { spec: boolean; signoff: boolean }
    mapBindings?: (bindings: readonly CheckBinding[]) => readonly CheckBinding[]
  } = {},
): GetStatus {
  const changes = makeChangeRepository([change])
  const schemaProvider = makeSchemaProvider(makeStdSchema())
  const refresh = {
    execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
  const registry = createWorkflowCheckRegistry({
    countTasks: new CountTasks(changes, schemaProvider),
    runStepHooks: makeRunStepHooks(),
    readyFacts: {
      changes,
      listWorkspaces: makeListWorkspaces(),
      parsers: makeNoopParsers(),
      extractorTransforms: new Map(),
      workspaceRoutes: [],
    },
    detectImplLinksInScope,
  })
  const reconcile = {
    execute: async () => ({
      change,
      verdict,
      projectionChanges: [],
      affectedArtifacts: [],
      automaticReturn: verdict.recovery,
      changed: false,
    }),
  } as unknown as ReconcileChangeValidity
  return new GetStatus(
    changes,
    schemaProvider,
    opts.approvals ?? { spec: false, signoff: false },
    refresh,
    opts.mapBindings?.(registry.transitionBindings) ?? registry.transitionBindings,
    registry.archiveBindings,
    reconcile,
  )
}

function at(name: string, states: readonly Parameters<Change['transition']>[0][]): Change {
  const change = makeChange(name)
  for (const state of states) change.transition(state, testActor)
  return change
}

const TO_DONE = ['designing', 'ready', 'implementing', 'verifying', 'done'] as const

function verdict(overrides: Partial<ChangeValidityVerdict>): ChangeValidityVerdict {
  return {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification: 'valid',
    fingerprintIssues: [],
    blockers: [],
    recovery: null,
    ...overrides,
  }
}

describe('GetStatus blocker merge by condition family', () => {
  it('reports a revoked sign-off as one blocker carrying the approve-signoff action', async () => {
    const change = at('revoked-signoff', TO_DONE)
    const uc = makeGetStatus(
      change,
      verdict({
        specApproval: 'valid',
        signoff: 'revoked',
        blockers: [{ code: 'SIGNOFF_REVOKED', message: 'Sign-off was revoked by an operator' }],
      }),
      { approvals: { spec: true, signoff: true } },
    )

    const result = await uc.execute({ name: 'revoked-signoff' })

    const consent = result.blockers.filter(
      (b) => b.code.startsWith('SIGNOFF_') || b.checkId === 'approval.signoff',
    )
    expect(consent).toHaveLength(1)
    expect(consent[0]?.checkId).toBe('approval.signoff')
    expect(consent[0]?.action?.kind).toBe('approve-signoff')
  })

  describe.each([
    ['absent', 'VERIFICATION_REQUIRED'],
    ['stale', 'VERIFICATION_STALE'],
    ['attempt-active', 'VERIFICATION_IN_PROGRESS'],
  ] as const)('signed-off change with %s verification', (verification, code) => {
    it('yields exactly one verification blocker from verification.current', async () => {
      const change = at(`signed-${verification}`, TO_DONE)
      const uc = makeGetStatus(
        change,
        verdict({
          specApproval: 'valid',
          signoff: 'valid',
          verification,
          blockers: [
            {
              code,
              message: 'Validity says verification is not current',
              action: startVerificationAction(change.name),
            },
          ],
        }),
        { approvals: { spec: true, signoff: true } },
      )

      const result = await uc.execute({ name: change.name })

      const verificationBlockers = result.blockers.filter((b) => b.code.startsWith('VERIFICATION_'))
      expect(verificationBlockers).toHaveLength(1)
      expect(verificationBlockers[0]?.checkId).toBe('verification.current')
      expect(verificationBlockers[0]?.code).toBe(code)
    })
  })

  it('keeps the approval.signoff verification failure when verification.current does not fail', async () => {
    const change = at('signoff-only-verif', TO_DONE)
    const uc = makeGetStatus(
      change,
      verdict({
        specApproval: 'valid',
        signoff: 'valid',
        verification: 'stale',
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Validity says stale' }],
      }),
      {
        approvals: { spec: true, signoff: true },
        mapBindings: (bindings) => bindings.filter((b) => b.check.id !== 'verification.current'),
      },
    )

    const result = await uc.execute({ name: 'signoff-only-verif' })

    const verificationBlockers = result.blockers.filter((b) => b.code.startsWith('VERIFICATION_'))
    expect(verificationBlockers).toHaveLength(1)
    expect(verificationBlockers[0]?.checkId).toBe('approval.signoff')
  })

  it('merges a revoked spec approval with the approval.spec failure', async () => {
    const change = at('spec-revoked', ['designing', 'ready'])
    const uc = makeGetStatus(
      change,
      verdict({
        specApproval: 'revoked',
        blockers: [{ code: 'APPROVAL_REVOKED', message: 'Validity says consent was revoked' }],
      }),
      { approvals: { spec: true, signoff: false } },
    )

    const result = await uc.execute({ name: 'spec-revoked' })

    const consent = result.blockers.filter(
      (b) => b.code.startsWith('APPROVAL_') && b.checkId !== 'approval.signoff',
    )
    expect(consent).toHaveLength(1)
    expect(consent[0]?.checkId).toBe('approval.spec')
    expect(consent[0]?.label).toBeDefined()
    expect(consent[0]?.action).toEqual({ kind: 'approve-spec' })
  })

  it('keeps stale spec consent and a failing sign-off as two blockers at done', async () => {
    const change = at('two-families', TO_DONE)
    const uc = makeGetStatus(
      change,
      verdict({
        specApproval: 'stale',
        signoff: 'stale',
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec consent is stale' }],
      }),
      { approvals: { spec: true, signoff: true } },
    )

    const result = await uc.execute({ name: 'two-families' })

    const consent = result.blockers.filter((b) => b.code.startsWith('APPROVAL_'))
    expect(consent.map((b) => [b.code, b.checkId, b.message])).toEqual([
      ['APPROVAL_STALE', 'approval.signoff', 'Signoff is stale'],
      ['APPROVAL_STALE', undefined, 'Spec consent is stale'],
    ])
  })

  it('never merges VERIFICATION_VALIDITY_UNAVAILABLE with the verification validity blocker', async () => {
    const change = at('unavailable', TO_DONE)
    const uc = makeGetStatus(
      change,
      verdict({
        specApproval: 'valid',
        signoff: 'valid',
        verification: 'stale',
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Validity says stale' }],
      }),
      {
        approvals: { spec: true, signoff: true },
        mapBindings: (bindings) =>
          bindings.map((b) =>
            b.check.id === 'verification.current'
              ? {
                  ...b,
                  check: {
                    ...b.check,
                    execute: async () =>
                      fail(
                        'verification.current',
                        'VERIFICATION_VALIDITY_UNAVAILABLE',
                        'Verification validity is unavailable',
                      ),
                  },
                }
              : b,
          ),
      },
    )

    const result = await uc.execute({ name: 'unavailable' })

    expect(result.blockers.some((b) => b.code === 'VERIFICATION_VALIDITY_UNAVAILABLE')).toBe(true)
    expect(result.blockers.some((b) => b.code === 'VERIFICATION_STALE')).toBe(true)
  })

  it('resolves a transition-origin blocker skippability from its transition binding, not the archive one', async () => {
    const change = at('origin', [...TO_DONE, 'archivable'])
    const alwaysFail = async () => fail('shared.check', 'IMPLEMENTATION_STATE', 'shared failure')
    const check = {
      id: 'shared.check',
      label: 'Checking shared',
      kind: 'predicate' as const,
      execute: alwaysFail,
    }
    const binding = (
      applicability: CheckBinding['applicability'][number],
      skippable: boolean,
    ): CheckBinding => ({
      check,
      applicability: [applicability],
      skippable,
      allowBindingOverride: true,
      allowConfigOverride: true,
    })
    const changes = makeChangeRepository([change])
    const schemaProvider = makeSchemaProvider(makeStdSchema())
    const refresh = {
      execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    } as unknown as RefreshImplementationTracking
    const reconcile = {
      execute: async () => ({
        change,
        verdict: verdict({}),
        projectionChanges: [],
        affectedArtifacts: [],
        automaticReturn: null,
        changed: false,
      }),
    } as unknown as ReconcileChangeValidity
    const uc = new GetStatus(
      changes,
      schemaProvider,
      { spec: false, signoff: false },
      refresh,
      [binding({ scope: 'transition', from: 'archivable', to: '*', along: '*' }, false)],
      [binding({ scope: 'archive' }, true)],
      reconcile,
    )

    const result = await uc.execute({ name: 'origin' })

    const matches = result.blockers.filter((b) => b.checkId === 'shared.check')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.map((b) => [b.code, b.message, b.isSkippable])).toEqual([
      ['IMPLEMENTATION_STATE', 'shared failure', false],
    ])
  })
})
