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
    const body = await expectProblem('/graph/search', undefined, 400)
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given a query, when GET /graph/search, then returns symbol and spec hits', async () => {
    const { res, data } = await apiJson<{
      symbols: Array<{
        workspace: string
        symbol: {
          id: string
          workspace: string
          workspaceRelativePath: string
          projectRelativePath: string
          name: string
          kind: string
          line: number
          column: number
        }
      }>
      specs: unknown[]
    }>(
      '/graph/search?q=kernel&symbols=true&limit=5',
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.symbols)).toBe(true)
    expect(Array.isArray(data.specs)).toBe(true)
    const hit = data.symbols[0]
    if (hit !== undefined) {
      expect(hit.workspace.length).toBeGreaterThan(0)
      expect(hit.symbol.id.length).toBeGreaterThan(0)
      expect(hit.symbol.workspaceRelativePath.length).toBeGreaterThan(0)
      expect(hit.symbol.projectRelativePath.length).toBeGreaterThan(0)
    }
  })

  it('given missing symbol file and spec, when GET /graph/impact, then returns problem+json', async () => {
    const body = await expectProblem('/graph/impact', undefined, 400)
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given invalid direction, when GET /graph/impact, then returns problem+json', async () => {
    const body = await expectProblem(
      '/graph/impact?symbol=core:test&direction=sideways',
      undefined,
      400,
    )
    expect(body.code).toBe('INVALID_REQUEST')
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
    expect(Array.isArray(data.specs)).toBe(true)
    expect(Array.isArray(data.files)).toBe(true)
  })

  it('given a spec query, when GET /graph/impact, then returns spec impact DTO', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const specId = `${workspace}:${specPath}`
    const { res, data } = await apiJson<{
      target: string
      direction: string
      specs: string[]
      symbols: unknown[]
      files: unknown[]
    }>(
      `/graph/impact?spec=${encodeURIComponent(specId)}&direction=dependents&depth=1`,
    )
    expect(res.ok).toBe(true)
    expect(data.target).toBe(specId)
    expect(data.direction).toBe('downstream')
    expect(Array.isArray(data.specs)).toBe(true)
    expect(Array.isArray(data.symbols)).toBe(true)
    expect(Array.isArray(data.files)).toBe(true)
  })

  it('given api server, when GET /graph/hotspots, then returns hotspot ranking', async () => {
    const { res, data } = await apiJson<{ entries: unknown[]; totalSymbols: number }>(
      '/graph/hotspots?limit=5',
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.entries)).toBe(true)
    expect(data.totalSymbols).toBeGreaterThanOrEqual(0)
  })

  it('given force flag, when POST /graph/index, then returns indexing summary dto', async () => {
    const { res, data } = await apiJson<{
      fullRebuildReason: string | null
      workspaces: Array<{ name: string }>
    }>('/graph/index', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.workspaces)).toBe(true)
    expect(data.workspaces.length).toBeGreaterThan(0)
    expect(typeof data.fullRebuildReason === 'string' || data.fullRebuildReason === null).toBe(true)
  })

  it('given unsupported workspaces property, when POST /graph/index, then returns problem+json', async () => {
    const body = await expectProblem(
      '/graph/index',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaces: ['api', 'client'] }),
      },
      400,
    )
    expect(body.status).toBe(400)
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given a known spec, when GET /graph/specs/:ws/*, then returns coverage', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<{
      specId: string
      files: Array<{
        id: string
        workspace: string
        workspaceRelativePath: string
        projectRelativePath: string
      }>
      symbols: Array<{
        id: string
        workspace: string
        workspaceRelativePath: string
        projectRelativePath: string
        name: string
        kind: string
        line: number
        column: number
      }>
    }>(
      `/graph/specs/${workspace}/${specPath}`,
    )
    expect(res.ok).toBe(true)
    expect(data.specId).toBe(`${workspace}:${specPath}`)
    expect(Array.isArray(data.files)).toBe(true)
    expect(Array.isArray(data.symbols)).toBe(true)
    const file = data.files[0]
    if (file !== undefined) {
      expect(file.id.length).toBeGreaterThan(0)
      expect(file.workspace).toBe(workspace)
      expect(file.workspaceRelativePath.length).toBeGreaterThan(0)
      expect(file.projectRelativePath.length).toBeGreaterThan(0)
    }
    const symbol = data.symbols[0]
    if (symbol !== undefined) {
      expect(symbol.id.length).toBeGreaterThan(0)
      expect(symbol.workspaceRelativePath.length).toBeGreaterThan(0)
      expect(symbol.projectRelativePath.length).toBeGreaterThan(0)
    }
  })

  it('given an unknown spec, when GET /graph/specs/:ws/*, then returns problem+json', async () => {
    const body = await expectProblem('/graph/specs/default/does-not-exist', undefined, 404)
    expect(body.code).toBe('SPEC_NOT_FOUND')
  })

  it('given an active change, when GET /graph/changes/:name, then returns per-spec graph view', async () => {
    const { activeChangeName } = await loadProjectSamples()
    if (activeChangeName === null) {
      return
    }
    const { res, data } = await apiJson<{
      changeName: string
      specs: Array<{
        specId: string
        coveredFiles: Array<{ projectRelativePath: string }>
        coveredSymbols: Array<{ projectRelativePath: string }>
      }>
    }>(
      `/graph/changes/${encodeURIComponent(activeChangeName)}`,
    )
    expect(res.ok).toBe(true)
    expect(data.changeName).toBe(activeChangeName)
    expect(Array.isArray(data.specs)).toBe(true)
  })
})
