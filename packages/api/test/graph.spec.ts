import { describe, expect, it } from 'vitest'
import { apiJson, expectProblem } from './helpers/http-client.js'
import { loadProjectSamples } from './helpers/project-samples.js'

describe('Graph API', () => {
  it('given api server, when GET /graph/status, then returns graph status', async () => {
    const { res, data } = await apiJson<{
      lastIndexedAt: string | null
      fileCount: number | null
      symbolCount: number | null
    }>('/graph/status')
    expect(res.ok).toBe(true)
    expect(data).toBeDefined()
  })

  it('given missing q, when GET /graph/search, then returns problem+json', async () => {
    const body = await expectProblem('/graph/search', undefined, 500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('given a query, when GET /graph/search, then returns symbol and spec hits', async () => {
    const { res, data } = await apiJson<{ symbols: unknown[]; specs: unknown[] }>(
      '/graph/search?q=kernel&symbols=true&limit=5',
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.symbols)).toBe(true)
    expect(Array.isArray(data.specs)).toBe(true)
  })

  it('given missing symbol and file, when GET /graph/impact, then returns problem+json', async () => {
    const body = await expectProblem('/graph/impact', undefined, 500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('given a symbol query, when GET /graph/impact, then returns impact DTO', async () => {
    const search = await apiJson<{
      symbols: Array<{ symbol: { id: string } }>
    }>('/graph/search?q=kernel&symbols=true&limit=1')
    const symbolId = search.data.symbols[0]?.symbol.id
    if (symbolId === undefined) {
      return
    }
    const { res, data } = await apiJson<{ target: string; direction: string; symbols: unknown[] }>(
      `/graph/impact?symbol=${encodeURIComponent(symbolId)}&direction=dependents&depth=1`,
    )
    expect(res.ok).toBe(true)
    expect(data.target).toBe(symbolId)
    expect(Array.isArray(data.symbols)).toBe(true)
  })

  it('given api server, when GET /graph/hotspots, then returns hotspot ranking', async () => {
    const { res, data } = await apiJson<{ entries: unknown[]; totalSymbols: number }>(
      '/graph/hotspots?limit=5',
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.entries)).toBe(true)
    expect(data.totalSymbols).toBeGreaterThanOrEqual(0)
  })

  it('given a known spec, when GET /graph/specs/:ws/*, then returns coverage', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<{ specId: string; files: string[]; symbols: string[] }>(
      `/graph/specs/${workspace}/${specPath}`,
    )
    expect(res.ok).toBe(true)
    expect(data.specId).toBe(`${workspace}:${specPath}`)
    expect(Array.isArray(data.files)).toBe(true)
    expect(Array.isArray(data.symbols)).toBe(true)
  })

  it('given an active change, when GET /graph/changes/:name, then returns per-spec graph view', async () => {
    const { activeChangeName } = await loadProjectSamples()
    if (activeChangeName === null) {
      return
    }
    const { res, data } = await apiJson<{ changeName: string; specs: unknown[] }>(
      `/graph/changes/${encodeURIComponent(activeChangeName)}`,
    )
    expect(res.ok).toBe(true)
    expect(data.changeName).toBe(activeChangeName)
    expect(Array.isArray(data.specs)).toBe(true)
  })
})
