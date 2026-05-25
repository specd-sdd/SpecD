/** Structured failure returned on IPC responses. */
export interface IpcErrorEnvelope {
  readonly message: string
  readonly code?: string
  readonly status?: number
  readonly detail?: string
}

/** Renderer → main IPC request envelope. */
export interface IpcRequestEnvelope<TPayload = unknown> {
  readonly id: string
  readonly method: string
  readonly payload?: TPayload
}

/** Main → renderer IPC response envelope. */
export interface IpcResponseEnvelope<TResult = unknown> {
  readonly id: string
  readonly ok: boolean
  readonly result?: TResult
  readonly error?: IpcErrorEnvelope
}

/**
 * Creates a correlated request envelope.
 *
 * @param method - Port method name mirrored from {@link SpecdDataPort}.
 * @param payload - Optional arguments.
 * @param id - Correlation id; generated when omitted.
 * @returns Request envelope.
 */
export function createIpcRequest<TPayload>(
  method: string,
  payload?: TPayload,
  id: string = crypto.randomUUID(),
): IpcRequestEnvelope<TPayload> {
  return payload === undefined ? { id, method } : { id, method, payload }
}

/**
 * Creates a successful response envelope echoing the request id.
 *
 * @param id - Correlation id from the request.
 * @param result - Operation result.
 * @returns Success response envelope.
 */
export function createIpcSuccess<TResult>(
  id: string,
  result: TResult,
): IpcResponseEnvelope<TResult> {
  return { id, ok: true, result }
}

/**
 * Creates a failure response envelope echoing the request id.
 *
 * @param id - Correlation id from the request.
 * @param error - Structured error for UI hooks.
 * @returns Failure response envelope.
 */
export function createIpcFailure(
  id: string,
  error: IpcErrorEnvelope,
): IpcResponseEnvelope<never> {
  return { id, ok: false, error }
}
