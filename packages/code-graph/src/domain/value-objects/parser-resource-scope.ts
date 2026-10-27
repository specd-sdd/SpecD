/**
 * Releases a parser-owned resource whose library requires explicit release.
 */
export type ParserResourceDisposer = () => void

/**
 * One failure raised by a disposal function while an epoch was closed.
 */
export interface ParserResourceDisposalFailure {
  /**
   * Zero-based registration index of the resource whose disposal failed.
   */
  readonly index: number
  /**
   * Message of the thrown value (`String(error)` for non-Error values).
   */
  readonly message: string
}

/**
 * Outcome of closing an epoch.
 */
export interface ParserResourceCloseResult {
  /**
   * Number of resources that were registered in the closed epoch.
   */
  readonly registered: number
  /**
   * Failures raised by disposal functions, in the order the disposals were attempted.
   */
  readonly failures: readonly ParserResourceDisposalFailure[]
}

/**
 * Holds the parser-owned resources of the file currently being analysed.
 * A resource is kept strongly reachable from registration until the epoch is closed.
 */
export interface ParserResourceScope {
  /**
   * Number of resources registered in the current epoch.
   */
  readonly size: number
  /**
   * Registers a resource in the current epoch.
   * @param resource - Opaque parser-owned object that must stay reachable until the epoch closes.
   * @param dispose - Optional disposal function, required only when the library demands explicit release.
   */
  register(resource: unknown, dispose?: ParserResourceDisposer): void
  /**
   * Closes the current epoch: runs every disposal in reverse registration order, then drops every reference.
   * Never throws; disposal failures are returned. Closing an empty or already closed epoch is a no-op.
   * @returns The closed epoch's counters and disposal failures.
   */
  close(): ParserResourceCloseResult
}
