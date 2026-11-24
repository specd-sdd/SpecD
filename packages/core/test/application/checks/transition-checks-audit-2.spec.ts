import { describe, expect, it, vi } from 'vitest'
import {
  buildCheckExecutionContext,
  executeMatchingPredicates,
} from '../../../src/application/services/execute-matching-predicates.js'
import {
  checkMatches,
  classifyAlong,
  fail,
  pass,
  type Check,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { TRANSITION_BINDINGS } from '../../../src/domain/services/check-bindings.js'
import { resolveWorkflowPipeline } from '../../../src/domain/services/workflow-topology.js'
import { makeChange, makeSchema, makeWorkflowStep } from '../use-cases/helpers.js'

const NO_GATES = { spec: false, signoff: false } as const
const SPEC_GATE = { spec: true, signoff: false } as const

function binding(check: Check, overrides: Partial<CheckBinding> = {}): CheckBinding {
  return {
    check,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    skippable: true,
    allowBindingOverride: true,
    allowConfigOverride: true,
    ...overrides,
  }
}

function ctxFor(from: 'implementing' | 'ready', to: 'verifying' | 'designing') {
  return buildCheckExecutionContext({
    change: makeChange('c1'),
    schema: makeSchema(),
    attempt: {
      scope: 'transition',
      from,
      to,
      along: classifyAlong(from, to, makeSchema(), NO_GATES),
    },
    approvals: NO_GATES,
  })
}

describe('transition check axis classification', () => {
  it('spec approval does not apply to redesign when the spec gate is on', () => {
    const schema = makeSchema()
    const along = classifyAlong('ready', 'designing', schema, SPEC_GATE)
    expect(along).toBe('redesign')

    const approvalSpec = TRANSITION_BINDINGS.find((entry) => entry.check.id === 'approval.spec')
    expect(approvalSpec).toBeDefined()
    const attempt = { scope: 'transition', from: 'ready', to: 'designing', along } as const
    expect(approvalSpec!.applicability.some((rule) => checkMatches(rule, attempt))).toBe(false)
    // The same binding does apply to the forward exit from ready.
    const forward = {
      scope: 'transition',
      from: 'ready',
      to: 'implementing',
      along: classifyAlong('ready', 'implementing', schema, SPEC_GATE),
    } as const
    expect(approvalSpec!.applicability.some((rule) => checkMatches(rule, forward))).toBe(true)
  })

  it('classifies archiving to archivable as recovery, never backward', () => {
    expect(classifyAlong('archiving', 'archivable', makeSchema(), NO_GATES)).toBe('recovery')
    expect(classifyAlong('archiving', 'archivable', makeSchema(), SPEC_GATE)).not.toBe('backward')
  })

  it('excludes a disabled verifying step from the progress axis', () => {
    const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
    expect(classifyAlong('implementing', 'done', schema, NO_GATES)).toBe('forward')
    const steps = resolveWorkflowPipeline(schema, NO_GATES).map((entry) => entry.step)
    expect(steps).not.toContain('verifying')
    expect(steps).toContain('implementing')
    expect(steps).toContain('done')
  })

  it('keeps verifying to implementing backward when workflow omits implementing', () => {
    const schema = makeSchema([], [makeWorkflowStep('designing'), makeWorkflowStep('verifying')])
    expect(classifyAlong('verifying', 'implementing', schema, NO_GATES)).toBe('backward')
  })

  it('keeps ready to implementing forward when workflow lists designing, implementing, verifying only', () => {
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('designing'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
      ],
    )
    expect(classifyAlong('ready', 'implementing', schema, NO_GATES)).toBe('forward')
  })

  it('derives direction from the authoritative pipeline, whatever the declared row order', () => {
    const scrambled = makeSchema(
      [],
      [
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('designing'),
      ],
    )
    const pipeline = resolveWorkflowPipeline(scrambled, SPEC_GATE).map((entry) => entry.step)
    const pairs = [
      ['implementing', 'verifying', 'forward'],
      ['verifying', 'implementing', 'backward'],
      ['implementing', 'done', 'forward'],
      ['done', 'implementing', 'backward'],
    ] as const
    for (const [from, to, expected] of pairs) {
      // Pipeline order is the canonical axis, not the declared row order.
      expect(pipeline.indexOf(from) < pipeline.indexOf(to)).toBe(expected === 'forward')
      expect(classifyAlong(from, to, scrambled, SPEC_GATE)).toBe(expected)
    }
  })
})

describe('custom check config isolation', () => {
  it('hands each executing check only its own effective config', async () => {
    const seen: Record<string, unknown> = {}
    const makeCheck = (id: string): Check => ({
      id,
      label: id,
      kind: 'predicate',
      execute: async (ctx) => {
        seen[id] = ctx.config
        return pass(id, 'predicate', id)
      },
    })
    const a = makeCheck('@acme.a')
    const b = makeCheck('@acme.b')

    const result = await executeMatchingPredicates(
      [
        binding(a, { config: { severity: 'high' }, effectiveConfig: { severity: 'high' } }),
        binding(b, {
          config: { severity: 'low', extra: 1 },
          effectiveConfig: { severity: 'low', extra: 1 },
        }),
      ],
      ctxFor('implementing', 'verifying'),
    )

    expect(result.allowed).toBe(true)
    expect(seen['@acme.a']).toEqual({ severity: 'high' })
    expect(seen['@acme.b']).toEqual({ severity: 'low', extra: 1 })
  })

  it('merges only binding config for an unresolved binding and does not leak it to other checks', async () => {
    const seen: unknown[] = []
    const withConfig: Check = {
      id: '@acme.cfg',
      label: 'cfg',
      kind: 'predicate',
      execute: async (ctx) => {
        seen.push(ctx.config)
        return pass('@acme.cfg', 'predicate', 'cfg')
      },
    }
    const withoutConfig: Check = {
      id: '@acme.plain',
      label: 'plain',
      kind: 'predicate',
      execute: async (ctx) => {
        seen.push(ctx.config)
        return pass('@acme.plain', 'predicate', 'plain')
      },
    }

    await executeMatchingPredicates(
      [binding(withConfig, { config: { severity: 'high' } }), binding(withoutConfig)],
      ctxFor('implementing', 'verifying'),
    )

    expect(seen[0]).toEqual({ severity: 'high' })
    expect(seen[1]).toEqual({})
  })
})

describe('status allowed ignores effects', () => {
  it('does not run matching effects and does not let a failing effect block allowed', async () => {
    const effectExecute = vi.fn(async () => fail('hook.post', 'HOOK_FAILED', 'post hook failed'))
    const effect: Check = {
      id: 'hook.post',
      label: 'post hook',
      kind: 'effect',
      execute: effectExecute,
    }
    const predicate: Check = {
      id: '@acme.ok',
      label: 'ok',
      kind: 'predicate',
      execute: async () => pass('@acme.ok', 'predicate', 'ok'),
    }

    const result = await executeMatchingPredicates(
      [binding(effect, { phase: 'after-persist', onFailure: 'collect' }), binding(predicate)],
      ctxFor('implementing', 'verifying'),
    )

    expect(effectExecute).not.toHaveBeenCalled()
    expect(result.allowed).toBe(true)
    expect(result.checks.map((entry) => entry.id)).toEqual(['@acme.ok'])
  })
})
