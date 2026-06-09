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
    const { res, data } = await apiJson<{
      specId: string
      path: string
      title: string
      linkedChanges?: Array<{ name: string; state: string; description?: string }>
    }>(
      `/workspaces/${workspace}/specs/${specPath}`,
    )
    expect(res.ok).toBe(true)
    expect(data.specId).toBe(`${workspace}:${specPath}`)
    expect(data.title.length).toBeGreaterThan(0)
    expect(Array.isArray(data.linkedChanges ?? [])).toBe(true)
    expect(
      (data.linkedChanges ?? []).every(
        (entry) => typeof entry.name === 'string' && typeof entry.state === 'string',
      ),
    ).toBe(true)
  })

  it('given a known spec, when GET .../outline, then returns outline', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<Record<string, unknown>>(
      `/workspaces/${workspace}/specs/${specPath}/outline`,
    )
    expect(res.ok).toBe(true)
    expect(data).toBeDefined()
  })

  it('given a known spec, when POST .../outline with draft body, then returns outline', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<Record<string, unknown> | Array<Record<string, unknown>>>(
      `/workspaces/${workspace}/specs/${specPath}/outline`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'spec.md', content: '# Draft\n' }),
      },
    )
    expect(res.ok).toBe(true)
    expect(data).toBeDefined()
  })

  it('given a known spec, when GET .../context, then returns structured context entries', async () => {
    const { workspace, specPath } = await loadProjectSamples()
    const { res, data } = await apiJson<{
      entries: Array<{
        spec: string
        source: 'root' | 'dependency'
        mode: 'list' | 'summary' | 'full'
        description?: string
        rules?: unknown[]
        constraints?: string[]
        scenarios?: unknown[]
      }>
      warnings: Array<{ type: string; message: string }>
    }>(
      `/workspaces/${workspace}/specs/${specPath}/context`,
    )
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.entries)).toBe(true)
    expect(data.entries[0]?.spec).toBe(`${workspace}:${specPath}`)
    expect(data.entries[0]?.source).toBe('root')
    expect(data.entries[0]?.mode).toBe('full')
    expect(data.entries[0]?.description ?? data.entries[0]?.rules ?? data.entries[0]?.constraints).toBeDefined()
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
