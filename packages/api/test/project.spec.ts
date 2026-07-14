import { describe, expect, it } from 'vitest'
import { apiJson, expectProblem } from './helpers/http-client.js'

describe('Project API', () => {
  it('given api server, when GET /project, then returns project metadata', async () => {
    const { res, data } = await apiJson<{ name: string; projectRoot: string }>('/project')
    expect(res.ok).toBe(true)
    expect(data.name.length).toBeGreaterThan(0)
    expect(data.projectRoot.length).toBeGreaterThan(0)
  })

  it('given api server, when GET /project/status, then returns counts and graph summary', async () => {
    const { res, data } = await apiJson<{
      activeChanges: number
      drafts: number
      discarded: number
      archived: number
      specsByWorkspace: Record<string, number>
      approvals?: { specEnabled: boolean; signoffEnabled: boolean }
      auth: { type: string }
      graph?: { fileCount?: number | null; warnings?: Array<{ type: string }> }
    }>('/project/status')
    expect(res.ok).toBe(true)
    expect(data.activeChanges).toBeGreaterThanOrEqual(0)
    expect(data.drafts).toBeGreaterThanOrEqual(0)
    expect(data.discarded).toBeGreaterThanOrEqual(0)
    expect(data.archived).toBeGreaterThanOrEqual(0)
    expect(Object.keys(data.specsByWorkspace).length).toBeGreaterThan(0)
    expect(data.auth.type).toBe('disabled')
    expect(data.approvals).toEqual({ specEnabled: false, signoffEnabled: false })
    expect(data.graph).toBeDefined()
    expect(Array.isArray(data.graph?.warnings ?? [])).toBe(true)
  })

  it('given api server, when GET /project/context, then returns compiled content', async () => {
    const { res, data } = await apiJson<{ content: string; warnings: string[] }>('/project/context')
    expect(res.ok).toBe(true)
    expect(typeof data.content).toBe('string')
    expect(Array.isArray(data.warnings)).toBe(true)
  })

  it('given malformed depth, when GET /project/context, then returns problem+json', async () => {
    const body = await expectProblem('/project/context?depth=zero', undefined, 400)
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('given api server, when GET /project/schema, then returns schema info', async () => {
    const { res, data } = await apiJson<{ name: string; version: number; artifacts: unknown[] }>(
      '/project/schema',
    )
    expect(res.ok).toBe(true)
    expect(data.name.length).toBeGreaterThan(0)
    expect(typeof data.version).toBe('number')
    expect(Array.isArray(data.artifacts)).toBe(true)
  })

  it('given api server, when POST /project/schema/validate, then returns validation result', async () => {
    const { res, data } = await apiJson<{ valid: boolean; errors: unknown[]; warnings: unknown[] }>(
      '/project/schema/validate',
      { method: 'POST' },
    )
    expect(res.ok).toBe(true)
    expect(typeof data.valid).toBe('boolean')
    expect(Array.isArray(data.errors)).toBe(true)
    expect(Array.isArray(data.warnings)).toBe(true)
  })
})
