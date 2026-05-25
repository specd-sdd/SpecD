import { expect } from 'vitest'
import { getApiBaseUrl } from './api-test-server.js'

export interface ProblemJsonBody {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly code: string
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return fetch(`${getApiBaseUrl()}${normalized}`, init)
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<{ res: Response; data: T }> {
  const res = await apiFetch(path, {
    headers: { accept: 'application/json', ...init?.headers },
    ...init,
  })
  const data = (await res.json()) as T
  return { res, data }
}

export async function expectProblem(
  path: string,
  init: RequestInit | undefined,
  expectedStatus: number,
): Promise<ProblemJsonBody> {
  const res = await apiFetch(path, init)
  expect(res.status).toBe(expectedStatus)
  expect(res.headers.get('content-type')).toContain('application/problem+json')
  return (await res.json()) as ProblemJsonBody
}
