import type { HttpRequestOptions, HttpTransport } from './port-http-transport.js'

/**
 * Wraps a transport to inject `Authorization: Bearer` when a token is configured.
 * Omit for embedded `specd ui serve` and desktop local IPC profiles.
 *
 * @param inner - Underlying transport.
 * @param token - Bearer token or empty to pass through unchanged.
 * @returns Wrapped transport.
 */
export function withBearerAuth(inner: HttpTransport, token?: string): HttpTransport {
  if (token === undefined || token.length === 0) {
    return inner
  }
  const authorization = `Bearer ${token}`
  return {
    request<T>(options: HttpRequestOptions) {
      return inner.request<T>({
        ...options,
        headers: { ...options.headers, Authorization: authorization },
      })
    },
  }
}
