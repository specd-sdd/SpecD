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

    const graphIndexPath = paths[
      keys.find((k) => k === '/v1/graph/index' || k.endsWith('/graph/index')) ?? ''
    ] as { post?: { responses?: Record<string, unknown> } } | undefined
    expect(graphIndexPath?.post?.responses?.['200']).toBeDefined()

    const schemas = components?.schemas ?? {}
    const graphIndexSchema = Object.values(schemas).find((schema) => {
      if (typeof schema !== 'object' || schema === null) {
        return false
      }
      const properties = (schema as { properties?: Record<string, unknown> }).properties
      return (
        properties !== undefined &&
        'filesDiscovered' in properties &&
        'graphFingerprint' in properties &&
        'workspaces' in properties
      )
    }) as { properties?: Record<string, unknown> } | undefined
    expect(graphIndexSchema).toBeDefined()
    expect(graphIndexSchema?.properties?.filesDiscovered).toBeDefined()
    expect(graphIndexSchema?.properties?.workspaces).toBeDefined()
    expect(graphIndexSchema?.properties?.graphFingerprint).toBeDefined()
  })
})
