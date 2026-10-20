import { SchemaValidationError } from '../errors/schema-validation-error.js'
import { type ChangeState, VALID_TRANSITIONS } from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'

/**
 * Project-level approval gate configuration.
 */
export interface ApprovalGates {
  readonly spec: boolean
  readonly signoff: boolean
}

/**
 * Representation of an active step in the workflow pipeline.
 */
export interface PipelineStep {
  readonly step: ChangeState
  readonly optional: boolean
  readonly disabled: boolean
}

/** Bedrock states that cannot be disabled or optional under any circumstances. */
const BEDROCK_STATES: readonly ChangeState[] = [
  'drafting',
  'designing',
  'done',
  'archivable',
  'archiving',
]

/** Fixed canonical progression order; `workflow[]` row order carries no meaning. */
const CANONICAL_PIPELINE: readonly ChangeState[] = [
  'drafting',
  'designing',
  'ready',
  'implementing',
  'verifying',
  'done',
  'archivable',
  'archiving',
]

/** Drain-only parking states that are never part of the pipeline. */
const DRAIN_STATES: readonly ChangeState[] = [
  'pending-spec-approval',
  'spec-approved',
  'pending-signoff',
  'signed-off',
]

/**
 * Returns whether a state is a drain-only parking state.
 *
 * @param state - Lifecycle state
 * @returns true for pending/approved parking states
 */
function isDrainState(state: ChangeState): boolean {
  return DRAIN_STATES.includes(state)
}

/**
 * Builds the ordered active pipeline in canonical order, omitting disabled steps.
 *
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates used to validate active anchors
 * @returns Active pipeline steps in canonical order
 * @throws SchemaValidationError if a bedrock or active approval anchor is disabled
 */
function buildActivePipeline(schema: Schema, approvals: ApprovalGates): readonly PipelineStep[] {
  const declared = new Map<
    ChangeState,
    { readonly optional: boolean; readonly disabled: boolean }
  >()

  for (const row of schema.workflow()) {
    const step = row.step as ChangeState
    const disabled = Boolean(row.disabled)
    const optional = Boolean(row.optional)
    if (disabled && BEDROCK_STATES.includes(step)) {
      throw new SchemaValidationError(schema.name(), `Bedrock state '${step}' cannot be disabled`)
    }
    if (optional && BEDROCK_STATES.includes(step)) {
      throw new SchemaValidationError(schema.name(), `Bedrock state '${step}' cannot be optional`)
    }
    if (disabled && step === 'ready' && approvals.spec) {
      throw new SchemaValidationError(
        schema.name(),
        "Approval anchor state 'ready' cannot be disabled when spec approval gate is active",
      )
    }
    declared.set(step, { optional, disabled })
  }

  return CANONICAL_PIPELINE.map((step) => ({
    step,
    optional: declared.get(step)?.optional ?? false,
    disabled: declared.get(step)?.disabled ?? false,
  })).filter((entry) => !entry.disabled)
}

/**
 * Computes the legal forward targets along the pipeline from `from`.
 *
 * A non-optional step can be entered but not crossed.
 *
 * @param from - Current lifecycle state
 * @param pipeline - Active pipeline
 * @returns Directly reachable forward targets in pipeline order
 */
function forwardTargets(from: ChangeState, pipeline: readonly PipelineStep[]): ChangeState[] {
  const index = pipeline.findIndex((entry) => entry.step === from)
  if (index === -1) {
    return []
  }

  const targets: ChangeState[] = []
  for (let j = index + 1; j < pipeline.length; j++) {
    const candidate = pipeline[j]
    if (candidate === undefined) {
      break
    }
    if (candidate.step === 'archivable' && from !== 'done') {
      break
    }
    if (candidate.step === 'archiving' && from !== 'archivable') {
      break
    }
    targets.push(candidate.step)
    if (!candidate.optional) {
      break
    }
  }
  return targets
}

/**
 * Constructs the deterministic, ordered progression of active lifecycle steps.
 *
 * The order is always canonical regardless of `workflow[]` row order. Enforces
 * bedrock state immutability and the `ready` approval anchor lock.
 *
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates configuration
 * @returns Ordered list of active pipeline steps
 * @throws SchemaValidationError if bedrock/anchor states are disabled
 */
export function resolveWorkflowPipeline(
  schema: Schema,
  approvals: ApprovalGates,
): readonly PipelineStep[] {
  return buildActivePipeline(schema, approvals)
}

/**
 * Returns whether a lifecycle step is active in the schema (not declared disabled).
 *
 * @param step - Lifecycle state
 * @param schema - Sovereign change schema
 * @returns true if enabled, false if disabled
 */
export function isWorkflowStepEnabled(step: ChangeState, schema: Schema): boolean {
  if (BEDROCK_STATES.includes(step)) {
    return true
  }
  const configured = schema.workflowStep(step)
  if (!configured) {
    return true
  }
  return configured.disabled !== true
}

/**
 * Computes the complete set of valid destination states from the given state.
 *
 * @param from - Current lifecycle state
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates used to validate active anchors
 * @returns List of legal destination states
 */
export function listWorkflowTransitions(
  from: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
): readonly ChangeState[] {
  if (!isWorkflowStepEnabled(from, schema)) {
    return []
  }

  const canonicalMoves = VALID_TRANSITIONS[from] ?? []

  if (isDrainState(from)) {
    return canonicalMoves.filter((move) => isWorkflowStepEnabled(move, schema))
  }

  const pipeline = buildActivePipeline(schema, approvals)
  const forward = forwardTargets(from, pipeline)
  const destinations = new Set<ChangeState>(forward)
  const fromIndex = pipeline.findIndex((entry) => entry.step === from)

  for (const move of canonicalMoves) {
    if (destinations.has(move) || !isWorkflowStepEnabled(move, schema)) {
      continue
    }
    const moveIndex = pipeline.findIndex((entry) => entry.step === move)
    const isRedesign = move === 'designing'
    const isRecovery = from === 'archiving' && move === 'archivable'
    const isBackward = moveIndex !== -1 && fromIndex !== -1 && moveIndex < fromIndex
    if (isRedesign || isRecovery || isBackward) {
      destinations.add(move)
    }
  }

  return Array.from(destinations)
}

/**
 * Returns true if transition from -> to is legal according to the topology.
 *
 * @param from - Current lifecycle state
 * @param to - Requested destination state
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates used to validate active anchors
 * @returns Whether the transition is legal
 */
export function isWorkflowTransitionLegal(
  from: ChangeState,
  to: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
): boolean {
  return listWorkflowTransitions(from, schema, approvals).includes(to)
}

/**
 * Computes all active pipeline steps strictly between from and to.
 *
 * Disabled steps are absent from the pipeline; non-forward or adjacent
 * transitions return an empty array.
 *
 * @param from - Current lifecycle state
 * @param to - Requested destination state
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates used to validate active anchors
 * @returns Active steps bypassed by the transition
 */
export function listBypassedWorkflowSteps(
  from: ChangeState,
  to: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
): readonly ChangeState[] {
  const pipeline = buildActivePipeline(schema, approvals)
  const fromIndex = pipeline.findIndex((entry) => entry.step === from)
  const toIndex = pipeline.findIndex((entry) => entry.step === to)
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex + 1) {
    return []
  }
  return pipeline.slice(fromIndex + 1, toIndex).map((entry) => entry.step)
}

/**
 * Resolves the closest subsequent active step in the ordered pipeline.
 *
 * @param from - Current lifecycle state
 * @param schema - Sovereign change schema
 * @param approvals - Project approval gates used to validate active anchors
 * @returns Next active forward step, or null when none exists
 */
export function nextWorkflowStep(
  from: ChangeState,
  schema: Schema,
  approvals: ApprovalGates,
): ChangeState | null {
  if (
    from === 'archivable' ||
    from === 'archiving' ||
    from === 'pending-spec-approval' ||
    from === 'pending-signoff'
  ) {
    return null
  }
  if (from === 'spec-approved' || from === 'signed-off') {
    // Drain states leave through their first legal non-redesign exit, or nowhere.
    const forward = listWorkflowTransitions(from, schema, approvals).find(
      (step) => step !== 'designing',
    )
    return forward ?? null
  }

  const pipeline = buildActivePipeline(schema, approvals)
  const index = pipeline.findIndex((entry) => entry.step === from)
  if (index === -1) {
    return null
  }
  return pipeline[index + 1]?.step ?? null
}
