import { apiJson } from './http-client.js'

export interface ProjectSamples {
  readonly workspace: string
  readonly specPath: string
  readonly activeChangeName: string | null
  readonly archivedChangeName: string | null
}

let cached: ProjectSamples | null = null

/** Loads stable sample IDs from the live project (cached per worker). */
export async function loadProjectSamples(): Promise<ProjectSamples> {
  if (cached !== null) {
    return cached
  }

  const { data: workspaces } = await apiJson<Array<{ name: string }>>('/workspaces')
  const workspace = workspaces[0]?.name ?? 'default'

  const { data: specsTree } = await apiJson<{ specs: Array<{ path: string }> }>(
    `/workspaces/${workspace}/specs`,
  )
  const specPath =
    specsTree.specs.find((s) => s.path.includes('architecture'))?.path ??
    specsTree.specs[0]?.path ??
    'architecture/spec'

  const { data: changes } = await apiJson<Array<{ name: string }>>('/changes')
  const { data: archived } = await apiJson<{ items: Array<{ name: string }> }>('/archived-changes')

  cached = {
    workspace,
    specPath,
    activeChangeName: changes[0]?.name ?? null,
    archivedChangeName: archived.items[0]?.name ?? null,
  }
  return cached
}
