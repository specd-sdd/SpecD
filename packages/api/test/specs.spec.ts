import { describe, expect, it } from 'vitest'
import { apiJson, expectProblem } from './helpers/http-client.js'
import { loadProjectSamples } from './helpers/project-samples.js'

describe('Specs API', () => {
  it('given missing q, when GET /specs/search, then returns problem+json', async () => {
    const body = await expectProblem('/specs/search', undefined, 400)
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given a query, when GET /specs/search, then returns matches', async () => {
    const { res, data } = await apiJson<Array<{ specId: string; path: string }>>(
      '/specs/search?q=architecture',
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data)).toBe(true)
  })

  it('given a known spec, when GET /workspaces/:ws/specs/:path, then returns spec detail', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<{ specId: string; path: string; title: string }>(
      `/workspaces/${workspace}/specs/${specPath}`,
    )
    expect(res.ok).toBe(true)
    expect(data.specId).toBe(`${workspace}:${specPath}`)
    expect(data.title.length).toBeGreaterThan(0)
  })

  it('given a known spec, when GET .../outline, then returns outline', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<Record<string, unknown>>(
      `/workspaces/${workspace}/specs/${specPath}/outline`,
    )
    expect(res.ok).toBe(true)
    expect(data).toBeDefined()
  })

  it('given a known spec, when GET .../context, then returns context entries', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<{ entries: unknown[]; warnings: string[] }>(
      `/workspaces/${workspace}/specs/${specPath}/context`,
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.entries)).toBe(true)
    expect(Array.isArray(data.warnings)).toBe(true)
  })

  it('given a workspace, when POST /workspaces/:ws/specs/validate, then returns validation summary', async () => {
    const { workspace } = await loadProjectSamples()
    const { res, data } = await apiJson<{
      passed: boolean
      totalSpecs: number
      passedCount: number
      failedCount: number
    }>(`/workspaces/${workspace}/specs/validate`, { method: 'POST' })
    expect(res.ok).toBe(true)
    expect(typeof data.passed).toBe('boolean')
    expect(data.totalSpecs).toBeGreaterThan(0)
  })

  it('given invalid metadata body, when POST .../metadata, then returns problem+json', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const body = await expectProblem(
      `/workspaces/${workspace}/specs/${specPath}/metadata`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      400,
    )
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given unknown spec, when GET /workspaces/:ws/specs/missing/spec, then returns 404', async () => {
    const { workspace } = await loadProjectSamples()
    const body = await expectProblem(
      `/workspaces/${workspace}/specs/__no_such_spec__/spec`,
      undefined,
      404,
    )
    expect(body.code).toBe('SPEC_NOT_FOUND')
  })
})
