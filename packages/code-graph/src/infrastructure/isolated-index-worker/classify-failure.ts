import {
  GraphIndexWorkerStartError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerProtocolError,
  GraphIndexProgressHandlerError,
} from '../../domain/errors/isolated-graph-index-errors.js'
import { type GraphIndexFailureCause } from '../../domain/value-objects/graph-index-worker-types.js'

/**
 * Regex matching V8's fatal-error report line for heap exhaustion at the start of a stderr line,
 * so that ordinary text printed by a task cannot trigger it.
 */
const RESOURCE_LIMIT_RE =
  /^(?:# )?FATAL ERROR:.*(?:Reached heap limit|heap out of memory|Allocation failed)/im

/**
 * Signals that represent abnormal termination due to native crashes.
 */
const NATIVE_CRASH_SIGNALS = new Set(['SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGABRT'])

/**
 * Exit codes representing native crash or abort:
 * - 3221225477: Windows access violation (0xC0000005)
 * - 3221226505: Windows stack buffer overrun / fast-fail abort (0xC0000409)
 * - 134: Unix 128 + 6 (SIGABRT)
 */
const NATIVE_CRASH_EXIT_CODES = new Set([3221225477, 3221226505, 134])

/**
 * Input parameters for classifying an isolated worker failure.
 */
export interface ClassifyWorkerFailureInput {
  /** Typed worker error produced by the supervisor. */
  readonly error: Error
  /** Child process exit code, if exited normally. */
  readonly exitCode: number | null
  /** Child process termination signal, if killed by signal. */
  readonly signal: string | null
  /** Forwarded host signal, if cancelled. */
  readonly forwardedSignal?: string | undefined
  /** Captured tail of child stderr output. */
  readonly stderrTail: string
}

/**
 * Classifies an isolated worker process failure into a closed set of root causes.
 *
 * Evaluation order (first match wins):
 * 1. GraphIndexWorkerStartError -> 'start-failed'
 * 2. GraphIndexTaskContractError -> 'task-contract'
 * 3. GraphIndexTaskExecutionError -> 'task-error'
 * 4. GraphIndexWorkerProtocolError | GraphIndexProgressHandlerError -> 'protocol'
 * 5. forwardedSignal !== undefined -> 'cancelled'
 * 6. stderr matches heap out of memory pattern -> 'resource-limit'
 * 7. signal in SIGSEGV|SIGBUS|SIGILL|SIGABRT or exitCode in {3221225477, 134} -> 'native-crash'
 * 8. Fallback -> 'exited'
 *
 * @param input - Classification facts.
 * @returns Classified cause.
 */
export function classifyWorkerFailure(input: ClassifyWorkerFailureInput): GraphIndexFailureCause {
  if (input.error instanceof GraphIndexWorkerStartError) {
    return 'start-failed'
  }
  if (input.error instanceof GraphIndexTaskContractError) {
    return 'task-contract'
  }
  if (input.error instanceof GraphIndexTaskExecutionError) {
    return 'task-error'
  }
  if (
    input.error instanceof GraphIndexWorkerProtocolError ||
    input.error instanceof GraphIndexProgressHandlerError
  ) {
    return 'protocol'
  }
  if (input.forwardedSignal !== undefined) {
    return 'cancelled'
  }
  if (RESOURCE_LIMIT_RE.test(input.stderrTail)) {
    return 'resource-limit'
  }
  if (
    (input.signal !== null && NATIVE_CRASH_SIGNALS.has(input.signal)) ||
    (input.exitCode !== null && NATIVE_CRASH_EXIT_CODES.has(input.exitCode))
  ) {
    return 'native-crash'
  }
  return 'exited'
}
