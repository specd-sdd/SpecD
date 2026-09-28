import { type Change, type CompletedVerification } from '../../domain/entities/change.js'
import {
  type AutomaticRecovery,
  type ValidityBlocker,
} from '../../domain/services/change-validity.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { VerificationNotFoundError } from '../errors/verification-not-found-error.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type NextAction } from './get-status.js'
import { type ReconcileChangeValidity } from './reconcile-change-validity.js'

/** Input for marking completed verification stale. */
export interface InvalidateVerificationInput {
  readonly name: string
  readonly reason: string
}

/** Result of an explicit verification invalidation. */
export interface InvalidateVerificationResult {
  readonly change: Change
  readonly verification: CompletedVerification
  readonly invalidated: boolean
  readonly reason: string
  readonly signoffChanged: boolean
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}

/** Dependencies for invalidating verification. */
export interface InvalidateVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly reconcileChangeValidity: ReconcileChangeValidity
}

/**
 * Marks completed verification stale through the reconciler.
 *
 * Accepts legacy completed evidence. Absent or attempt-only evidence throws
 * before mutation. Already stale evidence is a successful no-op and does not
 * hash, start an attempt, or move lifecycle state.
 */
export class InvalidateVerification {
  private readonly _deps: InvalidateVerificationDeps

  /**
   * Creates the invalidate-verification use case.
   *
   * @param deps - Repository, actor, and reconciler
   */
  constructor(deps: InvalidateVerificationDeps) {
    this._deps = deps
  }

  /**
   * Submits a verification-invalidation intent for completed evidence.
   *
   * @param input - Change name and human reason
   * @returns Invalidation, sign-off consequence, blockers, recovery, and next action
   * @throws {ChangeNotFoundError} When the change does not exist
   * @throws {VerificationNotFoundError} When no completed evidence exists
   */
  async execute(input: InvalidateVerificationInput): Promise<InvalidateVerificationResult> {
    const current = await this._deps.changes.get(input.name)
    if (current === null) {
      throw new ChangeNotFoundError(input.name)
    }
    const completed = current.verification.completed
    if (completed === undefined) {
      throw new VerificationNotFoundError(input.name)
    }
    if (completed.status === 'stale') {
      const observed = await this._deps.reconcileChangeValidity.execute({ name: input.name })
      const retained = observed.change.verification.completed
      if (retained === undefined) throw new VerificationNotFoundError(input.name)
      return {
        change: observed.change,
        verification: retained,
        invalidated: false,
        reason: retained.invalidation?.reason ?? 'Verification evidence was already stale',
        signoffChanged: observed.projectionChanges.some(
          (change) => change.projection === 'signoff',
        ),
        automaticReturn: observed.automaticReturn,
        blockers: observed.verdict.blockers,
        nextAction: nextFrom(observed.change, observed.automaticReturn),
      }
    }
    const committed = await this._deps.reconcileChangeValidity.execute({
      name: input.name,
      intent: { type: 'verification-invalidation', reason: input.reason },
    })
    const verification = committed.change.verification.completed
    if (verification === undefined) {
      throw new VerificationNotFoundError(input.name)
    }
    return {
      change: committed.change,
      verification,
      invalidated: committed.projectionChanges.some(
        (change) => change.projection === 'verification',
      ),
      reason: verification.invalidation?.reason ?? input.reason,
      signoffChanged: committed.projectionChanges.some((change) => change.projection === 'signoff'),
      automaticReturn: committed.automaticReturn,
      blockers: committed.verdict.blockers,
      nextAction: nextFrom(committed.change, committed.automaticReturn),
    }
  }
}

/**
 * Next from.
 *
 * @param change - change
 * @param recovery - recovery
 * @returns next from result
 */
function nextFrom(change: Change, recovery: AutomaticRecovery | null): NextAction {
  if (recovery === null) {
    const verificationBoundary =
      change.state === 'verifying' ||
      change.state === 'done' ||
      change.state === 'pending-signoff' ||
      change.state === 'signed-off' ||
      change.state === 'archivable' ||
      change.state === 'archiving'
    return {
      targetStep: change.state,
      actionType: 'mechanical',
      reason: 'Verification evidence is stale',
      command: verificationBoundary ? '/specd-verify' : null,
    }
  }
  return {
    targetStep: recovery.to,
    actionType: 'cognitive',
    reason: 'Verification invalidation required a lifecycle return',
    command:
      recovery.to === 'designing'
        ? '/specd-design'
        : recovery.to === 'done'
          ? '/specd-verify'
          : null,
  }
}
