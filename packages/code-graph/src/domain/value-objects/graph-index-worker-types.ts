/**
 * Classified root cause of an isolated worker failure.
 */
export type GraphIndexFailureCause =
  /** The child process could not be created or its IPC channel could not be established. */
  | 'start-failed'
  /** The task module does not meet the required task contract. */
  | 'task-contract'
  /** The task rejected or threw while executing. */
  | 'task-error'
  /** A malformed, unsupported, late or duplicate IPC message, or a throwing host handler. */
  | 'protocol'
  /** The child was stopped by a signal that the supervisor forwarded from the host. */
  | 'cancelled'
  /** The child terminated by a native crash signal or an abort exit code. */
  | 'native-crash'
  /** The child terminated after reporting memory exhaustion. */
  | 'resource-limit'
  /** Any other exit without a valid terminal message. */
  | 'exited'

/**
 * Diagnostics captured from an isolated worker child upon failure.
 */
export interface GraphIndexWorkerDiagnostics {
  /** Closed classification of the failure. */
  readonly cause: GraphIndexFailureCause
  /**
   * Last announced item and how long before the failure it was announced; null if none.
   */
  readonly lastActivity: {
    /** The last item the child announced before the failure. */
    readonly item: string
    /** Milliseconds between that announcement and the failure. */
    readonly agoMs: number
  } | null
  /**
   * Most recent standard output, at most 16 KiB, UTF-8 with invalid sequences replaced.
   */
  readonly stdoutTail: string
  /**
   * Most recent standard error, at most 16 KiB, same decoding.
   */
  readonly stderrTail: string
}

/**
 * Typed worker event emitted by the isolated worker runner.
 */
export type GraphIndexWorkerEvent =
  | {
      /** The child task announced the item it is about to process. */
      readonly kind: 'activity'
      /** The announced item, such as a file path relative to its workspace. */
      readonly item: string
    }
  /**
   * No message arrived from the child for the silence threshold; carries the last announced item
   * (or null) and the silent duration in milliseconds.
   */
  | {
      /** No message arrived from the child for the silence threshold. */
      readonly kind: 'worker-silent'
      /** The last announced item, or null when the child announced none. */
      readonly item: string | null
      /** How long the child has been silent, in milliseconds. */
      readonly silentForMs: number
    }
  /** A stale index lock was recovered before the child started. */
  | {
      /** A stale index lock was recovered before the child started. */
      readonly kind: 'stale-lock-recovered'
      /** Why the previous lock was considered stale. */
      readonly reason: 'process-not-running' | 'pid-reused' | 'malformed'
      /** Path of the recovered lock file. */
      readonly lockPath: string
      /** Process id recorded in the stale lock, when known. */
      readonly pid?: number
      /** Start time recorded in the stale lock, when known. */
      readonly startedAt?: string
    }

/**
 * Announces the current item being processed by the worker child task.
 */
export type GraphIndexTaskAnnouncer = (
  item: string,
  options?: { readonly mandatory?: boolean },
) => void
