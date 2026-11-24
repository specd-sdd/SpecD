import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import {
  isAtOrAfterVerificationBoundary,
  type LifecycleNextHop,
  type LifecycleReviewSummary,
} from '../../domain/services/lifecycle-verdict.js'
import { type CheckAction, type CheckResult } from '../../domain/services/transition-checks.js'
import {
  isDrainState,
  isWorkflowStepEnabled,
  nextWorkflowStep,
} from '../../domain/services/workflow-topology.js'
import { type Schema } from '../../domain/value-objects/schema.js'

/** Host-neutral workflow phase intent emitted by core guidance. */
export type LifecycleActionIntent = 'design' | 'implement' | 'verify' | 'archive'

/** Public next-action including host-neutral intent and optional check-declared action. */
export interface LifecycleNextAction extends LifecycleNextHop {
  readonly intent: LifecycleActionIntent | null
  readonly action?: CheckAction
}

/**
 * Resolves the host-neutral phase intent and optional check-declared remediation action
 * for a lifecycle next hop.
 *
 * @param change - Active change aggregate
 * @param nextHop - Domain next-hop recommendation
 * @param review - Artifact review summary
 * @param availableTransitions - Predicate-filtered transition targets
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled in config
 * @param approvals.signoff - Whether signoff approval is enabled in config
 * @param schema - Sovereign change schema; guidance follows its topology
 * @param validity - Reconciled validity verdict, when one is available
 * @param hopFailures - Failed predicate results of the hop the recommendation waits on
 * @returns Host-neutral intent and optional check action
 */
export function resolveLifecycleIntent(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
  validity?: ChangeValidityVerdict,
  hopFailures: readonly CheckResult[] = [],
): { readonly intent: LifecycleActionIntent | null; readonly action?: CheckAction } {
  // Retained in the public contract for diagnostics; routing follows Core's selected nextHop.
  void availableTransitions

  const phaseIntent = resolvePhaseIntent(change, nextHop, review, approvals, schema, validity)
  const firstWithAction = hopFailures.find((result) => result.action !== undefined)
  if (firstWithAction?.action !== undefined) {
    return {
      intent: firstWithAction.action.supersedesIntent === false ? phaseIntent : null,
      action: firstWithAction.action,
    }
  }
  return { intent: phaseIntent }
}

/**
 * Resolves the phase-level intent from topology, review, and validity without
 * inspecting specific check ids or parking states.
 *
 * @param change - Active change aggregate
 * @param nextHop - Domain next-hop recommendation
 * @param review - Artifact review summary
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled
 * @param approvals.signoff - Whether signoff approval is enabled
 * @param schema - Sovereign change schema
 * @param validity - Reconciled validity verdict, when available
 * @returns Phase intent or `null` when no phase intent applies
 */
function resolvePhaseIntent(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
  validity?: ChangeValidityVerdict,
): LifecycleActionIntent | null {
  const state = change.state
  const verifyingEnabled = isWorkflowStepEnabled('verifying', schema)

  if (
    verifyingEnabled &&
    validity !== undefined &&
    validity.recovery === null &&
    isAtOrAfterVerificationBoundary(state, schema, approvals) &&
    (validity.verification === 'stale' ||
      validity.verification === 'absent' ||
      validity.verification === 'attempt-active')
  ) {
    return 'verify'
  }

  if (validity?.artifactReviewRequired === true && validity.recovery === null) {
    return 'design'
  }

  if (review.required || validity?.recovery?.cause === 'workflow-redesign') {
    return 'design'
  }

  return intentForStateAndHop(change, nextHop, verifyingEnabled, review, approvals, schema)
}

/** Phase owned by a state itself, regardless of the selected hop. */
const OWN_PHASE: Readonly<Partial<Record<ChangeState, LifecycleActionIntent>>> = {
  drafting: 'design',
  designing: 'design',
  verifying: 'verify',
  archivable: 'archive',
}

/** Phase that owns a hop target. The four phase intents are a fixed vocabulary. */
const TARGET_PHASE: Readonly<Partial<Record<ChangeState, LifecycleActionIntent>>> = {
  designing: 'design',
  implementing: 'implement',
  verifying: 'verify',
  done: 'archive',
  archivable: 'archive',
  archiving: 'archive',
}

/**
 * Maps the current state and selected next hop to a phase intent. Schema-dependent facts
 * (enabled steps, drain exits) come from the topology; the two tables above only map a
 * state or hop target to one of the four phase intents.
 *
 * @param change - Active change aggregate
 * @param nextHop - Domain next-hop recommendation
 * @param verifyingEnabled - Whether `verifying` is enabled in the schema
 * @param review - Artifact review summary
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled
 * @param approvals.signoff - Whether signoff approval is enabled
 * @param schema - Sovereign change schema
 * @returns Phase intent or `null`
 */
function intentForStateAndHop(
  change: Change,
  nextHop: LifecycleNextHop,
  verifyingEnabled: boolean,
  review: LifecycleReviewSummary,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
): LifecycleActionIntent | null {
  const state = change.state

  if (nextHop.targetStep === 'designing') return 'design'

  const own = OWN_PHASE[state]
  if (own !== undefined) return own

  if (state === 'done') {
    if (nextHop.targetStep === 'archivable') return 'archive'
    if (!verifyingEnabled) return review.required ? 'design' : 'archive'
    return 'verify'
  }

  if (state === 'archiving') {
    const lastArchiveFailure = [...change.history]
      .reverse()
      .find((event) => event.type === 'archive-failed')
    return lastArchiveFailure?.type === 'archive-failed' && lastArchiveFailure.commitStarted
      ? 'design'
      : 'archive'
  }

  if (state === 'implementing') {
    return TARGET_PHASE[nextHop.targetStep] ?? 'implement'
  }

  if (nextHop.targetStep !== state) {
    return TARGET_PHASE[nextHop.targetStep] ?? null
  }

  if (isDrainState(state)) {
    const exit = nextWorkflowStep(state, schema, approvals)
    return exit === null ? null : (TARGET_PHASE[exit] ?? null)
  }

  return null
}

/**
 * Assembles a full next action from a domain next hop and host-neutral intent resolution.
 *
 * @param change - Active change aggregate
 * @param nextHop - Domain next-hop recommendation
 * @param review - Artifact review summary
 * @param availableTransitions - Predicate-filtered transition targets
 * @param approvals - Configured approval gates
 * @param approvals.spec - Whether spec approval is enabled in config
 * @param approvals.signoff - Whether signoff approval is enabled in config
 * @param schema - Sovereign change schema; guidance follows its topology
 * @param validity - Reconciled validity verdict, when one is available
 * @param hopFailures - Failed predicate results of the hop the recommendation waits on
 * @returns Next hop fields plus resolved intent and optional check action
 */
export function resolveLifecycleNextAction(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
  validity?: ChangeValidityVerdict,
  hopFailures: readonly CheckResult[] = [],
): LifecycleNextAction {
  const resolved = resolveLifecycleIntent(
    change,
    nextHop,
    review,
    availableTransitions,
    approvals,
    schema,
    validity,
    hopFailures,
  )
  return {
    ...nextHop,
    intent: resolved.intent,
    ...(resolved.action !== undefined ? { action: resolved.action } : {}),
  }
}
