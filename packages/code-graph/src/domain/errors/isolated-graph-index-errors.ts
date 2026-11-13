import { SpecdCodeGraphError } from './specd-code-graph-error.js'
import { type GraphIndexWorkerDiagnostics } from '../value-objects/graph-index-worker-types.js'

/**
 * Base error class for all failures produced by the isolated graph-index runner.
 * Holds optional post-mortem supervisor diagnostics.
 */
export abstract class GraphIndexWorkerError extends SpecdCodeGraphError {
  private attachedDiagnostics?: GraphIndexWorkerDiagnostics

  /**
   * Diagnostics attached by the supervisor; absent before the child started.
   */
  get diagnostics(): GraphIndexWorkerDiagnostics | undefined {
    return this.attachedDiagnostics
  }

  /**
   * Attaches diagnostics once; later calls are ignored.
   * @param diagnostics - Post-mortem supervisor diagnostics.
   * @returns this instance for fluent chaining.
   */
  withDiagnostics(diagnostics: GraphIndexWorkerDiagnostics): this {
    if (this.attachedDiagnostics === undefined) {
      this.attachedDiagnostics = diagnostics
    }
    return this
  }
}

/** Failure to create or initialize the isolated graph-index child process. */
export class GraphIndexWorkerStartError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_WORKER_START'
  }
  /** Returns the original startup failure, when available. */
  get cause(): unknown {
    return this.startCause
  }
  private readonly startCause?: unknown
  /**
   * Creates a startup failure.
   * @param message - Actionable failure detail.
   * @param cause - Original failure.
   */
  constructor(message: string, cause?: unknown) {
    super(message)
    this.startCause = cause
  }
}

/** The injected task module does not meet the required graph-index task contract. */
export class GraphIndexTaskContractError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_TASK_CONTRACT'
  }
  /**
   * Creates a task contract failure.
   * @param message - Actionable failure detail.
   */
  constructor(message: string) {
    super(message)
  }
}

/** The injected task rejected or threw while executing. */
export class GraphIndexTaskExecutionError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_TASK_EXECUTION'
  }
  /** Returns the task-supplied failure code, when present. */
  get taskCode(): string | null {
    return this.taskFailureCode
  }
  private readonly taskFailureCode: string | null
  /**
   * Creates a task execution failure.
   * @param message - Actionable failure detail.
   * @param taskCode - Optional task code.
   */
  constructor(message: string, taskCode: string | null = null) {
    super(message)
    this.taskFailureCode = taskCode
  }
}

/** A child IPC message was malformed, unsupported, late, or duplicated. */
export class GraphIndexWorkerProtocolError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_WORKER_PROTOCOL'
  }
  /**
   * Creates a protocol failure.
   * @param message - Actionable failure detail.
   */
  constructor(message: string) {
    super(message)
  }
}

/** The child exited unexpectedly or without a valid terminal result. */
export class GraphIndexWorkerExitError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_WORKER_EXIT'
  }
  /** Returns the child exit code, when available. */
  get exitCode(): number | null {
    return this.childExitCode
  }
  /** Returns the unexpected child signal, when available. */
  get signal(): string | null {
    return this.childSignal
  }
  private readonly childExitCode: number | null
  private readonly childSignal: string | null
  /**
   * Creates an exit failure.
   * @param message - Actionable failure detail.
   * @param exitCode - Child exit code.
   * @param signal - Child signal.
   */
  constructor(message: string, exitCode: number | null = null, signal: string | null = null) {
    super(message)
    this.childExitCode = exitCode
    this.childSignal = signal
  }
}

/** The host forwarded SIGINT or SIGTERM to its active graph-index child. */
export class GraphIndexWorkerSignalError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_WORKER_SIGNAL'
  }
  /** Returns the signal forwarded by the parent. */
  get signal(): 'SIGINT' | 'SIGTERM' | 'SIGBREAK' {
    return this.forwardedSignal
  }
  /** Returns the child exit code, when available. */
  get exitCode(): number | null {
    return this.childExitCode
  }
  private readonly forwardedSignal: 'SIGINT' | 'SIGTERM' | 'SIGBREAK'
  private readonly childExitCode: number | null
  /**
   * Creates a signal failure.
   * @param message - Actionable failure detail.
   * @param signal - Forwarded signal.
   * @param exitCode - Child exit code.
   */
  constructor(
    message: string,
    signal: 'SIGINT' | 'SIGTERM' | 'SIGBREAK',
    exitCode: number | null = null,
  ) {
    super(message)
    this.forwardedSignal = signal
    this.childExitCode = exitCode
  }
}

/** The optional host progress callback threw while receiving a worker progress value. */
export class GraphIndexProgressHandlerError extends GraphIndexWorkerError {
  /** Returns the stable machine-readable code. */
  override get code(): string {
    return 'GRAPH_INDEX_PROGRESS_HANDLER'
  }
  /** Returns the original progress-handler failure, when available. */
  get cause(): unknown {
    return this.handlerCause
  }
  private readonly handlerCause?: unknown
  /**
   * Creates a progress-handler failure.
   * @param message - Actionable failure detail.
   * @param cause - Original failure.
   */
  constructor(message: string, cause?: unknown) {
    super(message)
    this.handlerCause = cause
  }
}
