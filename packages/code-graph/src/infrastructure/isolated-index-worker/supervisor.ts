import { type ChildProcess, fork as nodeFork } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isAbsolute, resolve } from 'node:path'
import {
  type GraphIndexJsonValue,
  type IsolatedGraphIndexRunner,
  type RunIsolatedGraphIndexInput,
} from '../../application/ports/isolated-graph-index-runner.js'
import {
  GraphIndexProgressHandlerError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerExitError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerSignalError,
  GraphIndexWorkerStartError,
} from '../../domain/errors/isolated-graph-index-errors.js'
import {
  acquireGraphIndexLockLeaseByStoragePath,
  createGraphIndexLockHandoffEnv,
  type GraphIndexLockLease,
} from '../index-lock.js'
import { assertGraphIndexJsonValue } from './json-value.js'
import {
  GRAPH_INDEX_PROTOCOL,
  isChildMessage,
  type ChildMessage,
  type StartMessage,
} from './protocol.js'

/** Signals that the supervisor forwards to an active child. */
type ParentSignal = 'SIGINT' | 'SIGTERM'

/** Dependencies used by the supervisor; exported only for direct infrastructure tests. */
export interface IsolatedGraphIndexRuntime {
  /** Launches the packaged child entrypoint. */
  readonly fork: typeof nodeFork
  /** Parent process listener and environment surface. */
  readonly process: Pick<NodeJS.Process, 'on' | 'removeListener' | 'execPath' | 'env'>
  /** Installed child entrypoint URL. */
  readonly workerUrl: URL
  /** Acquires the internal exclusive graph-index lease. */
  readonly acquireLock: (storageRoot: string) => GraphIndexLockLease
}

/** Node implementation of the application process-isolation runner port. */
export class NodeIsolatedGraphIndexRunner implements IsolatedGraphIndexRunner {
  /**
   * Creates a runner backed by the supplied Node runtime.
   * @param runtime - Node process, launcher, worker, and lease dependencies.
   */
  constructor(private readonly runtime: IsolatedGraphIndexRuntime) {}

  /**
   * Runs a task through the configured process-isolation runtime.
   * @param input - Host task input.
   * @returns The child task result.
   */
  run<TInput = GraphIndexJsonValue, TProgress = GraphIndexJsonValue, TResult = GraphIndexJsonValue>(
    input: RunIsolatedGraphIndexInput<TInput, TProgress>,
  ): Promise<TResult> {
    return runIsolatedGraphIndexWithRuntime(input, this.runtime)
  }
}

/**
 * Executes one isolated graph-index task with an injectable Node runtime.
 * @param input - Host task input.
 * @param runtime - Node process, launcher, worker, and lease dependencies.
 * @returns The child task result.
 */
export function runIsolatedGraphIndexWithRuntime<
  TInput = GraphIndexJsonValue,
  TProgress = GraphIndexJsonValue,
  TResult = GraphIndexJsonValue,
>(
  input: RunIsolatedGraphIndexInput<TInput, TProgress>,
  runtime: IsolatedGraphIndexRuntime,
): Promise<TResult> {
  return new Promise<TResult>((resolvePromise, rejectPromise) => {
    let storageRoot: string
    let taskModuleHref: string
    try {
      storageRoot = normalizeAbsolutePath(input.storageRoot, 'storageRoot')
      taskModuleHref = normalizeTaskModule(input.taskModule)
      assertGraphIndexJsonValue(input.taskInput)
    } catch (error) {
      rejectPromise(
        error instanceof GraphIndexTaskContractError
          ? error
          : new GraphIndexTaskContractError('Graph-index worker inputs must be JSON-serializable.'),
      )
      return
    }

    let lease: GraphIndexLockLease
    try {
      lease = runtime.acquireLock(storageRoot)
    } catch (error) {
      rejectPromise(
        error instanceof Error
          ? error
          : new GraphIndexWorkerStartError(
              'Unable to acquire the graph-index worker lease.',
              error,
            ),
      )
      return
    }

    let child: ChildProcess | undefined
    let terminal:
      | { readonly kind: 'result'; readonly value: GraphIndexJsonValue }
      | { readonly kind: 'failure'; readonly error: Error }
      | undefined
    let forwardedSignal: ParentSignal | undefined
    let finalized: Promise<void> | undefined
    let settled = false

    const settle = (error?: Error, value?: TResult): void => {
      if (settled) return
      settled = true
      void finalize().then(() =>
        error === undefined ? resolvePromise(value as TResult) : rejectPromise(error),
      )
    }

    const detachChild = (target: ChildProcess): void => {
      target.removeListener('message', onMessage)
      target.removeListener('error', onError)
      target.removeListener('exit', onExit)
    }

    const finalize = (): Promise<void> => {
      if (finalized !== undefined) return finalized
      finalized = Promise.resolve().then(() => {
        runtime.process.removeListener('SIGINT', onSigint)
        runtime.process.removeListener('SIGTERM', onSigterm)
        const currentChild = child
        child = undefined
        if (currentChild !== undefined) {
          detachChild(currentChild)
          if (currentChild.connected) currentChild.disconnect()
        }
        lease.release()
      })
      return finalized
    }

    const terminate = (): void => {
      if (child !== undefined && child.exitCode === null && !child.killed) {
        try {
          child.kill('SIGTERM')
        } catch {
          /* Exit/error handler completes the run. */
        }
      }
    }

    const protocolFailure = (message: string): void => {
      if (terminal?.kind !== 'failure') {
        terminal = { kind: 'failure', error: new GraphIndexWorkerProtocolError(message) }
      }
      terminate()
    }

    const onMessage = (message: unknown): void => {
      if (!isChildMessage(message)) {
        protocolFailure('The graph-index worker sent an invalid IPC message.')
        return
      }
      if (terminal !== undefined) {
        protocolFailure(`The graph-index worker sent ${message.type} after a terminal message.`)
        return
      }
      if (message.type === 'progress') {
        if (input.onProgress === undefined) return
        try {
          input.onProgress(message.value as TProgress)
        } catch (error) {
          terminal = {
            kind: 'failure',
            error: new GraphIndexProgressHandlerError(
              'The graph-index progress handler threw.',
              error,
            ),
          }
          terminate()
        }
        return
      }
      terminal =
        message.type === 'result'
          ? { kind: 'result', value: message.value }
          : { kind: 'failure', error: mapTaskFailure(message) }
    }

    const onError = (error: Error): void => {
      if (terminal === undefined)
        terminal = {
          kind: 'failure',
          error: new GraphIndexWorkerStartError('Unable to start the graph-index worker.', error),
        }
      terminate()
      if (terminal.kind === 'failure') settle(terminal.error)
    }

    const onExit = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (forwardedSignal !== undefined) {
        settle(
          new GraphIndexWorkerSignalError(
            `The graph-index worker was stopped by ${forwardedSignal}.`,
            forwardedSignal,
            exitCode,
          ),
        )
        return
      }
      // A supervisor-detected terminal failure is authoritative. Terminating the
      // child to contain a protocol/progress failure commonly produces a signal
      // or non-zero exit, but that secondary exit must not erase the original
      // typed classification.
      if (terminal?.kind === 'failure') {
        settle(terminal.error)
        return
      }
      if (exitCode !== 0 || signal !== null) {
        settle(
          new GraphIndexWorkerExitError(
            'The graph-index worker exited unexpectedly.',
            exitCode,
            signal,
          ),
        )
        return
      }
      if (terminal === undefined) {
        settle(
          new GraphIndexWorkerExitError(
            'The graph-index worker exited without a terminal message.',
            exitCode,
            signal,
          ),
        )
        return
      }
      settle(undefined, terminal.value as TResult)
    }

    const forwardSignal = (signal: ParentSignal): void => {
      if (forwardedSignal !== undefined) return
      forwardedSignal = signal
      if (child !== undefined) {
        try {
          child.kill(signal)
        } catch {
          /* Exit/error listener will settle. */
        }
      }
    }
    const onSigint = (): void => forwardSignal('SIGINT')
    const onSigterm = (): void => forwardSignal('SIGTERM')

    try {
      child = runtime.fork(fileURLToPath(runtime.workerUrl), [], {
        serialization: 'json',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...runtime.process.env, ...createGraphIndexLockHandoffEnv(lease) },
      })
      child.on('message', onMessage)
      child.on('error', onError)
      child.on('exit', onExit)
      runtime.process.on('SIGINT', onSigint)
      runtime.process.on('SIGTERM', onSigterm)
      if (!child.connected) {
        terminal = {
          kind: 'failure',
          error: new GraphIndexWorkerStartError(
            'The graph-index worker did not provide an IPC channel.',
          ),
        }
        terminate()
        // A child created without IPC is not guaranteed to emit another event.
        // Finalize immediately so the graph lease and parent listeners cannot
        // remain pending indefinitely.
        settle(terminal.error)
        return
      }
      const start: StartMessage = {
        protocol: GRAPH_INDEX_PROTOCOL,
        type: 'start',
        taskModuleHref,
        taskInput: input.taskInput as GraphIndexJsonValue,
      }
      child.send(start, (error) => {
        if (error !== null && error !== undefined && terminal === undefined) {
          terminal = {
            kind: 'failure',
            error: new GraphIndexWorkerStartError(
              'Unable to send the graph-index worker start message.',
              error,
            ),
          }
          terminate()
          // A failed IPC send is not guaranteed to be followed by `exit` (for
          // example, when a mocked or broken child keeps its event loop alive).
          // Settle through the common finalizer so the lease and listeners are
          // released without depending on that eventuality.
          settle(terminal.error)
        }
      })
    } catch (error) {
      terminal = {
        kind: 'failure',
        error: new GraphIndexWorkerStartError('Unable to start the graph-index worker.', error),
      }
      if (child === undefined) settle(terminal.error)
      else {
        terminate()
        settle(terminal.error)
      }
    }
  })
}

/**
 * Constructs the real Node runtime used by the public composition wrapper.
 * @param workerUrl - URL of the worker entrypoint emitted alongside the package barrel.
 * @returns A runner backed by the installed Node worker entrypoint.
 */
export function createNodeIsolatedGraphIndexRunner(workerUrl: URL): NodeIsolatedGraphIndexRunner {
  return new NodeIsolatedGraphIndexRunner({
    fork: nodeFork,
    process,
    workerUrl,
    acquireLock: (storageRoot) =>
      acquireGraphIndexLockLeaseByStoragePath(storageRoot, { signalCleanup: 'exit-only' }),
  })
}

/**
 * Validates and normalizes an absolute filesystem path.
 * @param value - Candidate path.
 * @param field - Host input field name.
 * @returns Normalized absolute path.
 * @throws {GraphIndexTaskContractError} When the path is not absolute.
 */
function normalizeAbsolutePath(value: string, field: string): string {
  if (typeof value !== 'string' || !isAbsolute(value))
    throw new GraphIndexTaskContractError(`${field} must be an absolute filesystem path.`)
  return resolve(value)
}

/**
 * Converts a trusted task-module selector into a file URL href.
 * @param value - Candidate task module path or URL.
 * @returns Normalized file URL href.
 * @throws {GraphIndexTaskContractError} When the selector is not an absolute path or file URL.
 */
function normalizeTaskModule(value: URL | string): string {
  if (value instanceof URL) {
    if (value.protocol !== 'file:')
      throw new GraphIndexTaskContractError('taskModule must use the file: URL scheme.')
    return value.href
  }
  if (typeof value !== 'string')
    throw new GraphIndexTaskContractError(
      'taskModule must be an absolute filesystem path or file: URL.',
    )
  if (value.startsWith('file:')) {
    const url = new URL(value)
    if (url.protocol !== 'file:')
      throw new GraphIndexTaskContractError('taskModule must use the file: URL scheme.')
    return url.href
  }
  if (!isAbsolute(value))
    throw new GraphIndexTaskContractError(
      'taskModule must be an absolute filesystem path or file: URL.',
    )
  return pathToFileURL(resolve(value)).href
}

/**
 * Maps a child failure envelope into its public typed error.
 * @param message - Valid failure envelope.
 * @returns Classified worker error.
 */
function mapTaskFailure(message: Extract<ChildMessage, { readonly type: 'failure' }>): Error {
  if (message.category === 'task-contract')
    return new GraphIndexTaskContractError(message.error.message)
  if (message.category === 'task-execution')
    return new GraphIndexTaskExecutionError(message.error.message, message.error.code)
  return new GraphIndexWorkerProtocolError(message.error.message)
}
