import { type Change, type VerificationAttempt } from '../../domain/entities/change.js'
import { ArchiveImplementationStateError } from '../../domain/errors/archive-implementation-state-error.js'
import { type Check } from '../../domain/services/transition-checks.js'
import { FingerprintInputError } from '../errors/fingerprint-input-error.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { buildCheckExecutionContext } from '../services/execute-matching-predicates.js'
import { type ValidityFingerprintService } from '../services/validity-fingerprint-service.js'
import { type RefreshImplementationTracking } from './refresh-implementation-tracking.js'
import {
  type ReconcileChangeValidity,
  type ReconcileChangeValidityResult,
} from './reconcile-change-validity.js'

/** Input for starting a verification attempt. */
export interface StartVerificationInput {
  readonly name: string
}

/** Result of a successful verification start. */
export interface StartVerificationResult {
  readonly change: Change
  readonly attempt: VerificationAttempt
  readonly supersededAttemptId: string | null
  readonly reconciliation: ReconcileChangeValidityResult
}

/**
 * Dependencies for starting verification.
 *
 * `schemaProvider` is required to build the normal check-execution context for
 * the implementation readiness predicates. The design contract names the other
 * ports; the context cannot be built without the active schema.
 */
export interface StartVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly reconcileChangeValidity: ReconcileChangeValidity
  readonly refreshImplementationTracking: RefreshImplementationTracking
  readonly fingerprint: ValidityFingerprintService
  readonly implementationChecks: readonly Check[]
  readonly schemaProvider: SchemaProvider
}

/**
 * Starts a verification attempt in any active lifecycle state.
 *
 * Refreshes implementation tracking and runs the implementation readiness
 * checks before any baseline is stored. A successful start always appends a
 * new attempt. It does not record completed evidence or move lifecycle state.
 */
export class StartVerification {
  private readonly _deps: StartVerificationDeps

  /**
   * Creates the start-verification use case.
   *
   * @param deps - Repository, actor, reconciler, tracking, fingerprint, checks, and schema
   */
  constructor(deps: StartVerificationDeps) {
    this._deps = deps
  }

  /**
   * Refreshes tracking, requires implementation readiness, and stores a new baseline.
   *
   * @param input - Change name
   * @returns The new attempt, any superseded attempt id, and the committed reconciliation
   * @throws {ChangeNotFoundError} When the change does not exist
   * @throws {ArchiveImplementationStateError} When implementation readiness fails
   * @throws {FingerprintInputError} When a complete fingerprint cannot be collected
   */
  async execute(input: StartVerificationInput): Promise<StartVerificationResult> {
    await this._deps.refreshImplementationTracking.execute({ name: input.name })
    const reconciled = await this._deps.reconcileChangeValidity.execute({ name: input.name })
    await this._assertImplementationReady(reconciled.change, reconciled.verdict)
    const actor = await this._deps.actor.identity()
    const mutation = await this._deps.reconcileChangeValidity.mutate(
      { name: input.name },
      async (ctx) => {
        const collected = await this._deps.fingerprint.completeFingerprint(ctx.change)
        if (collected.fingerprint === null) {
          return { started: false as const, failures: collected.failures }
        }
        const started = ctx.change.startVerification(collected.fingerprint, actor)
        return {
          started: true as const,
          attempt: started.attempt,
          supersededAttemptId: started.supersededAttemptId,
        }
      },
    )
    if (!mutation.result.started) {
      throw new FingerprintInputError(mutation.result.failures)
    }
    const { result, ...reconciliation } = mutation
    return {
      change: mutation.change,
      attempt: result.attempt,
      supersededAttemptId: result.supersededAttemptId,
      reconciliation,
    }
  }

  /**
   *  assert implementation ready.
   *
   * @param change - Change whose implementation readiness is checked
   * @param validity - Reconciled validity available to registered checks
   * @returns  assert implementation ready result
   */
  private async _assertImplementationReady(
    change: Change,
    validity: ReconcileChangeValidityResult['verdict'],
  ): Promise<void> {
    const schema = await this._deps.schemaProvider.get()
    const ctx = buildCheckExecutionContext({
      change,
      schema,
      attempt: { scope: 'operation', operation: 'verification-start' },
      approvals: { spec: false, signoff: false },
      validity,
    })
    const seen = new Set<string>()
    for (const check of this._deps.implementationChecks) {
      if (check.id !== 'impl.filesResolved' && check.id !== 'impl.linksInScope') continue
      if (seen.has(check.id)) continue
      seen.add(check.id)
      const outcome = await check.execute(ctx)
      if (outcome.outcome !== 'fail') continue
      const files = Array.isArray(outcome.details?.files)
        ? outcome.details.files.filter((file): file is string => typeof file === 'string')
        : []
      throw new ArchiveImplementationStateError(
        files,
        outcome.message ?? 'Implementation state invalid',
      )
    }
  }
}
