import { describe, expect, it, vi } from 'vitest'
import {
  executeMatchingPredicates,
  buildCheckExecutionContext,
} from '../../../src/application/services/execute-matching-predicates.js'
import {
  CHECK_LABELS,
  fail,
  resolveEffectiveBindings,
  type Check,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { Change } from '../../../src/domain/entities/change.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { makeSchema, testActor } from '../use-cases/helpers.js'

function makeChange(): Change {
  return new Change({
    name: 'c',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['default:auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: testActor,
        specIds: ['default:auth/login'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
}

function makeFailingCheck(id: 'protocol.edge' | 'workflow.requires'): Check {
  return {
    id,
    label: CHECK_LABELS[id],
    kind: 'predicate',
    execute: async () => fail(id, 'CHECK_FAILED', `${id} failed`),
  }
}

function makeBinding(
  check: Check,
  applicability: CheckBinding['applicability'],
  overrides?: Partial<CheckBinding>,
): CheckBinding {
  return {
    check,
    applicability,
    skippable: true,
    allowBindingOverride: true,
    allowConfigOverride: true,
    ...overrides,
  }
}

describe('executeMatchingPredicates', () => {
  it('executes one stable check ID once when exit and entry bindings overlap', async () => {
    const execute = vi.fn(async () => ({
      id: 'impl.filesResolved' as const,
      label: CHECK_LABELS['impl.filesResolved'],
      kind: 'predicate' as const,
      outcome: 'pass' as const,
    }))
    const check: Check = {
      id: 'impl.filesResolved',
      label: CHECK_LABELS['impl.filesResolved'],
      kind: 'predicate',
      execute,
    }
    const bindings: CheckBinding[] = [
      makeBinding(check, [
        { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
      ]),
      makeBinding(check, [{ scope: 'transition', from: '*', to: 'verifying', along: '*' }]),
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx)

    expect(execute).toHaveBeenCalledOnce()
    expect(result.checks.map((entry) => entry.id)).toEqual(['impl.filesResolved'])
  })

  it('collects every matching fail when failFastOn is omitted (GetStatus path)', async () => {
    const later = vi.fn(async () =>
      fail('workflow.requires', 'CHECK_FAILED', 'workflow.requires failed'),
    )
    const bindings: CheckBinding[] = [
      makeBinding(makeFailingCheck('protocol.edge'), [
        { scope: 'transition', from: '*', to: '*', along: '*' },
      ]),
      makeBinding(
        {
          id: 'workflow.requires',
          label: CHECK_LABELS['workflow.requires'],
          kind: 'predicate',
          execute: later,
        },
        [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      ),
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx)

    expect(later).toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['protocol.edge', 'workflow.requires'])
  })

  it('stops after protocol.edge fail when failFastOn is protocol.edge (TransitionChange path)', async () => {
    const later = vi.fn(async () =>
      fail('workflow.requires', 'CHECK_FAILED', 'workflow.requires failed'),
    )
    const bindings: CheckBinding[] = [
      makeBinding(makeFailingCheck('protocol.edge'), [
        { scope: 'transition', from: '*', to: '*', along: '*' },
      ]),
      makeBinding(
        {
          id: 'workflow.requires',
          label: CHECK_LABELS['workflow.requires'],
          kind: 'predicate',
          execute: later,
        },
        [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      ),
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx, { failFastOn: 'protocol.edge' })

    expect(later).not.toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['protocol.edge'])
  })

  it('stops after schema.nameMatch fail when failFastOn is schema.nameMatch (ArchiveChange path)', async () => {
    const later = vi.fn(async () =>
      fail('archive.archivable', 'CHECK_FAILED', 'archive.archivable failed'),
    )
    const bindings: CheckBinding[] = [
      makeBinding(
        {
          id: 'schema.nameMatch',
          label: CHECK_LABELS['schema.nameMatch'],
          kind: 'predicate',
          execute: async () => fail('schema.nameMatch', 'CHECK_FAILED', 'schema.nameMatch failed'),
        },
        [{ scope: 'archive' }],
      ),
      makeBinding(
        {
          id: 'archive.archivable',
          label: CHECK_LABELS['archive.archivable'],
          kind: 'predicate',
          execute: later,
        },
        [{ scope: 'archive' }],
      ),
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'archive' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx, {
      failFastOn: 'schema.nameMatch',
    })

    expect(later).not.toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['schema.nameMatch'])
  })

  it('passes the reconciled validity snapshot to checks', async () => {
    const seen: unknown[] = []
    const validity = {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'valid' as const,
      signoff: 'not-required' as const,
      verification: 'not-required' as const,
      blockers: [],
      recovery: null,
    }
    const bindings: CheckBinding[] = [
      makeBinding(
        {
          id: 'protocol.edge',
          label: CHECK_LABELS['protocol.edge'],
          kind: 'predicate',
          execute: async (ctx) => {
            seen.push(ctx.validity)
            return fail('protocol.edge', 'CHECK_FAILED', 'seen')
          },
        },
        [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      ),
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
      validity,
    })
    await executeMatchingPredicates(bindings, ctx)
    expect(seen).toEqual([validity])
  })

  it('cascades and deep-merges configuration across check-default, binding, and schema step levels', async () => {
    let capturedConfig: Record<string, unknown> | undefined
    const checkId = '@qa.matrix'
    const customCheck: Check = {
      id: checkId,
      label: 'Matrix Check',
      kind: 'predicate',
      execute: async (ctx) => {
        capturedConfig = ctx.config
        return {
          id: checkId,
          label: 'Matrix Check',
          kind: 'predicate',
          outcome: 'pass',
        }
      },
    }

    const registry = new CheckRegistry()
    registry.register(
      'qa',
      {
        id: 'matrix',
        label: 'Matrix Check',
        execute: async () => ({ id: checkId, label: 'Matrix', kind: 'predicate', outcome: 'pass' }),
      },
      undefined,
      {
        defaultConfig: {
          concurrency: 2,
          tags: { smoke: true, performance: false },
          timeout: 5000,
        },
      },
    )

    const binding = makeBinding(
      customCheck,
      [{ scope: 'transition', from: 'designing', to: 'ready', along: 'forward' }],
      {
        config: {
          timeout: 10000, // Overrides check default
          tags: { performance: true, regression: true }, // Deep-merged with check default
        },
      },
    )

    const schema = makeSchema({
      workflow: [
        {
          step: 'ready',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [
            {
              id: checkId,
              config: {
                timeout: 15000, // Overrides binding config
                retries: 3, // Newly added at schema step level
              },
            },
          ],
        },
      ],
    })

    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema,
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
      checkRegistry: registry,
    })

    const resolved = resolveEffectiveBindings({
      baseBindings: [binding],
      schema,
      targetStep: 'ready',
      from: 'designing',
      along: 'forward',
      registry,
    })
    const result = await executeMatchingPredicates(resolved, ctx, { checkRegistry: registry })

    expect(result.allowed).toBe(true)
    expect(capturedConfig).toEqual({
      concurrency: 2, // From check-level defaultConfig
      tags: { smoke: true, performance: true, regression: true }, // Deep merged across check & binding
      timeout: 15000, // Overridden by schema step level
      retries: 3, // From schema step level
    })
  })

  it('supports check self-discard returning outcome: skip without bypassedByUser flag', async () => {
    const checkId = '@env.cloud-only'
    const selfDiscardCheck: Check = {
      id: checkId,
      label: 'Cloud-Only Verification',
      kind: 'predicate',
      execute: async () => ({
        id: checkId,
        label: 'Cloud-Only Verification',
        kind: 'predicate',
        outcome: 'skip',
        message: 'Local runner detected; self-discarding check',
      }),
    }

    const binding = makeBinding(selfDiscardCheck, [
      { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
    ])

    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates([binding], ctx)

    // Self-discard allows transition because it didn't return 'fail'
    expect(result.allowed).toBe(true)
    expect(result.checks).toHaveLength(1)
    const checkResult = result.checks[0]!
    expect(checkResult.outcome).toBe('skip')
    expect(checkResult.message).toBe('Local runner detected; self-discarding check')
    // bypassedByUser must NOT be set because the orchestrator didn't bypass it; it self-discarded
    expect(checkResult.details?.bypassedByUser).toBeUndefined()
  })

  it('omits checks declared with disabled: true on the target workflow step from execution', async () => {
    let executed = false
    const checkId = '@qa.optional-check'
    const optionalCheck: Check = {
      id: checkId,
      label: 'Optional QA Check',
      kind: 'predicate',
      execute: async () => {
        executed = true
        return {
          id: checkId,
          label: 'Optional QA Check',
          kind: 'predicate',
          outcome: 'fail', // Would fail if executed
        }
      },
    }

    const binding = makeBinding(optionalCheck, [
      { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
    ])

    const schemaWithDisabledCheck = makeSchema({
      workflow: [
        {
          step: 'verifying',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [
            {
              id: checkId,
              disabled: true, // Disabled in schema
            },
          ],
        },
      ],
    })

    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: schemaWithDisabledCheck,
      attempt: { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const resolved = resolveEffectiveBindings({
      baseBindings: [binding],
      schema: schemaWithDisabledCheck,
      targetStep: 'verifying',
      from: 'implementing',
      along: 'forward',
    })
    const result = await executeMatchingPredicates(resolved, ctx)

    // Check should NOT have been executed
    expect(executed).toBe(false)
    expect(result.allowed).toBe(true)
    expect(result.checks).toHaveLength(0)
  })

  describe('single-pass config cascade', () => {
    function arrayCheck(
      id: string,
      capture: (config: Record<string, unknown> | undefined) => void,
    ) {
      const check: Check = {
        id,
        label: 'Array Check',
        kind: 'predicate',
        execute: async (ctx) => {
          capture(ctx.config)
          return { id, label: 'Array Check', kind: 'predicate', outcome: 'pass' }
        },
      }
      return check
    }

    it('concatenates arrays exactly once through resolveEffectiveBindings and the executor', async () => {
      let captured: Record<string, unknown> | undefined
      const registry = new CheckRegistry()
      registry.register(
        'qa',
        {
          id: 'arrays',
          label: 'Array Check',
          execute: async () => ({
            id: '@qa.arrays',
            label: 'x',
            kind: 'predicate',
            outcome: 'pass',
          }),
        },
        undefined,
        { defaultConfig: { tags: ['default'] } },
      )
      const check = arrayCheck('@qa.arrays', (config) => {
        captured = config
      })
      const binding = makeBinding(
        check,
        [{ scope: 'transition', from: 'designing', to: 'ready', along: 'forward' }],
        { config: { tags: ['a'] } },
      )
      const schema = makeSchema({
        workflow: [
          {
            step: 'ready',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            checks: [{ id: '@qa.arrays', config: { tags: ['b'] } }],
          },
        ],
      })
      const ctx = buildCheckExecutionContext({
        change: makeChange(),
        schema,
        attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
        approvals: { spec: false, signoff: false },
        checkRegistry: registry,
      })
      const resolved = resolveEffectiveBindings({
        baseBindings: [binding],
        schema,
        targetStep: 'ready',
        from: 'designing',
        along: 'forward',
        registry,
      })

      await executeMatchingPredicates(resolved, ctx, { checkRegistry: registry })

      expect(captured).toEqual({ tags: ['default', 'a', 'b'] })
    })

    it('merges check default and binding config once for unresolved bindings', async () => {
      let captured: Record<string, unknown> | undefined
      const registry = new CheckRegistry()
      registry.register(
        'qa',
        {
          id: 'plain',
          label: 'Plain',
          execute: async () => ({
            id: '@qa.plain',
            label: 'x',
            kind: 'predicate',
            outcome: 'pass',
          }),
        },
        undefined,
        { defaultConfig: { tags: ['default'] } },
      )
      const check = arrayCheck('@qa.plain', (config) => {
        captured = config
      })
      const binding = makeBinding(
        check,
        [{ scope: 'transition', from: 'designing', to: 'ready', along: 'forward' }],
        { config: { tags: ['a'] } },
      )
      const ctx = buildCheckExecutionContext({
        change: makeChange(),
        schema: makeSchema(),
        attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
        approvals: { spec: false, signoff: false },
        checkRegistry: registry,
      })

      await executeMatchingPredicates([binding], ctx, { checkRegistry: registry })

      expect(captured).toEqual({ tags: ['default', 'a'] })
    })
  })

  describe('step-declared checks honor from and along', () => {
    function setup(
      decl: { from?: 'designing' | 'implementing' | '*'; along?: 'forward' | 'any' },
      attempt: 'forward' | 'redesign',
    ) {
      const execute = vi.fn(async () => ({
        id: '@qa.step' as const,
        label: 'Step',
        kind: 'predicate' as const,
        outcome: 'pass' as const,
      }))
      const registry = new CheckRegistry()
      registry.register('qa', {
        id: 'step',
        label: 'Step',
        execute,
      })
      const schema = makeSchema({
        workflow: [
          {
            step: 'ready',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            checks: [{ id: '@qa.step', ...decl }],
          },
        ],
      })
      const ctx = buildCheckExecutionContext({
        change: makeChange(),
        schema,
        attempt: { scope: 'transition', from: 'designing', to: 'ready', along: attempt },
        approvals: { spec: false, signoff: false },
        checkRegistry: registry,
      })
      const run = () =>
        executeMatchingPredicates(
          resolveEffectiveBindings({
            baseBindings: [],
            schema,
            targetStep: 'ready',
            from: 'designing',
            along: attempt,
            registry,
          }),
          ctx,
          { checkRegistry: registry },
        )
      return { execute, ctx, registry, run }
    }

    it('runs by default only on forward hops', async () => {
      const forward = setup({}, 'forward')
      await forward.run()
      expect(forward.execute).toHaveBeenCalledOnce()

      const redesign = setup({}, 'redesign')
      await redesign.run()
      expect(redesign.execute).not.toHaveBeenCalled()
    })

    it('skips declarations whose from does not match the source state', async () => {
      const { execute, run } = setup({ from: 'implementing' }, 'forward')
      await run()
      expect(execute).not.toHaveBeenCalled()
    })

    it('runs declarations with an explicit matching from and along any', async () => {
      const { execute, run } = setup({ from: 'designing', along: 'any' }, 'redesign')
      await run()
      expect(execute).toHaveBeenCalledOnce()
    })

    it('does not execute step declarations when the runner receives no resolved bindings', async () => {
      const { execute, ctx, registry } = setup({}, 'forward')
      const result = await executeMatchingPredicates([], ctx, { checkRegistry: registry })
      expect(execute).not.toHaveBeenCalled()
      expect(result.checks).toHaveLength(0)
    })
  })
  it('emits check-done with a skip outcome when the user bypasses a check', async () => {
    const execute = vi.fn()
    const check: Check = {
      id: '@qa.bypassed',
      label: 'Bypassed',
      kind: 'predicate',
      execute,
    }
    const binding = makeBinding(check, [
      { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
    ])
    const events: unknown[] = []
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
      skipChecks: ['@qa.bypassed'],
      onCheckProgress: (event) => events.push(event),
    })

    const result = await executeMatchingPredicates([binding], ctx)

    expect(execute).not.toHaveBeenCalled()
    expect(result.checks[0]).toMatchObject({ outcome: 'skip', details: { bypassedByUser: true } })
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'check-done', id: '@qa.bypassed', outcome: 'skip' }),
    )
  })
})
