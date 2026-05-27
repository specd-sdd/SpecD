import { describe, expect, it } from 'vitest'
import { apiJson } from './helpers/http-client.js'

describe('API meta', () => {
  it('given api server, when GET /health, then returns ok', async () => {
    const { res, data } = await apiJson<{ status: string; auth: { type: string } }>('/health')
    expect(res.ok).toBe(true)
    expect(data.status).toBe('ok')
    expect(data.auth.type).toBe('disabled')
  })

  it('given api server, when GET /documentation/json, then returns OpenAPI document', async () => {
    const { res, data } = await apiJson<Record<string, unknown>>('/documentation/json')
    expect(res.ok).toBe(true)
    expect(data.openapi).toBe('3.1.0')
    expect(data.info).toBeDefined()
    type OpenApiPathItem = { get?: unknown; post?: unknown }
    const paths = data.paths as Record<string, OpenApiPathItem | undefined>
    expect(Object.keys(paths).length).toBeGreaterThan(40)
    const keys = Object.keys(paths)
    const has = (suffix: string) => keys.some((k) => k === suffix || k.endsWith(suffix))
    expect(has('/health')).toBe(true)
    expect(has('/changes')).toBe(true)
    expect(has('/graph/search')).toBe(true)
    expect(has('/changes/{name}/preview')).toBe(true)
    expect(has('/changes/{name}/artifacts/{filename}/outline')).toBe(true)
    const components = data.components as { schemas?: Record<string, unknown> } | undefined
    expect(Object.keys(components?.schemas ?? {}).length).toBeGreaterThan(40)
  })
})
