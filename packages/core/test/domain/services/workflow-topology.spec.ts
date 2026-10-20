import { describe, expect, it } from 'vitest'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import {
  isWorkflowStepEnabled,
  isWorkflowTransitionLegal,
  listBypassedWorkflowSteps,
  listWorkflowTransitions,
  nextWorkflowStep,
  resolveWorkflowPipeline,
} from '../../../src/domain/services/workflow-topology.js'
import * as topology from '../../../src/domain/services/workflow-topology.js'
import {
  VALID_TRANSITIONS,
  type ChangeState,
} from '../../../src/domain/value-objects/change-state.js'
import { makeSchema, makeWorkflowStep } from '../../application/use-cases/helpers.js'

const approvals = { spec: false, signoff: false } as const

describe('workflow-topology', () => {
  describe('orderedPipeline', () => {
    it('returns canonical pipeline when no workflow steps are declared', () => {
      const schema = makeSchema([], [])
      const pipeline = resolveWorkflowPipeline(schema, approvals)

      expect(pipeline.map((p) => p.step)).toEqual([
        'drafting',
        'designing',
        'ready',
        'implementing',
        'verifying',
        'done',
        'archivable',
        'archiving',
      ])
      expect(pipeline.every((p) => !p.disabled && !p.optional)).toBe(true)
    })

    it('preserves optional flags declared in schema', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { optional: true })])
      const pipeline = resolveWorkflowPipeline(schema, approvals)

      const implStep = pipeline.find((p) => p.step === 'implementing')
      expect(implStep).toBeDefined()
      expect(implStep?.optional).toBe(true)
      expect(implStep?.disabled).toBe(false)
    })

    it('excludes disabled steps from the active pipeline', () => {
      const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
      const pipeline = resolveWorkflowPipeline(schema, approvals)

      expect(pipeline.map((p) => p.step)).toEqual([
        'drafting',
        'designing',
        'ready',
        'implementing',
        'done',
        'archivable',
        'archiving',
      ])
      expect(pipeline.find((p) => p.step === 'verifying')).toBeUndefined()
    })

    it('normalizes explicitly declared bedrock states to canonical positions', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('archiving'),
          makeWorkflowStep('designing'),
          makeWorkflowStep('drafting'),
          makeWorkflowStep('archivable'),
        ],
      )

      const pipeline = resolveWorkflowPipeline(schema, approvals)

      expect(pipeline.map((step) => step.step)).toEqual([
        'drafting',
        'designing',
        'ready',
        'implementing',
        'verifying',
        'done',
        'archivable',
        'archiving',
      ])
      expect(nextWorkflowStep('designing', schema, approvals)).toBe('ready')
    })

    it('normalizes shuffled workflow rows to canonical order silently', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('verifying'),
          makeWorkflowStep('ready'),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('done'),
        ],
      )

      const pipeline = resolveWorkflowPipeline(schema, approvals)

      expect(pipeline.map((step) => step.step)).toEqual([
        'drafting',
        'designing',
        'ready',
        'implementing',
        'verifying',
        'done',
        'archivable',
        'archiving',
      ])
      expect(nextWorkflowStep('designing', schema, approvals)).toBe('ready')
    })

    it('reordered rows cannot reach verifying or done early', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('verifying'),
          makeWorkflowStep('implementing'),
          makeWorkflowStep('ready'),
        ],
      )

      expect(listWorkflowTransitions('designing', schema, approvals)).toEqual([
        'ready',
        'designing',
      ])
      expect(listWorkflowTransitions('ready', schema, approvals)).not.toContain('verifying')
      expect(isWorkflowTransitionLegal('designing', 'done', schema, approvals)).toBe(false)
    })

    it('stays connected when every delivery step is disabled', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('ready', { disabled: true }),
          makeWorkflowStep('implementing', { disabled: true }),
          makeWorkflowStep('verifying', { disabled: true }),
        ],
      )

      expect(resolveWorkflowPipeline(schema, approvals).map((s) => s.step)).toEqual([
        'drafting',
        'designing',
        'done',
        'archivable',
        'archiving',
      ])
      expect(nextWorkflowStep('designing', schema, approvals)).toBe('done')
      expect(listWorkflowTransitions('designing', schema, approvals)).toEqual(['done', 'designing'])
    })

    it('throws SchemaValidationError when a bedrock state is declared disabled', () => {
      for (const bedrock of ['drafting', 'designing', 'done', 'archivable', 'archiving'] as const) {
        const schema = makeSchema([], [makeWorkflowStep(bedrock, { disabled: true })])
        expect(() => resolveWorkflowPipeline(schema, approvals)).toThrow(SchemaValidationError)
      }
    })

    it('throws SchemaValidationError when a bedrock state is declared optional', () => {
      for (const bedrock of ['drafting', 'designing', 'done', 'archivable', 'archiving'] as const) {
        const schema = makeSchema([], [makeWorkflowStep(bedrock, { optional: true })])
        expect(() => resolveWorkflowPipeline(schema, approvals)).toThrow(SchemaValidationError)
      }
    })

    it('throws SchemaValidationError when ready is disabled and spec approval is required', () => {
      const schema = makeSchema([], [makeWorkflowStep('ready', { disabled: true })])
      expect(() => resolveWorkflowPipeline(schema, { spec: true, signoff: false })).toThrow(
        SchemaValidationError,
      )
    })

    it('throws SchemaValidationError when done is declared disabled with signoff on or off', () => {
      for (const signoff of [false, true]) {
        const schema = makeSchema([], [makeWorkflowStep('done', { disabled: true })])
        expect(() => resolveWorkflowPipeline(schema, { spec: false, signoff })).toThrow(
          SchemaValidationError,
        )
      }
    })

    it('throws SchemaValidationError when done is declared optional with signoff on or off', () => {
      for (const signoff of [false, true]) {
        const schema = makeSchema([], [makeWorkflowStep('done', { optional: true })])
        expect(() => resolveWorkflowPipeline(schema, { spec: false, signoff })).toThrow(
          SchemaValidationError,
        )
      }
    })

    it('always preserves canonical tail done -> archivable -> archiving order', () => {
      const schema = makeSchema([], [makeWorkflowStep('ready'), makeWorkflowStep('implementing')])
      const pipeline = resolveWorkflowPipeline(schema, { spec: false, signoff: false })
      const steps = pipeline.map((p) => p.step)
      expect(steps.slice(-3)).toEqual(['done', 'archivable', 'archiving'])
    })
  })

  describe('isStepEnabled', () => {
    it('always returns true for bedrock states even if somehow marked disabled in raw steps', () => {
      const schema = makeSchema([], [])
      expect(isWorkflowStepEnabled('drafting', schema)).toBe(true)
      expect(isWorkflowStepEnabled('designing', schema)).toBe(true)
      expect(isWorkflowStepEnabled('done', schema)).toBe(true)
      expect(isWorkflowStepEnabled('archivable', schema)).toBe(true)
      expect(isWorkflowStepEnabled('archiving', schema)).toBe(true)
    })

    it('returns false when step is declared disabled in schema', () => {
      const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
      expect(isWorkflowStepEnabled('verifying', schema)).toBe(false)
      expect(isWorkflowStepEnabled('implementing', schema)).toBe(true)
    })

    it('returns true when step is not declared in schema', () => {
      const schema = makeSchema([], [])
      expect(isWorkflowStepEnabled('implementing', schema)).toBe(true)
    })
  })

  describe('legalTransitions & isLegalTransition', () => {
    it('returns standard legal transitions for default pipeline', () => {
      const schema = makeSchema([], [])
      const transitions = listWorkflowTransitions('implementing', schema, approvals)

      expect(transitions).toContain('verifying')
      expect(transitions).toContain('designing')
      expect(isWorkflowTransitionLegal('implementing', 'verifying', schema, approvals)).toBe(true)
      expect(isWorkflowTransitionLegal('implementing', 'done', schema, approvals)).toBe(false)
      expect(transitions).not.toContain('drafting')
    })

    it('allows shortcutting over optional steps', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { optional: true })])
      const transitions = listWorkflowTransitions('ready', schema, approvals)

      // Can go to implementing (immediate) or shortcut to verifying
      expect(transitions).toContain('implementing')
      expect(transitions).toContain('verifying')
      expect(isWorkflowTransitionLegal('ready', 'verifying', schema, approvals)).toBe(true)
    })

    it('allows shortcutting over disabled steps', () => {
      const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
      const transitions = listWorkflowTransitions('implementing', schema, approvals)

      expect(transitions).toContain('done')
      expect(transitions).not.toContain('verifying')
      expect(isWorkflowTransitionLegal('implementing', 'done', schema, approvals)).toBe(true)
      expect(isWorkflowTransitionLegal('implementing', 'verifying', schema, approvals)).toBe(false)
    })

    it('returns empty transitions if from state is disabled', () => {
      const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
      const transitions = listWorkflowTransitions('verifying', schema, approvals)
      expect(transitions).toEqual([])
    })

    it('enforces approval anchors through every legal-transition query', () => {
      const schema = makeSchema([], [makeWorkflowStep('ready', { disabled: true })])
      const gatedApprovals = { spec: true, signoff: false } as const

      expect(() => listWorkflowTransitions('designing', schema, gatedApprovals)).toThrow(
        SchemaValidationError,
      )
      expect(() =>
        isWorkflowTransitionLegal('designing', 'implementing', schema, gatedApprovals),
      ).toThrow(SchemaValidationError)
    })
  })

  describe('bypassedSteps', () => {
    it('returns empty array when moving to immediately adjacent step', () => {
      const schema = makeSchema([], [])
      const bypassed = listBypassedWorkflowSteps('ready', 'implementing', schema, approvals)
      expect(bypassed).toEqual([])
    })

    it('returns empty array for backward transitions', () => {
      const schema = makeSchema([], [])
      const bypassed = listBypassedWorkflowSteps('implementing', 'designing', schema, approvals)
      expect(bypassed).toEqual([])
    })

    it('identifies intermediate active steps when shortcutting', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { optional: true })])
      const bypassed = listBypassedWorkflowSteps('ready', 'verifying', schema, approvals)
      expect(bypassed).toEqual(['implementing'])
    })

    it('excludes disabled intermediate steps from bypassedSteps', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('implementing', { optional: true }),
          makeWorkflowStep('verifying', { disabled: true }),
        ],
      )
      // Transition ready -> done
      const bypassed = listBypassedWorkflowSteps('ready', 'done', schema, approvals)
      // implementing is active and bypassed; verifying is disabled so it is not an active bypassed step
      expect(bypassed).toEqual(['implementing'])
    })
  })

  describe('nextForwardStep', () => {
    it('returns immediate next step in standard pipeline', () => {
      const schema = makeSchema([], [])
      expect(nextWorkflowStep('drafting', schema, approvals)).toBe('designing')
      expect(nextWorkflowStep('designing', schema, approvals)).toBe('ready')
      expect(nextWorkflowStep('ready', schema, approvals)).toBe('implementing')
      expect(nextWorkflowStep('implementing', schema, approvals)).toBe('verifying')
      expect(nextWorkflowStep('verifying', schema, approvals)).toBe('done')
      expect(nextWorkflowStep('done', schema, approvals)).toBe('archivable')
    })

    it('skips disabled steps to the next enabled step', () => {
      const schema = makeSchema([], [makeWorkflowStep('verifying', { disabled: true })])
      expect(nextWorkflowStep('implementing', schema, approvals)).toBe('done')
    })

    it('returns null at terminal archivable or archiving state', () => {
      const schema = makeSchema([], [])
      expect(nextWorkflowStep('archivable', schema, approvals)).toBeNull()
      expect(nextWorkflowStep('archiving', schema, approvals)).toBeNull()
    })

    it('enforces approval anchors through bypass and next-step queries', () => {
      // The spec-approval anchor is `ready`; disabling it while the gate is on is invalid.
      const schema = makeSchema([], [makeWorkflowStep('ready', { disabled: true })])
      const gatedApprovals = { spec: true, signoff: false } as const

      expect(() =>
        listBypassedWorkflowSteps('designing', 'implementing', schema, gatedApprovals),
      ).toThrow(SchemaValidationError)
      expect(() => nextWorkflowStep('designing', schema, gatedApprovals)).toThrow(
        SchemaValidationError,
      )
    })
  })

  describe('drain states', () => {
    const schema = makeSchema([], [])

    it('has no shortcut from pending-signoff to archivable', () => {
      expect(listWorkflowTransitions('pending-signoff', schema, approvals)).toEqual([
        'signed-off',
        'designing',
        'done',
      ])
      expect(nextWorkflowStep('pending-signoff', schema, approvals)).toBeNull()
    })

    it('has no shortcut from pending-spec-approval to implementing', () => {
      expect(listWorkflowTransitions('pending-spec-approval', schema, approvals)).toEqual([
        'spec-approved',
        'designing',
      ])
      expect(nextWorkflowStep('pending-spec-approval', schema, approvals)).toBeNull()
    })

    it('resolves next steps for approved drain states', () => {
      expect(nextWorkflowStep('spec-approved', schema, approvals)).toBe('implementing')
      expect(nextWorkflowStep('signed-off', schema, approvals)).toBe('archivable')
    })
  })

  describe('optional entry', () => {
    it('nextWorkflowStep enters an optional step rather than skipping it', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { optional: true })])
      expect(nextWorkflowStep('ready', schema, approvals)).toBe('implementing')
    })
  })
  describe('legality and drain safety', () => {
    it('never returns a next step that is not a legal transition', () => {
      const schemas = [
        makeSchema([], []),
        makeSchema([], [makeWorkflowStep('implementing', { disabled: true })]),
        makeSchema([], [makeWorkflowStep('verifying', { disabled: true })]),
        makeSchema(
          [],
          [
            makeWorkflowStep('implementing', { disabled: true }),
            makeWorkflowStep('verifying', { disabled: true }),
          ],
        ),
      ]
      const gates = [
        { spec: false, signoff: false },
        { spec: true, signoff: true },
      ] as const
      for (const schema of schemas) {
        for (const gate of gates) {
          for (const state of Object.keys(VALID_TRANSITIONS) as ChangeState[]) {
            const next = nextWorkflowStep(state, schema, gate)
            if (next !== null) {
              expect(listWorkflowTransitions(state, schema, gate)).toContain(next)
            }
          }
        }
      }
    })

    it('returns null for spec-approved when no forward exit remains', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { disabled: true })])
      const next = nextWorkflowStep('spec-approved', schema, { spec: true, signoff: false })
      expect(next).toBeNull()
    })

    it('admits designing to designing as a redesign re-entry', () => {
      const schema = makeSchema([], [])
      expect(listWorkflowTransitions('designing', schema, approvals)).toContain('designing')
    })

    it('allows ready to done when implementing and verifying are disabled', () => {
      const schema = makeSchema(
        [],
        [
          makeWorkflowStep('implementing', { disabled: true }),
          makeWorkflowStep('verifying', { disabled: true }),
        ],
      )
      expect(listWorkflowTransitions('ready', schema, approvals)).toContain('done')
      expect(nextWorkflowStep('ready', schema, approvals)).toBe('done')
    })

    it('exposes only the six topology functions', () => {
      expect(Object.keys(topology).sort()).toEqual([
        'isWorkflowStepEnabled',
        'isWorkflowTransitionLegal',
        'listBypassedWorkflowSteps',
        'listWorkflowTransitions',
        'nextWorkflowStep',
        'resolveWorkflowPipeline',
      ])
    })
  })
  describe('shortcut boundaries and pipeline membership', () => {
    it('stops a shortcut at the first non-optional step', () => {
      const schema = makeSchema([], [makeWorkflowStep('implementing', { optional: true })])

      const fromReady = listWorkflowTransitions('ready', schema, approvals)

      expect(fromReady).toContain('implementing')
      expect(fromReady).toContain('verifying')
      expect(fromReady).not.toContain('done')
      expect(listBypassedWorkflowSteps('ready', 'verifying', schema, approvals)).toEqual([
        'implementing',
      ])
    })

    it('lists the backward edges from verifying', () => {
      const schema = makeSchema([], [])

      const exits = listWorkflowTransitions('verifying', schema, approvals)

      expect(exits).toContain('implementing')
      expect(exits).toContain('designing')
      expect(exits).toContain('done')
    })

    it('never places drain states in the pipeline', () => {
      const drain = ['pending-spec-approval', 'spec-approved', 'pending-signoff', 'signed-off']
      for (const gate of [
        { spec: false, signoff: false },
        { spec: true, signoff: true },
      ]) {
        const steps = resolveWorkflowPipeline(makeSchema([], []), gate).map((entry) => entry.step)
        for (const state of drain) {
          expect(steps).not.toContain(state)
        }
      }
    })
  })
})
