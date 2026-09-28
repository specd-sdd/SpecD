import { SpecdError } from '../../domain/errors/specd-error.js'
import {
  type AutomaticRecovery,
  type ValidityBlocker,
} from '../../domain/services/change-validity.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'
import { type NextAction } from '../use-cases/get-status.js'

/** Operation stopped because validity reconciliation already committed a lifecycle recovery. */
export type ReconciledOperation = 'transition' | 'archive'

/** Complete context for a requested operation blocked by committed recovery. */
export interface ReconciledOperationBlockedInput {
  readonly operation: ReconciledOperation
  readonly changeName: string
  readonly state: ChangeState
  readonly automaticReturn: AutomaticRecovery
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}

/**
 * Thrown after reconciliation commits a recovery that makes the requested operation inapplicable.
 *
 * Code: `RECONCILED_OPERATION_BLOCKED`. The recovery remains persisted; callers should present
 * {@link nextAction} instead of retrying the original operation.
 */
export class ReconciledOperationBlockedError extends SpecdError {
  /** Stable machine-readable error code. */
  override get code(): string {
    return 'RECONCILED_OPERATION_BLOCKED'
  }

  private readonly _operation: ReconciledOperation
  private readonly _changeName: string
  private readonly _state: ChangeState
  private readonly _automaticReturn: AutomaticRecovery
  private readonly _blockers: readonly ValidityBlocker[]
  private readonly _nextAction: NextAction

  /**
   * Creates a committed-recovery diagnostic.
   *
   * @param input - Operation, persisted recovery, blockers, and canonical repair guidance
   */
  constructor(input: ReconciledOperationBlockedInput) {
    super(
      `Cannot continue ${input.operation} for change '${input.changeName}': validity reconciliation returned it to '${input.state}'. Follow ${input.nextAction.command ?? `the '${input.nextAction.targetStep}' next action`}.`,
    )
    this._operation = input.operation
    this._changeName = input.changeName
    this._state = input.state
    this._automaticReturn = input.automaticReturn
    this._blockers = input.blockers
    this._nextAction = input.nextAction
  }

  /** Requested operation that reconciliation interrupted. */
  get operation(): ReconciledOperation {
    return this._operation
  }

  /** Name of the change whose recovery was committed. */
  get changeName(): string {
    return this._changeName
  }

  /** Persisted lifecycle state after recovery. */
  get state(): ChangeState {
    return this._state
  }

  /** Recovery selected and committed by the canonical reconciler. */
  get automaticReturn(): AutomaticRecovery {
    return this._automaticReturn
  }

  /** Canonical validity blockers after recovery. */
  get blockers(): readonly ValidityBlocker[] {
    return this._blockers
  }

  /** Canonical action the caller should present instead of retrying. */
  get nextAction(): NextAction {
    return this._nextAction
  }
}
