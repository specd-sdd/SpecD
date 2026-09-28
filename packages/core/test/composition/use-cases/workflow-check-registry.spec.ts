import { describe, expect, it } from 'vitest'
import { resolveWorkflowCheckRegistry } from '../../../src/composition/use-cases/workflow-check-registry.js'
import { resolveGetStatusDeps } from '../../../src/composition/use-cases/get-status.js'
import { type CompositionResolver } from '../../../src/composition/composition-resolver.js'
import { Change } from '../../../src/domain/entities/change.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { type CheckExecutionContext } from '../../../src/domain/services/transition-checks.js'
import {
  makeChangeRepository,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeSchema,
  makeSchemaProvider,
  testActor,
} from '../../application/use-cases/helpers.js'

function makeChange(name: string, specIds: readonly string[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: [...specIds],
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: testActor,
        specIds: [...specIds],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
}

function makeResolver(changes: Change[]): CompositionResolver {
  const repo = makeChangeRepository(changes)
  return {
    getChangeRepository: () => repo,
    getSchemaProvider: () => makeSchemaProvider(makeSchema()),
    getListWorkspaces: () => makeListWorkspaces(),
    getArtifactParserRegistry: () => makeNoopParsers(),
    getExtractorTransforms: () => new Map(),
    getSpecWorkspaceRoutes: () => [],
    getRunStepHooks: () => makeRunStepHooks(),
    getContentHasher: () => ({ hash: () => 'sha256:test' }),
  } as unknown as CompositionResolver
}

function archiveCtx(change: Change): CheckExecutionContext {
  return {
    change,
    schema: makeSchema(),
    attempt: { scope: 'archive' },
    approvals: { spec: false, signoff: false },
    allowOverlap: false,
    allowOutOfScope: false,
    effectiveStatusByArtifact: new Map(),
  }
}

describe('resolveWorkflowCheckRegistry', () => {
  it('keeps overlap detection in production GetStatus archive bindings', async () => {
    const alpha = makeChange('alpha', ['core:core/config'])
    const beta = makeChange('beta', ['core:core/config'])
    const resolver = makeResolver([alpha, beta])
    Object.assign(resolver, {
      config: { approvals: { spec: false, signoff: false } },
      getRefreshImplementationTracking: () => ({ execute: async () => undefined }),
      getReconcileChangeValidity: () => ({ execute: async () => undefined }),
    })

    const deps = resolveGetStatusDeps(resolver)
    const overlap = deps.archiveBindings.find((binding) => binding.check.id === 'spec.overlap')
    expect(overlap).toBeDefined()
    await expect(overlap!.check.execute(archiveCtx(alpha))).resolves.toMatchObject({
      outcome: 'fail',
    })
  })

  it('wires spec.overlap peers when includeOverlapDetection is true', async () => {
    const alpha = makeChange('alpha', ['core:core/config'])
    const beta = makeChange('beta', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([alpha, beta]), {
      includeOverlapDetection: true,
    })
    const overlap = registry.archiveBindings.find((binding) => binding.check.id === 'spec.overlap')
    expect(overlap).toBeDefined()

    const result = await overlap!.check.execute(archiveCtx(alpha))

    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toContain('beta (core:core/config)')
    expect(result.details).toMatchObject({
      peers: [{ changeName: 'beta', overlappingSpecIds: ['core:core/config'] }],
    })
  })

  it('does not block overlap when includeOverlapDetection is omitted', async () => {
    const alpha = makeChange('alpha', ['core:core/config'])
    const beta = makeChange('beta', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([alpha, beta]))
    const overlap = registry.archiveBindings.find((binding) => binding.check.id === 'spec.overlap')
    expect(overlap).toBeDefined()

    const result = await overlap!.check.execute(archiveCtx(alpha))

    expect(result.outcome).toBe('pass')
  })

  it('binds verification.current only on verifying to done and reuses it for archive', () => {
    const registry = resolveWorkflowCheckRegistry(makeResolver([]))
    const transitionRows = registry.transitionBindings.filter(
      (binding) => binding.check.id === 'verification.current',
    )
    expect(transitionRows).toHaveLength(1)
    expect(transitionRows[0]?.applicability).toEqual([
      { scope: 'transition', from: 'verifying', to: 'done', along: 'forward' },
    ])
    expect(
      registry.archiveBindings.some((binding) => binding.check.id === 'verification.current'),
    ).toBe(true)
    expect(
      registry.transitionBindings.some(
        (binding) =>
          binding.check.id === 'verification.current' &&
          binding.applicability.some((row) => row.scope === 'transition' && row.to !== 'done'),
      ),
    ).toBe(false)
  })

  it('binds implementation readiness to exit, entry, operation, and archive boundaries', () => {
    const registry = resolveWorkflowCheckRegistry(makeResolver([]))
    for (const id of ['impl.filesResolved', 'impl.linksInScope'] as const) {
      const transition = registry.transitionBindings.find((binding) => binding.check.id === id)
      expect(transition?.applicability).toEqual([
        { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
        { scope: 'transition', from: '*', to: 'verifying', along: '*' },
        { scope: 'operation', operation: 'verification-start' },
      ])
      expect(registry.archiveBindings.some((binding) => binding.check.id === id)).toBe(true)
    }
  })

  it('reuses a stale verdict in sign-off and archive verification checks', async () => {
    const change = makeChange('alpha', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([change]))
    const stale: ChangeValidityVerdict = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required',
      signoff: 'stale',
      verification: 'stale',
      blockers: [],
      recovery: null,
    }
    const signoff = registry.transitionBindings.find(
      (binding) => binding.check.id === 'approval.signoff',
    )
    const verification = registry.archiveBindings.find(
      (binding) => binding.check.id === 'verification.current',
    )
    const base = archiveCtx(change)
    await expect(
      signoff!.check.execute({
        ...base,
        approvals: { spec: false, signoff: true },
        validity: stale,
      }),
    ).resolves.toMatchObject({ outcome: 'fail', code: 'APPROVAL_STALE' })
    await expect(verification!.check.execute({ ...base, validity: stale })).resolves.toMatchObject({
      outcome: 'fail',
      code: 'VERIFICATION_STALE',
    })
  })

  it('skips approval predicates when the gates are disabled', async () => {
    const change = makeChange('alpha', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([change]))
    const spec = registry.transitionBindings.find((binding) => binding.check.id === 'approval.spec')
    const signoff = registry.transitionBindings.find(
      (binding) => binding.check.id === 'approval.signoff',
    )
    const ctx = archiveCtx(change)
    await expect(spec!.check.execute(ctx)).resolves.toMatchObject({ outcome: 'skip' })
    await expect(signoff!.check.execute(ctx)).resolves.toMatchObject({ outcome: 'skip' })
  })

  it('fails hook.post when the hook runner reports a mismatch', async () => {
    const change = makeChange('alpha', ['core:core/config'])
    const resolver = makeResolver([change])
    Object.assign(resolver, {
      getRunStepHooks: () =>
        makeRunStepHooks({
          execute: async () => ({
            success: false,
            hooks: [
              {
                id: 'summarise',
                command: 'echo drift',
                success: false,
                exitCode: 1,
                stdout: '',
                stderr: 'drift',
              },
            ],
            failedHooks: [
              {
                id: 'summarise',
                command: 'echo drift',
                success: false,
                exitCode: 1,
                stdout: '',
                stderr: 'drift',
              },
            ],
          }),
        }),
    })
    const registry = resolveWorkflowCheckRegistry(resolver)
    const hook = registry.archiveBindings.find((binding) => binding.check.id === 'hook.post')
    const result = await hook!.check.execute(archiveCtx(change))
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('HOOK_FAILED')
    expect(result.message).toContain('echo drift')
  })
})
