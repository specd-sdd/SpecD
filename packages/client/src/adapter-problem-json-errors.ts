import {
  ArtifactConflictError,
  SpecdClientError,
  type ProblemJsonBody,
} from './errors/specd-client-error.js'
import type { HttpRequestOptions, HttpTransport } from './port-http-transport.js'

interface TransportErrorPayload {
  readonly status: number
  readonly body: unknown
}

function isTransportError(value: unknown): value is TransportErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as TransportErrorPayload).status === 'number'
  )
}

function toProblem(status: number, body: unknown): ProblemJsonBody {
  if (typeof body === 'object' && body !== null) {
    return { status, ...(body as Record<string, unknown>) }
  }
  return { status, detail: String(body) }
}

/**
 * Maps non-OK HTTP responses to {@link SpecdClientError} / {@link ArtifactConflictError}.
 *
 * @param inner - Underlying transport that throws `{ status, body }` on failure.
 * @returns Wrapped transport.
 */
export function withProblemJsonErrors(inner: HttpTransport): HttpTransport {
  return {
    async request<T>(options: HttpRequestOptions) {
      try {
        return await inner.request<T>(options)
      } catch (err: unknown) {
        if (!isTransportError(err)) {
          throw err
        }
        const problem = toProblem(err.status, err.body)
        if (err.status === 409) {
          throw new ArtifactConflictError(problem)
        }
        throw new SpecdClientError(err.status, problem)
      }
    },
  }
}
