import { SpecdError } from './specd-error.js'

/** Structured reason for why a state transition or approval eligibility check failed. */
export type TransitionFailureReason =
  | { readonly type: 'invalid-transition' }
  | {
      readonly type: 'incomplete-artifact'
      readonly artifactId: string
      readonly status?: string
      readonly blockedBy?: { readonly artifactId: string; readonly status: string }
    }

/**
 * Thrown when a state transition is attempted that is not permitted
 * by the change lifecycle defined in `ChangeState`.
 */
export class InvalidStateTransitionError extends SpecdError {
  private readonly _reason: TransitionFailureReason | undefined

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'INVALID_STATE_TRANSITION'
  }

  /** Structured reason for the failure, or `undefined` for legacy callers. */
  get reason(): TransitionFailureReason | undefined {
    return this._reason
  }

  /**
   * Creates a new `InvalidStateTransitionError` for the given transition attempt.
   *
   * @param from - The current state of the change
   * @param to - The target state that was rejected
   * @param reason - Optional structured reason for the failure
   */
  constructor(from: string, to: string, reason?: TransitionFailureReason) {
    super(buildMessage(from, to, reason))
    this._reason = reason
  }
}

/**
 * Builds the error message based on the transition and optional reason.
 *
 * @param from - The current state
 * @param to - The target state
 * @param reason - Optional structured reason
 * @returns The formatted error message
 */
function buildMessage(from: string, to: string, reason?: TransitionFailureReason): string {
  const base = `Cannot transition from '${from}' to '${to}'`
  if (reason === undefined) return base

  switch (reason.type) {
    case 'incomplete-artifact': {
      const artifact = `'${reason.artifactId}'`
      switch (reason.status) {
        case 'missing':
          return `${base}: artifact ${artifact} is missing`
        case 'in-progress':
          return `${base}: artifact ${artifact} is in-progress`
        case 'pending-review':
          return `${base}: artifact ${artifact} requires review`
        case 'drifted-pending-review':
          return `${base}: artifact ${artifact} content drifted and requires review`
        case 'pending-parent-artifact-review': {
          const parent = reason.blockedBy
            ? `parent '${reason.blockedBy.artifactId}' (${reason.blockedBy.status})`
            : 'an upstream dependency'
          return `${base}: artifact ${artifact} is blocked by review of ${parent}`
        }
        default:
          return `${base}: artifact ${artifact} is not complete [status: ${reason.status ?? 'unknown'}]`
      }
    }
    case 'invalid-transition':
      return base
    default: {
      const _exhaustive: never = reason
      return `${base}: unknown reason '${(_exhaustive as TransitionFailureReason).type}'`
    }
  }
}
