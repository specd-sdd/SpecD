import { describe, expect, it } from 'vitest'
import { apiJson } from './helpers/http-client.js'

describe('API meta', () => {
  it('given api server, when GET /health, then returns ok', async () => {
    const { res, data } = await apiJson<{ status: string; auth: { type: string } }>('/health')
    expect(res.ok).toBe(true)
    expect(data.status).toBe('ok')
    expect(data.auth.type).toBe('disabled')
  })

  it('given api server, when GET /openapi.json, then returns OpenAPI stub', async () => {
    const { res, data } = await apiJson<Record<string, unknown>>('/openapi.json')
    expect(res.ok).toBe(true)
    expect(data.openapi).toBe('3.1.0')
    expect(data.info).toBeDefined()
    const paths = data.paths as Record<string, unknown>
    expect(paths['/changes/{name}/preview']?.post).toBeDefined()
    expect(paths['/changes/{name}/artifacts/{filename}/outline']?.post).toBeDefined()
    expect(paths['/workspaces/{ws}/specs/{specPath}/outline']?.post).toBeDefined()
  })
})
