import { Worker } from 'node:worker_threads'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { StoreOverloadError } from '../../domain/errors/store-overload-error.js'
import { StoreWorkerError } from '../../domain/errors/store-worker-error.js'
import { GraphBusyError } from '../../domain/errors/graph-busy-error.js'
import { GraphProviderStaleError } from '../../domain/errors/graph-provider-stale-error.js'
import { SpecNotFoundError } from '../../domain/errors/spec-not-found-error.js'
import { resolveSqliteWorkerPath } from './resolve-worker-path.js'
import {
  type SerializedErrorPayload,
  type SQLiteWorkerOperationMap,
  type SQLiteWorkerRequest,
  type SQLiteWorkerResponse,
} from './sqlite-worker-protocol.js'
import { type SQLiteGraphStoreOptions } from './sqlite-runtime-descriptor.js'

/**
 * Formal lifecycle states of the SQLite worker client.
 */
export type WorkerState = 'closed' | 'opening' | 'open' | 'closing' | 'faulted'

/**
 * Internal descriptor tracking an in-flight asynchronous request to the SQLite worker.
 */
interface PendingRequest {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: Error) => void
  readonly onProgress?: ((stage: string) => void) | undefined
}

/**
 * Serializes an error or unknown thrown value into a transferable payload across worker boundaries.
 *
 * @param error - The caught error or thrown value to serialize.
 * @returns A structured serialized error payload.
 */
export function serializeWorkerError(error: unknown): SerializedErrorPayload {
  if (error instanceof Error) {
    const errorRecord = error as unknown as Record<string, unknown>
    const customCode = typeof errorRecord.code === 'string' ? errorRecord.code : undefined
    const sqliteCode =
      typeof errorRecord.sqliteCode === 'string'
        ? errorRecord.sqliteCode
        : customCode?.startsWith('SQLITE_')
          ? customCode
          : undefined
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: customCode,
      sqliteCode,
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

/**
 * Deserializes a worker error payload back into an appropriate typed Error instance on the host.
 *
 * @param payload - Serialized error payload received from the worker thread.
 * @returns Reconstructed Error instance matching the original error type and code.
 */
export function deserializeWorkerError(payload: SerializedErrorPayload): Error {
  if (payload.code === 'STORE_NOT_OPEN') {
    return new StoreNotOpenError()
  }
  if (payload.code === 'STORE_OVERLOAD') {
    return new StoreOverloadError(payload.message)
  }
  if (payload.code === 'STORE_WORKER_ERROR') {
    return new StoreWorkerError(payload.message)
  }
  if (payload.code === 'GRAPH_BUSY') {
    return new GraphBusyError(payload.message || 'Graph is busy')
  }
  if (payload.code === 'GRAPH_PROVIDER_STALE') {
    return new GraphProviderStaleError(payload.message)
  }
  if (payload.code === 'SPEC_NOT_FOUND') {
    return new SpecNotFoundError(payload.message)
  }

  const err = new Error(payload.message)
  err.name = payload.name || 'Error'
  if (payload.stack) {
    err.stack = payload.stack
  }
  if (payload.code || payload.sqliteCode) {
    Object.assign(err, {
      ...(payload.code ? { code: payload.code } : {}),
      ...(payload.sqliteCode ? { sqliteCode: payload.sqliteCode } : {}),
    })
  }
  return err
}

/**
 * Host-side client managing the lifecycle of the SQLite Worker thread,
 * message correlation, backpressure queuing, and crash handling.
 */
export class SQLiteWorkerClient {
  private worker: Worker | undefined
  private state: WorkerState = 'closed'
  private openPromise: Promise<void> | undefined
  private closePromise: Promise<void> | undefined
  private nextRequestId = 1
  private maxPendingOperations = 256
  private readonly pendingRequests = new Map<number, PendingRequest>()

  /**
   * Whether the worker thread is active and ready to accept database requests.
   */
  get isOpen(): boolean {
    return this.state === 'open'
  }

  /**
   * Whether the worker thread encountered an unrecoverable fault.
   */
  get faulted(): boolean {
    return this.state === 'faulted'
  }

  /**
   * Current lifecycle state of the worker client.
   */
  get currentState(): WorkerState {
    return this.state
  }

  /**
   * Current number of pending in-flight operations awaiting worker responses.
   */
  get pendingCount(): number {
    return this.pendingRequests.size
  }

  /**
   * Spawns the worker thread, establishes communication, and opens the SQLite database.
   * Concurrent invocations share the same in-flight initialization promise.
   *
   * @param storagePath - Root path owning the `graph/` directory.
   * @param options - Optional runtime configuration and max pending operations settings.
   * @returns Promise resolving when the worker has successfully opened and initialized the database.
   * @throws {StoreWorkerError} If the worker is already faulted.
   * @throws {StoreNotOpenError} If called while closing.
   * @throws {Error} If `maxPendingOperations` is invalid.
   */
  async open(storagePath: string, options?: SQLiteGraphStoreOptions): Promise<void> {
    if (this.state === 'open') {
      return
    }
    if (this.state === 'opening' && this.openPromise) {
      return this.openPromise
    }
    if (this.state === 'closing') {
      throw new StoreNotOpenError()
    }
    if (this.state === 'faulted') {
      throw new StoreWorkerError('SQLite worker is faulted; close store before reopening')
    }

    if (options?.maxPendingOperations !== undefined) {
      const limit = options.maxPendingOperations
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        throw new Error(
          `Invalid maxPendingOperations: expected integer >= 1, received ${String(limit)}`,
        )
      }
      this.maxPendingOperations = limit
    }

    this.state = 'opening'

    this.openPromise = (async () => {
      try {
        const workerScriptPath = resolveSqliteWorkerPath(options?.workerPath)
        const isTs = workerScriptPath.endsWith('.ts')
        const worker = new Worker(workerScriptPath, {
          execArgv: isTs ? ['--import', 'tsx'] : undefined,
        })

        worker.on('message', (response: SQLiteWorkerResponse) => {
          this.handleWorkerMessage(response)
        })

        worker.on('error', (err: Error) => {
          this.handleWorkerError(err)
        })

        worker.on('exit', (code: number) => {
          this.handleWorkerExit(code)
        })

        this.worker = worker

        await this.sendRequestInternal(
          'open',
          {
            storagePath,
            runtime: options?.runtime,
          },
          true,
        )

        // Only transition to 'open' if close() was not called concurrently during startup
        if (this.state === 'opening') {
          this.state = 'open'
        }
      } catch (error) {
        // Don't reset state or clean up worker if close() is already managing the lifecycle
        if (this.state !== 'closing') {
          if (!this.faulted) {
            this.state = 'closed'
          }
          if (this.worker) {
            try {
              await this.worker.terminate()
            } catch {
              // Ignore termination errors on failed open
            }
            this.worker = undefined
          }
        }
        throw error
      } finally {
        this.openPromise = undefined
      }
    })()

    return this.openPromise
  }

  /**
   * Drains in-flight requests, closes the database connection in the worker,
   * and terminates the worker thread. Concurrent invocations share the same shutdown promise.
   *
   * @param drainTimeoutMs - Maximum time in milliseconds to wait for accepted operations to drain.
   * @returns Promise resolving when the worker has shut down cleanly.
   */
  async close(drainTimeoutMs = 5000): Promise<void> {
    if (this.state === 'closed') {
      return
    }
    if (this.closePromise) {
      return this.closePromise
    }
    if (this.state === 'faulted') {
      // Manual recovery: clean up worker reference and reset state to closed
      if (this.worker) {
        try {
          await this.worker.terminate()
        } catch {
          // Ignore termination errors during recovery
        }
        this.worker = undefined
      }
      this.state = 'closed'
      return
    }

    this.closePromise = (async () => {
      try {
        // 1. If currently opening, wait for open attempt to settle first
        if (this.openPromise) {
          this.state = 'closing'
          try {
            await this.openPromise
          } catch {
            // If open failed, state is already closed or faulted and worker cleaned up.
            // Return here — the outer finally will still clear closePromise.
            return
          }
        }

        this.state = 'closing'

        // Shared deadline for drain + close RPC combined
        const deadline = Date.now() + drainTimeoutMs

        // 2. Drain accepted in-flight requests within deadline
        const drained =
          this.pendingRequests.size > 0
            ? await this.drainPendingRequests(deadline - Date.now())
            : true

        // 3. If drained successfully and worker is still healthy, send clean DB close RPC
        //    with remaining time from the shared deadline so the total close() is bounded.
        if (drained && !this.faulted && this.worker) {
          const remainingMs = deadline - Date.now()
          try {
            await Promise.race([
              this.sendRequestInternal('close', {}, true),
              new Promise<void>((_, reject) =>
                setTimeout(
                  () => reject(new StoreWorkerError('Worker close RPC timed out')),
                  Math.max(0, remainingMs),
                ),
              ),
            ])
          } catch {
            // Ignore error sending close to worker during shutdown (timeout or worker gone)
          }
        }
      } finally {
        // 4. Reject any remaining timed-out requests BEFORE terminating the worker so
        //    that the drain-timeout error is the one callers see (not the exit event error).
        if (this.pendingRequests.size > 0) {
          const timeoutErr = new StoreWorkerError(
            'Worker shutdown timed out while draining pending requests',
          )
          for (const [, pending] of this.pendingRequests) {
            pending.reject(timeoutErr)
          }
          this.pendingRequests.clear()
        }

        // 5. Force terminate worker thread unconditionally
        if (this.worker) {
          try {
            await this.worker.terminate()
          } catch {
            // Ignore termination errors
          }
          this.worker = undefined
        }

        if (!this.faulted) {
          this.state = 'closed'
        }

        // Always clear closePromise — even if openPromise threw above
        this.closePromise = undefined
      }
    })()

    return this.closePromise
  }

  /**
   * Sends a strongly-typed asynchronous RPC request to the SQLite worker thread.
   *
   * @template K - Specific SQLiteWorkerOperation key.
   * @param op - Worker operation identifier.
   * @param payload - Strongly-typed serializable request payload matching operation.
   * @param onProgress - Optional callback for stage progress events during execution.
   * @returns Promise resolving with the strongly-typed result returned by the worker.
   * @throws {StoreWorkerError} If the worker has faulted.
   * @throws {StoreNotOpenError} If the store is not open or is currently closing.
   * @throws {StoreOverloadError} If the pending operations limit has been exceeded.
   */
  async sendRequest<K extends keyof SQLiteWorkerOperationMap>(
    op: K,
    payload: SQLiteWorkerOperationMap[K]['payload'],
    onProgress?: (stage: string) => void,
  ): Promise<SQLiteWorkerOperationMap[K]['result']> {
    return this.sendRequestInternal(op, payload, false, onProgress)
  }

  /**
   * Internal request sender with lifecycle allowance switch.
   *
   * @template K - Specific SQLiteWorkerOperation key.
   * @param op - Worker operation identifier.
   * @param payload - Strongly-typed serializable request payload.
   * @param allowLifecycle - Whether to allow request during opening or closing states.
   * @param onProgress - Optional progress callback.
   * @returns Promise resolving with the typed result.
   */
  private async sendRequestInternal<K extends keyof SQLiteWorkerOperationMap>(
    op: K,
    payload: SQLiteWorkerOperationMap[K]['payload'],
    allowLifecycle = false,
    onProgress?: (stage: string) => void,
  ): Promise<SQLiteWorkerOperationMap[K]['result']> {
    if (this.state === 'faulted') {
      throw new StoreWorkerError('SQLite worker has terminated unexpectedly')
    }
    if (!allowLifecycle && this.state !== 'open') {
      throw new StoreNotOpenError()
    }
    if (!this.worker) {
      throw new StoreNotOpenError()
    }
    if (!allowLifecycle && this.pendingRequests.size >= this.maxPendingOperations) {
      throw new StoreOverloadError(
        `SQLite operation queue overloaded (pending: ${this.pendingRequests.size} >= max: ${this.maxPendingOperations})`,
      )
    }

    const id = this.nextRequestId++
    const request: SQLiteWorkerRequest<K> = { id, op, payload }

    return new Promise<SQLiteWorkerOperationMap[K]['result']>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (val: unknown) => resolve(val as SQLiteWorkerOperationMap[K]['result']),
        reject,
        onProgress,
      })
      try {
        this.worker?.postMessage(request)
      } catch (err) {
        this.pendingRequests.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /**
   * Waits for accepted in-flight requests to drain, up to the specified timeout.
   *
   * @param timeoutMs - Maximum time in milliseconds to wait for pending requests to reach 0.
   * @returns Promise resolving to true if fully drained, or false if the timeout expired.
   */
  private async drainPendingRequests(timeoutMs: number): Promise<boolean> {
    if (this.pendingRequests.size === 0) return true

    return new Promise<boolean>((resolve) => {
      const startTime = Date.now()
      const checkInterval = setInterval(() => {
        if (this.pendingRequests.size === 0) {
          clearInterval(checkInterval)
          resolve(true)
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(checkInterval)
          resolve(false)
        }
      }, 10)
    })
  }

  /**
   * Handles messages received from the worker thread.
   *
   * @param response - Response message from the worker.
   */
  private handleWorkerMessage(response: SQLiteWorkerResponse): void {
    const { id, type } = response
    const pending = this.pendingRequests.get(id)
    if (!pending) return

    if (type === 'progress') {
      pending.onProgress?.(response.stage)
      return
    }

    this.pendingRequests.delete(id)
    if (type === 'result') {
      pending.resolve(response.result)
    } else if (type === 'error') {
      pending.reject(deserializeWorkerError(response.error))
    }
  }

  /**
   * Handles unhandled worker errors.
   *
   * @param err - The worker error.
   */
  private handleWorkerError(err: Error): void {
    this.faultWorker(err)
  }

  /**
   * Handles worker process exit events.
   *
   * @param code - Exit code returned by worker thread.
   */
  private handleWorkerExit(code: number): void {
    // If we are already closed, ignore — this is the expected exit after terminate()
    if (this.state === 'closed') return

    // If we are closing but the worker exits before all pending requests settled
    // (e.g. crash while waiting for the open ACK during a concurrent open+close),
    // reject any remaining in-flight requests so that awaited promises can settle.
    if (this.state === 'closing') {
      if (this.pendingRequests.size > 0) {
        const err = new StoreWorkerError(
          `SQLite worker exited unexpectedly during shutdown (code ${code})`,
        )
        for (const [, pending] of this.pendingRequests) {
          pending.reject(err)
        }
        this.pendingRequests.clear()
      }
      return
    }

    this.faultWorker(new Error(`Worker thread exited unexpectedly with code ${code}`))
  }

  /**
   * Transitions the worker client into a faulted state and rejects all in-flight pending operations.
   *
   * @param error - Root cause error triggering the fault.
   */
  private faultWorker(error: Error): void {
    this.state = 'faulted'
    const workerError = new StoreWorkerError(
      `SQLite worker terminated unexpectedly: ${error.message}`,
    )

    for (const [, pending] of this.pendingRequests) {
      pending.reject(workerError)
    }
    this.pendingRequests.clear()

    if (this.worker) {
      void this.worker.terminate().catch(() => {})
      this.worker = undefined
    }
  }
}
