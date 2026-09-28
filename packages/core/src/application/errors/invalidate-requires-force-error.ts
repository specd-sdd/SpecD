import { SpecdError } from '../../domain/errors/specd-error.js'
import { type ChangeState } from '../../domain/value-objects/change-state.js'

/** One valid consent gate that requires confirmation and its Core-selected recovery target. */
export interface ForceInvalidationRecovery {
  readonly gate: 'spec' | 'signoff'
  readonly target: ChangeState
}

/**
 * Thrown when invalidation would clear an active approval/signoff without `--force`.
 */
export class InvalidateRequiresForceError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALIDATE_REQUIRES_FORCE'
  }

  private readonly _gates: readonly ('spec' | 'signoff')[]
  private readonly _recoveries: readonly ForceInvalidationRecovery[]

  /**
   * Creates a new `InvalidateRequiresForceError` instance.
   *
   * @param recoveries - Valid consent gates the request would revoke and their recovery targets
   */
  constructor(
    recoveries: readonly ForceInvalidationRecovery[] = [{ gate: 'spec', target: 'designing' }],
  ) {
    super(
      'Change has active consent affected by this invalidation. Use --force to revoke the reported gate(s); Core will select the required recovery target.',
    )
    this._recoveries = recoveries
    this._gates = recoveries.map((entry) => entry.gate)
  }

  /** Valid consent gates the request would revoke. */
  get gates(): readonly ('spec' | 'signoff')[] {
    return this._gates
  }

  /** Valid gates paired with the recovery target selected by Core. */
  get recoveries(): readonly ForceInvalidationRecovery[] {
    return this._recoveries
  }
}
