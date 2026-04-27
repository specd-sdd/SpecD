import { SpecdError } from './specd-error.js'

/** Structured reason for why a state transition failed. */
export type TransitionFailureReason =
  | { readonly type: 'invalid-transition' }
  | {
      readonly type: 'incomplete-artifact'
      readonly artifactId: string
      readonly status?: string
      readonly blockedBy?: { readonly artifactId: string; readonly status: string }
    }
  | {
      readonly type: 'incomplete-tasks'
      readonly artifactId: string
      readonly incomplete: number
      readonly complete: number
      readonly total: number
    }
  | {
      readonly type: 'missing-task-capability'
      readonly artifactId: string
    }
  | {
      readonly type: 'approval-required'
      readonly gate: 'spec' | 'signoff'
    }
  | {
      readonly type: 'gate-not-required'
      readonly gate: 'spec' | 'signoff'
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
    case 'approval-required':
      return `${base}: ${approvalRequiredMessage(reason.gate)}`
    case 'gate-not-required':
      return `${base}: ${gateNotRequiredMessage(reason.gate)}`
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
    case 'incomplete-tasks':
      return `${base}: ${reason.artifactId} has incomplete items (${reason.complete}/${reason.total} tasks complete)`
    case 'missing-task-capability':
      return `${base}: artifact '${reason.artifactId}' is not marked as containing tasks (hasTasks: true)`
    case 'invalid-transition':
      return base
    default: {
      const _exhaustive: never = reason
      return `${base}: unknown reason '${(_exhaustive as TransitionFailureReason).type}'`
    }
  }
}

/**
 * Builds the human-readable message for approval-boundary failures.
 *
 * @param gate - The active approval gate that blocks the transition
 * @returns The approval-specific explanation
 */
function approvalRequiredMessage(gate: 'spec' | 'signoff'): string {
  return gate === 'spec'
    ? 'change is waiting for human spec approval'
    : 'change is waiting for human signoff'
}

/**
 * Builds the human-readable message for approval-gates failures.
 *
 * @param gate - The active approval gate that blocks the transition
 * @returns The approval-specific explanation
 */
function gateNotRequiredMessage(gate: 'spec' | 'signoff'): string {
  return gate === 'spec'
    ? 'change does not require spec approval'
    : 'change does not require signoff'
}
