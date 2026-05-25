import { describe, expect, it } from 'vitest'
import { apiJson } from './helpers/http-client.js'
import { loadProjectSamples } from './helpers/project-samples.js'

describe('Workspaces API', () => {
  it('given api server, when GET /workspaces, then lists configured workspaces', async () => {
    const { res, data } = await apiJson<
      Array<{ name: string; specsPath: string; codeRoots: string[] }>
    >('/workspaces')
    expect(res.ok).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]?.name.length).toBeGreaterThan(0)
    expect(data[0]?.specsPath.length).toBeGreaterThan(0)
  })

  it('given a workspace, when GET /workspaces/:ws/specs, then returns spec tree', async () => {
    const { workspace } = await loadProjectSamples()
    const { res, data } = await apiJson<{
      workspace: string
      specs: Array<{ specId: string; path: string }>
    }>(`/workspaces/${workspace}/specs`)
    expect(res.ok).toBe(true)
    expect(data.workspace).toBe(workspace)
    expect(data.specs.length).toBeGreaterThan(0)
    expect(data.specs[0]?.specId).toContain(':')
  })
})
