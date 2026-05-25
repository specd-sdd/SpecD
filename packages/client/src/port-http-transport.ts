/** Low-level HTTP request descriptor. */
export interface HttpRequestOptions {
  readonly method: string
  readonly path: string
  readonly query?: Record<string, string | number | boolean | undefined>
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

/** Non-2xx HTTP response surfaced to problem+json adapters. */
export class HttpTransportError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.name = 'HttpTransportError'
    this.status = status
    this.body = body
  }
}

/** JSON HTTP transport used by remote and test adapters. */
export interface HttpTransport {
  request<T>(options: HttpRequestOptions): Promise<T>
}

export interface CreateHttpTransportOptions {
  /** API origin without trailing slash (may or may not include `/v1`). */
  readonly apiBaseUrl: string
  /** Extra headers merged on every request. */
  readonly headers?: Readonly<Record<string, string>>
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function buildUrl(base: string, path: string, query?: HttpRequestOptions['query']): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${normalizedPath}`)
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

/**
 * Normalizes `apiBaseUrl` and prefixes relative paths with `/v1`.
 *
 * @param apiBaseUrl - Configured API origin.
 * @returns Base URL ending at `/v1`.
 */
export function normalizeApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = trimTrailingSlash(apiBaseUrl)
  if (trimmed.endsWith('/v1')) {
    return trimmed
  }
  return `${trimmed}/v1`
}

/**
 * Creates a fetch-based {@link HttpTransport}.
 *
 * @param options - Transport configuration.
 * @returns Transport instance.
 */
export function createHttpTransport(options: CreateHttpTransportOptions): HttpTransport {
  const base = normalizeApiBaseUrl(options.apiBaseUrl)
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  return {
    async request<T>(req: HttpRequestOptions): Promise<T> {
      const headers = { ...defaultHeaders, ...req.headers }
      const init: RequestInit = {
        method: req.method,
        headers,
      }
      if (req.body !== undefined) {
        headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(req.body)
      }
      if (req.signal !== undefined) {
        init.signal = req.signal
      }
      const response = await fetch(buildUrl(base, req.path, req.query), init)
      const contentType = response.headers.get('content-type') ?? ''
      const isJson =
        contentType.includes('application/json') ||
        contentType.includes('application/problem+json')
      const text = await response.text()
      if (!response.ok) {
        const body: unknown =
          isJson && text.length > 0 ? (JSON.parse(text) as unknown) : text
        throw new HttpTransportError(response.status, body)
      }
      if (text.length === 0) {
        return undefined as T
      }
      if (isJson) {
        return JSON.parse(text) as T
      }
      return text as T
    },
  }
}
