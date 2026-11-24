import { type Change, type CompletedVerification } from '../../domain/entities/change.js'
import { compareValidityFingerprints } from '../../domain/value-objects/validity-fingerprint.js'
import { FingerprintInputError } from '../errors/fingerprint-input-error.js'
import { VerificationAttemptNotFoundError } from '../errors/verification-attempt-not-found-error.js'
import { VerificationFingerprintMismatchError } from '../errors/verification-fingerprint-mismatch-error.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ValidityFingerprintService } from '../services/validity-fingerprint-service.js'
import {
  type ReconcileChangeValidity,
  type ReconcileChangeValidityResult,
} from './reconcile-change-validity.js'

/** Input for recording successful verification evidence. */
export interface CompleteVerificationInput {
  readonly name: string
}

/** Result of a successful verification completion. */
export interface CompleteVerificationResult {
  readonly change: Change
  readonly verification: CompletedVerification
  readonly reconciliation: ReconcileChangeValidityResult
}

/** Dependencies for completing verification. */
export interface CompleteVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly reconcileChangeValidity: ReconcileChangeValidity
  readonly fingerprint: ValidityFingerprintService
}

/**
 * Records completed verification evidence when the fresh fingerprint matches the active baseline.
 *
 * Does not run tests. A missing attempt, unreadable input, or mismatch leaves the baseline
 * and any completed evidence unchanged. Drift already detected by reconciliation is still committed.
 */
export class CompleteVerification {
  private readonly _deps: CompleteVerificationDeps

  /**
   * Creates the complete-verification use case.
   *
   * @param deps - Repository, actor, reconciler, and fingerprint service
   */
  constructor(deps: CompleteVerificationDeps) {
    this._deps = deps
  }

  /**
   * Compares a fresh fingerprint with the active attempt and records completion on equality.
   *
   * @param input - Change name
   * @returns The completed evidence and committed reconciliation
   * @throws {VerificationAttemptNotFoundError} When no active attempt exists
   * @throws {FingerprintInputError} When the fresh fingerprint cannot be collected
   * @throws {VerificationFingerprintMismatchError} When the fresh fingerprint differs from the baseline
   */
  async execute(input: CompleteVerificationInput): Promise<CompleteVerificationResult> {
    const actor = await this._deps.actor.identity()
    const mutation = await this._deps.reconcileChangeValidity.mutate(
      { name: input.name },
      async (ctx) => {
        const active = ctx.change.verification.activeAttempt
        if (active === undefined) {
          return { completed: false as const, reason: 'missing-attempt' as const }
        }
        const collected = await this._deps.fingerprint.completeFingerprint(ctx.change)
        if (collected.fingerprint === null) {
          return {
            completed: false as const,
            reason: 'unreadable' as const,
            failures: collected.failures,
          }
        }
        const comparison = compareValidityFingerprints(active.baseline, collected.fingerprint)
        if (!comparison.equal) {
          return {
            completed: false as const,
            reason: 'mismatch' as const,
            differences: comparison.differences,
          }
        }
        return { completed: true as const, verification: ctx.change.completeVerification(actor) }
      },
    )
    if (!mutation.result.completed) {
      if (mutation.result.reason === 'missing-attempt') {
        throw new VerificationAttemptNotFoundError(input.name)
      }
      if (mutation.result.reason === 'unreadable') {
        throw new FingerprintInputError(mutation.result.failures)
      }
      throw new VerificationFingerprintMismatchError(mutation.result.differences)
    }
    const { result, ...reconciliation } = mutation
    return {
      change: mutation.change,
      verification: result.verification,
      reconciliation,
    }
  }
}
