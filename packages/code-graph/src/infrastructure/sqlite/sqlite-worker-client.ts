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
  type SQLiteWorkerOperation,
  type SQLiteWorkerRequest,
  type SQLiteWorkerResponse,
} from './sqlite-worker-protocol.js'
import { type SQLiteGraphStoreOptions } from './sqlite-runtime-descriptor.js'

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
  private isFaulted = false
  private isClosing = false
  private isOpenState = false
  private nextRequestId = 1
  private maxPendingOperations = 256
  private readonly pendingRequests = new Map<number, PendingRequest>()

  /**
   * Whether the worker thread is active and ready to accept database requests.
   */
  get isOpen(): boolean {
    return this.isOpenState && !this.isFaulted && !this.isClosing
  }

  /**
   * Whether the worker thread encountered an unrecoverable fault.
   */
  get faulted(): boolean {
    return this.isFaulted
  }

  /**
   * Current number of pending in-flight operations awaiting worker responses.
   */
  get pendingCount(): number {
    return this.pendingRequests.size
  }

  /**
   * Spawns the worker thread, establishes communication, and opens the SQLite database.
   *
   * @param storagePath - Root path owning the `graph/` directory.
   * @param options - Optional runtime configuration and max pending operations settings.
   * @returns Promise resolving when the worker has successfully opened and initialized the database.
   * @throws {StoreWorkerError} If the worker is already faulted.
   */
  async open(storagePath: string, options?: SQLiteGraphStoreOptions): Promise<void> {
    if (this.isOpen) return
    if (this.isFaulted) {
      throw new StoreWorkerError('SQLite worker is faulted and cannot be reopened')
    }

    this.maxPendingOperations = options?.maxPendingOperations ?? 256
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
    this.isOpenState = true

    try {
      await this.sendRequest('open', {
        storagePath,
        runtime: options?.runtime,
      })
    } catch (error) {
      await this.close()
      throw error
    }
  }

  /**
   * Closes the database connection in the worker and terminates the worker thread.
   *
   * @returns Promise resolving when the worker has shut down cleanly.
   */
  async close(): Promise<void> {
    if (!this.isOpenState || this.isClosing || !this.worker) {
      return
    }

    this.isClosing = true
    try {
      await this.sendRequest('close', {})
    } catch {
      // Ignore errors when sending close to worker
    } finally {
      if (this.worker) {
        try {
          await this.worker.terminate()
        } catch {
          // Ignore termination errors
        }
        this.worker = undefined
      }
      this.isOpenState = false
      this.isClosing = false

      // Reject any lingering requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new StoreNotOpenError())
      }
      this.pendingRequests.clear()
    }
  }

  /**
   * Sends an asynchronous RPC request to the SQLite worker thread.
   *
   * @param op - Worker operation identifier.
   * @param payload - Serializable request payload.
   * @param onProgress - Optional callback for stage progress events during execution.
   * @returns Promise resolving with the typed result returned by the worker.
   * @throws {StoreWorkerError} If the worker has faulted.
   * @throws {StoreNotOpenError} If the store is not open or is currently closing.
   * @throws {StoreOverloadError} If the pending operations limit has been exceeded.
   */
  async sendRequest<TResult = unknown, TPayload = unknown>(
    op: SQLiteWorkerOperation,
    payload: TPayload,
    onProgress?: (stage: string) => void,
  ): Promise<TResult> {
    if (this.isFaulted) {
      throw new StoreWorkerError('SQLite worker has terminated unexpectedly')
    }
    if (!this.isOpenState || this.isClosing || !this.worker) {
      throw new StoreNotOpenError()
    }
    if (this.pendingRequests.size >= this.maxPendingOperations) {
      throw new StoreOverloadError(
        `SQLite operation queue overloaded (pending: ${this.pendingRequests.size} >= max: ${this.maxPendingOperations})`,
      )
    }

    const id = this.nextRequestId++
    const request: SQLiteWorkerRequest<TPayload> = { id, op, payload }

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (val: unknown) => resolve(val as TResult),
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
    if (this.isClosing) return
    this.faultWorker(new Error(`Worker thread exited unexpectedly with code ${code}`))
  }

  /**
   * Transitions the worker client into a faulted state and rejects all in-flight pending operations.
   *
   * @param error - Root cause error triggering the fault.
   */
  private faultWorker(error: Error): void {
    this.isFaulted = true
    this.isOpenState = false
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
