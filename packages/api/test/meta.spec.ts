import { describe, expect, it } from 'vitest'
import { apiJson } from './helpers/http-client.js'

describe('API meta', () => {
  it('given api server, when GET /health, then returns ok', async () => {
    const { res, data } = await apiJson<{ status: string; auth: { type: string } }>('/health')
    expect(res.ok).toBe(true)
    expect(data.status).toBe('ok')
    expect(data.auth.type).toBe('disabled')
  })

  it('given api server, when GET /openapi.json, then returns OpenAPI document', async () => {
    const { res, data } = await apiJson<Record<string, unknown>>('/openapi.json')
    expect(res.ok).toBe(true)
    expect(data.openapi).toBe('3.1.0')
    expect(data.info).toBeDefined()
    const components = data.components as { schemas?: Record<string, unknown> }
    expect(components.schemas?.ChangeSummaryDto).toBeDefined()
    expect(components.schemas?.ProblemJson).toBeDefined()
    type OpenApiPathItem = { get?: unknown; post?: unknown }
    const paths = data.paths as Record<string, OpenApiPathItem | undefined>
    expect(Object.keys(paths).length).toBeGreaterThan(40)
    expect(paths['/health']?.get).toBeDefined()
    expect(paths['/changes']?.get).toBeDefined()
    expect(paths['/changes']?.post).toBeDefined()
    expect(paths['/graph/search']?.get).toBeDefined()
    expect(paths['/changes/{name}/preview']?.post).toBeDefined()
    expect(paths['/changes/{name}/artifacts/{filename}/outline']?.post).toBeDefined()
    expect(paths['/workspaces/{ws}/specs/{specPath}/outline']?.post).toBeDefined()
  })
})
