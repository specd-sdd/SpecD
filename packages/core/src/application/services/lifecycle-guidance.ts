import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type ChangeValidityVerdict } from '../../domain/services/change-validity.js'
import {
  isAtOrAfterVerificationBoundary,
  type LifecycleNextHop,
  type LifecycleReviewSummary,
} from '../../domain/services/lifecycle-verdict.js'
import { isWorkflowStepEnabled } from '../../domain/services/workflow-topology.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { boundFromStates } from '../../domain/services/check-bindings.js'

/** Public next-action including the application-owned command string. */
export interface LifecycleNextAction extends LifecycleNextHop {
  readonly command: string | null
}

/**
 * Resolves the product command or skill string for a lifecycle next hop.
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
 * @returns Skill or CLI command string, or null when no guidance applies
 */
export function resolveLifecycleCommand(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
  validity?: ChangeValidityVerdict,
): string | null {
  const state = change.state
  const verifyingEnabled = isWorkflowStepEnabled('verifying', schema)
  // Retained in the public contract for diagnostics; routing follows Core's selected nextHop.
  void availableTransitions

  if (validity?.specApproval === 'stale' || validity?.specApproval === 'revoked') {
    return '/specd-design'
  }

  if (
    verifyingEnabled &&
    validity !== undefined &&
    nextHop.reason === 'Renew verification in place' &&
    isAtOrAfterVerificationBoundary(state, schema, approvals) &&
    (validity.verification === 'stale' ||
      validity.verification === 'absent' ||
      validity.verification === 'attempt-active')
  ) {
    return '/specd-verify'
  }

  const guidance: PhaseGuidance = { verifyingEnabled, review, approvals, validity }

  if (validity?.artifactReviewRequired === true && validity.recovery === null) {
    return phaseCommand(change, nextHop, guidance)
  }

  if (review.required || validity?.recovery?.cause === 'workflow-redesign') {
    return '/specd-design'
  }

  if (
    boundFromStates('approval.spec').includes(state) &&
    approvals.spec &&
    change.activeSpecApproval === undefined
  ) {
    return 'specd changes approve spec'
  }

  if (
    boundFromStates('approval.signoff').includes(state) &&
    approvals.signoff &&
    change.activeSignoff === undefined
  ) {
    return 'specd changes approve signoff'
  }

  return phaseCommand(change, nextHop, guidance)
}

/** Context phase guidance needs beyond the change and next hop. */
interface PhaseGuidance {
  readonly verifyingEnabled: boolean
  readonly review: LifecycleReviewSummary
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  readonly validity: ChangeValidityVerdict | undefined
}

/**
 * Phase command.
 *
 * @param change - change
 * @param nextHop - next hop
 * @param guidance - Schema topology, review, approvals, and validity context
 * @returns phase command result
 */
function phaseCommand(
  change: Change,
  nextHop: LifecycleNextHop,
  guidance: PhaseGuidance,
): string | null {
  const state = change.state
  const { verifyingEnabled, review, approvals, validity } = guidance

  if (state === 'drafting' || state === 'designing') {
    return '/specd-design'
  }

  if (state === 'ready') {
    if (nextHop.targetStep === 'implementing') return '/specd-implement'
    if (nextHop.targetStep === 'verifying') return '/specd-verify'
    if (nextHop.targetStep === 'done' || nextHop.targetStep === 'archivable') {
      return '/specd-archive'
    }
  }

  if (state === 'pending-spec-approval') {
    return 'specd changes approve spec'
  }

  if (state === 'spec-approved') {
    if (nextHop.targetStep === 'implementing') return '/specd-implement'
    if (nextHop.targetStep === 'verifying') return '/specd-verify'
    if (nextHop.targetStep === 'done' || nextHop.targetStep === 'archivable') {
      return '/specd-archive'
    }
  }

  if (state === 'implementing') {
    if (nextHop.targetStep === 'verifying') return '/specd-verify'
    if (nextHop.targetStep === 'done' || nextHop.targetStep === 'archivable') {
      return '/specd-archive'
    }
    return '/specd-implement'
  }

  if (state === 'verifying') {
    return '/specd-verify'
  }

  if (state === 'pending-signoff') {
    return 'specd changes approve signoff'
  }

  if (state === 'done' || state === 'signed-off') {
    if (nextHop.targetStep === 'archivable') return '/specd-archive'
    if (!verifyingEnabled) {
      // Without verification evidence the blocker is design, review, or sign-off.
      if (nextHop.targetStep === 'designing' || review.required) return '/specd-design'
      if (
        approvals.signoff &&
        (validity !== undefined ? validity.signoff !== 'valid' : change.activeSignoff === undefined)
      ) {
        return 'specd changes approve signoff'
      }
      return '/specd-archive'
    }
    return '/specd-verify'
  }

  if (state === 'archivable') {
    return '/specd-archive'
  }

  if (state === 'archiving') {
    const lastArchiveFailure = [...change.history]
      .reverse()
      .find((event) => event.type === 'archive-failed')
    if (
      lastArchiveFailure?.type === 'archive-failed' &&
      lastArchiveFailure.commitStarted &&
      change.state === 'archiving'
    ) {
      return '/specd-design'
    }
    return 'specd change archive'
  }

  if (nextHop.targetStep !== state) {
    if (nextHop.targetStep === 'implementing') return '/specd-implement'
    if (nextHop.targetStep === 'verifying') return '/specd-verify'
    if (
      nextHop.targetStep === 'done' ||
      nextHop.targetStep === 'archivable' ||
      nextHop.targetStep === 'archiving'
    )
      return '/specd-archive'
    if (nextHop.targetStep === 'designing') return '/specd-design'
  }

  return null
}

/**
 * Assembles a full next action from a domain next hop and product command resolution.
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
 * @returns Next hop fields plus resolved command string
 */
export function resolveLifecycleNextAction(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  schema: Schema,
  validity?: ChangeValidityVerdict,
): LifecycleNextAction {
  return {
    ...nextHop,
    command: resolveLifecycleCommand(
      change,
      nextHop,
      review,
      availableTransitions,
      approvals,
      schema,
      validity,
    ),
  }
}
