import { describe, expect, it, vi } from 'vitest'
import {
  evaluateTransitionCandidate,
  type TransitionCandidateEvaluationInput,
} from '../../../src/application/services/evaluate-transition-candidate.js'
import {
  applyBindingSpecs,
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckBinding,
  type CheckExecutionContext,
} from '../../../src/domain/services/transition-checks.js'
import {
  TRANSITION_BINDINGS,
  TRANSITION_BINDING_SPECS,
  DOMAIN_CHECKS,
} from '../../../src/domain/services/check-bindings.js'
import { makeSchema, makeWorkflowStep, testActor } from '../use-cases/helpers.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'

function makeTestChange(
  state: 'drafting' | 'designing' | 'ready' | 'implementing' | 'verifying' | 'done' = 'ready',
): Change {
  const history: ChangeEvent[] = [
    {
      type: 'created',
      at: new Date('2024-01-01T00:00:00Z'),
      by: testActor,
      specIds: ['default:auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    },
  ]
  const states: ChangeState[] = [
    'drafting',
    'designing',
    'ready',
    'implementing',
    'verifying',
    'done',
  ]
  const targetIdx = states.indexOf(state)
  for (let i = 0; i < targetIdx; i++) {
    history.push({
      type: 'transitioned',
      from: states[i]!,
      to: states[i + 1]!,
      at: new Date('2024-01-01T00:00:00Z'),
      by: testActor,
    })
  }

  return new Change({
    name: 'test-change',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['default:auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history,
  })
}

describe('evaluateTransitionCandidate', () => {
  const approvals = { spec: false, signoff: false } as const

  it('evaluates normal target predicates when no steps are bypassed', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'implementing',
      mode: 'projection',
      baseBindings: TRANSITION_BINDINGS,
    })

    expect(result.target).toBe('implementing')
    expect(result.bypassedSteps).toEqual([])
    expect(result.checks.length).toBeGreaterThan(0)
    // All normal checks pass
    expect(result.allowed).toBe(true)
    expect(result.checks.some((c) => c.id === 'protocol.edge')).toBe(true)
  })

  it('evaluates one bypassed optional step with step-skip predicates', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'verifying',
      mode: 'projection',
      baseBindings: TRANSITION_BINDINGS,
    })

    expect(result.target).toBe('verifying')
    expect(result.bypassedSteps).toEqual(['implementing'])
    // Should have target checks followed by step-skip checks
    expect(result.checks.some((c) => c.id === 'workflow.tasksEmpty')).toBe(true)
    expect(result.allowed).toBe(true)
  })

  it('fails allowed verdict when a step-skip predicate fails', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    const failingTasksEmpty: Check = {
      id: 'workflow.tasksEmpty',
      label: CHECK_LABELS['workflow.tasksEmpty'],
      kind: 'predicate',
      execute: async () =>
        fail('workflow.tasksEmpty', 'INCOMPLETE_TASKS', 'Tasks remain incomplete'),
    }

    const customDomainChecks = {
      ...DOMAIN_CHECKS,
      'workflow.tasksEmpty': failingTasksEmpty,
    }
    const bindings = applyBindingSpecs(TRANSITION_BINDING_SPECS, customDomainChecks)

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'verifying',
      mode: 'projection',
      baseBindings: bindings,
    })

    expect(result.target).toBe('verifying')
    expect(result.bypassedSteps).toEqual(['implementing'])
    expect(result.allowed).toBe(false)
    const failedCheck = result.checks.find((c) => c.id === 'workflow.tasksEmpty')
    expect(failedCheck?.outcome).toBe('fail')
  })

  it('evaluates multiple bypassed steps in pipeline order', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying', { optional: true }),
        makeWorkflowStep('done'),
      ],
    )

    const visitedScopes: string[] = []
    const customTasksEmpty: Check = {
      id: 'workflow.tasksEmpty',
      label: CHECK_LABELS['workflow.tasksEmpty'],
      kind: 'predicate',
      execute: async (ctx: CheckExecutionContext) => {
        visitedScopes.push(`${ctx.attempt.scope}:${(ctx.attempt as { step?: string }).step}`)
        return pass('workflow.tasksEmpty')
      },
    }

    const customDomainChecks = {
      ...DOMAIN_CHECKS,
      'workflow.tasksEmpty': customTasksEmpty,
    }
    const bindings = applyBindingSpecs(TRANSITION_BINDING_SPECS, customDomainChecks)

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'done',
      mode: 'projection',
      baseBindings: bindings,
    })

    expect(result.target).toBe('done')
    expect(result.bypassedSteps).toEqual(['implementing', 'verifying'])
    expect(visitedScopes).toContain('step-skip:implementing')
    expect(result.allowed).toBe(true)
  })

  it('passes when step-skip predicate set is empty for a bypassed step', async () => {
    const change = makeTestChange('implementing')
    // verifying is optional and bypassed to done; verifying has no step-skip check bindings by default
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying', { optional: true }),
        makeWorkflowStep('done'),
      ],
    )

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'done',
      mode: 'projection',
      baseBindings: TRANSITION_BINDINGS,
    })

    expect(result.target).toBe('done')
    expect(result.bypassedSteps).toEqual(['verifying'])
    // No step-skip checks for verifying; target checks pass
    expect(result.allowed).toBe(true)
  })

  it('preserves deterministic result ordering: target checks then step-skip checks in pipeline order', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'verifying',
      mode: 'projection',
      baseBindings: TRANSITION_BINDINGS,
    })

    const checkIds = result.checks.map((c) => c.id)
    const protocolEdgeIdx = checkIds.indexOf('protocol.edge')
    const tasksEmptyIdx = checkIds.indexOf('workflow.tasksEmpty')

    expect(protocolEdgeIdx).toBeGreaterThanOrEqual(0)
    expect(tasksEmptyIdx).toBeGreaterThan(protocolEdgeIdx)
  })

  it('spies on collaborators to verify candidate evaluation has NO mutation, hook execution, or persistence effects', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    const transitionSpy = vi.spyOn(change, 'transition')

    const hookPreSpy = vi.fn(async () => pass('hook.pre'))
    const hookPostSpy = vi.fn(async () => pass('hook.post'))

    const customChecks = {
      ...DOMAIN_CHECKS,
      'hook.pre': {
        id: 'hook.pre' as const,
        label: CHECK_LABELS['hook.pre'],
        kind: 'effect' as const,
        execute: hookPreSpy,
      },
      'hook.post': {
        id: 'hook.post' as const,
        label: CHECK_LABELS['hook.post'],
        kind: 'effect' as const,
        execute: hookPostSpy,
      },
    }
    const bindings = applyBindingSpecs(TRANSITION_BINDING_SPECS, customChecks)

    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'verifying',
      mode: 'projection',
      baseBindings: bindings,
    })

    expect(result.allowed).toBe(true)
    // Pure evaluator must NOT invoke aggregate mutation or hook effects
    expect(transitionSpy).not.toHaveBeenCalled()
    expect(hookPreSpy).not.toHaveBeenCalled()
    expect(hookPostSpy).not.toHaveBeenCalled()
  })

  it('fails allowed verdict when normal target check fails (e.g. invalid protocol edge)', async () => {
    const change = makeTestChange('ready')
    const schema = makeSchema(
      [],
      [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    )

    // Invalid edge: ready -> done directly (when implementing/verifying are NOT optional)
    const result = await evaluateTransitionCandidate({
      change,
      schema,
      approvals,
      target: 'done',
      mode: 'projection',
      baseBindings: TRANSITION_BINDINGS,
    })

    expect(result.target).toBe('done')
    expect(result.allowed).toBe(false)
    const edgeCheck = result.checks.find((c) => c.id === 'protocol.edge')
    expect(edgeCheck?.outcome).toBe('fail')
  })

  describe('execute-mode protocol fail-fast', () => {
    function spiedBindings(protocolOutcome: 'pass' | 'fail') {
      const protocolSpy = vi.fn(async () =>
        protocolOutcome === 'pass'
          ? pass('protocol.edge')
          : fail('protocol.edge', 'INVALID_TRANSITION', 'illegal'),
      )
      const requiresSpy = vi.fn(async () => pass('workflow.requires'))
      const protocol: Check = { ...DOMAIN_CHECKS['protocol.edge']!, execute: protocolSpy }
      const requires: Check = { ...DOMAIN_CHECKS['workflow.requires']!, execute: requiresSpy }
      const bindings = applyBindingSpecs(
        TRANSITION_BINDING_SPECS.filter(
          (spec) => spec.id === 'protocol.edge' || spec.id === 'workflow.requires',
        ),
        { 'protocol.edge': protocol, 'workflow.requires': requires },
      )
      return { bindings, protocolSpy, requiresSpy }
    }

    it('returns early without running other predicates when protocol.edge fails', async () => {
      const { bindings, protocolSpy, requiresSpy } = spiedBindings('fail')
      const result = await evaluateTransitionCandidate({
        change: makeTestChange('ready'),
        schema: makeSchema([], []),
        approvals,
        target: 'implementing',
        mode: 'execute',
        baseBindings: bindings,
      })

      expect(result.allowed).toBe(false)
      expect(result.bypassedSteps).toEqual([])
      expect(result.checks.map((c) => c.id)).toEqual(['protocol.edge'])
      expect(protocolSpy).toHaveBeenCalledOnce()
      expect(requiresSpy).not.toHaveBeenCalled()
    })

    it('runs protocol.edge once and then the remaining predicates when it passes', async () => {
      const { bindings, protocolSpy, requiresSpy } = spiedBindings('pass')
      const result = await evaluateTransitionCandidate({
        change: makeTestChange('ready'),
        schema: makeSchema([], []),
        approvals,
        target: 'implementing',
        mode: 'execute',
        baseBindings: bindings,
      })

      expect(result.allowed).toBe(true)
      expect(result.checks.map((c) => c.id)).toEqual(['protocol.edge', 'workflow.requires'])
      expect(protocolSpy).toHaveBeenCalledOnce()
      expect(requiresSpy).toHaveBeenCalledOnce()
    })

    it('projection mode still evaluates every predicate after a protocol failure', async () => {
      const { bindings, requiresSpy } = spiedBindings('fail')
      const result = await evaluateTransitionCandidate({
        change: makeTestChange('ready'),
        schema: makeSchema([], []),
        approvals,
        target: 'implementing',
        mode: 'projection',
        baseBindings: bindings,
      })

      expect(result.allowed).toBe(false)
      expect(result.checks.map((c) => c.id)).toEqual(['protocol.edge', 'workflow.requires'])
      expect(requiresSpy).toHaveBeenCalledOnce()
    })
  })
})
