import { type Change } from '../../domain/entities/change.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import {
  type LifecycleNextHop,
  type LifecycleReviewSummary,
} from '../../domain/services/lifecycle-verdict.js'
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
 * @returns Skill or CLI command string, or null when no guidance applies
 */
export function resolveLifecycleCommand(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
): string | null {
  const state = change.state

  if (review.required) {
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

  if (state === 'drafting' || state === 'designing') {
    return '/specd-design'
  }

  if (state === 'ready' && availableTransitions.includes('implementing')) {
    return '/specd-implement'
  }

  if (state === 'pending-spec-approval') {
    return 'specd changes approve spec'
  }

  if (state === 'spec-approved' && availableTransitions.includes('implementing')) {
    return '/specd-implement'
  }

  if (state === 'implementing') {
    return availableTransitions.includes('verifying') ? '/specd-verify' : '/specd-implement'
  }

  if (state === 'verifying') {
    return '/specd-verify'
  }

  if (state === 'pending-signoff') {
    return 'specd changes approve signoff'
  }

  if (state === 'done' || state === 'signed-off') {
    return nextHop.targetStep === 'archivable' || availableTransitions.includes('archivable')
      ? '/specd-archive'
      : '/specd-verify'
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
    if (nextHop.targetStep === 'archiving') return '/specd-archive'
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
 * @returns Next hop fields plus resolved command string
 */
export function resolveLifecycleNextAction(
  change: Change,
  nextHop: LifecycleNextHop,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
): LifecycleNextAction {
  return {
    ...nextHop,
    command: resolveLifecycleCommand(change, nextHop, review, availableTransitions, approvals),
  }
}
