import { type DiscoveredSpec, type SpecNode, type WorkspaceIndexTarget } from '@specd/code-graph'
import {
  createVcsAdapter,
  NodeContentHasher,
  type Kernel,
  type SpecdConfig,
  type SpecRepository,
} from '@specd/core'

const hasher = new NodeContentHasher()

/**
 *
 * @param codeRoot
 */
async function resolveRepoRoot(codeRoot: string): Promise<string | undefined> {
  try {
    const vcs = await createVcsAdapter(codeRoot)
    return await vcs.rootDir()
  } catch {
    return undefined
  }
}

/**
 *
 * @param repo
 * @param workspace
 */
async function resolveSpecsFromRepo(
  repo: SpecRepository | undefined,
  workspace: string,
): Promise<DiscoveredSpec[]> {
  if (repo === undefined) {
    return []
  }
  const specs = await repo.list()
  const results: DiscoveredSpec[] = []
  for (const spec of specs) {
    const specId = `${spec.workspace}:${spec.name.toString()}`
    let title = specId
    let description = ''
    let dependsOn: string[] = []
    const metadata = await repo.metadata(spec)
    if (metadata !== null) {
      title = metadata.title ?? specId
      description = metadata.description ?? ''
      dependsOn = metadata.dependsOn ?? []
    }
    const ordered: string[] = []
    const idx = spec.filenames.indexOf('spec.md')
    if (idx !== -1) {
      ordered.push('spec.md')
    }
    ordered.push(...spec.filenames.filter((f) => f !== 'spec.md').sort())
    const parts: string[] = []
    for (const filename of ordered) {
      const artifact = await repo.artifact(spec, filename)
      if (artifact !== null) {
        parts.push(artifact.content)
      }
    }
    const content = parts.join('\0')
    const contentHash = hasher.hash(content)
    const node: SpecNode = {
      specId,
      workspace,
      path: spec.name.toString(),
      title,
      description,
      content,
      contentHash,
      dependsOn,
    }
    results.push({ spec: node, contentHash })
  }
  return results
}

/**
 * Builds workspace index targets for {@link CodeGraphProvider.index}.
 *
 * @param config - Active project configuration
 * @param kernel - Wired kernel with spec repositories
 * @param workspaceFilter - Optional workspace-name filter
 */
export async function buildWorkspaceIndexTargets(
  config: SpecdConfig,
  kernel: Kernel,
  workspaceFilter?: string | readonly string[],
): Promise<WorkspaceIndexTarget[]> {
  let workspaces = [...config.workspaces]
  if (workspaceFilter !== undefined) {
    const allowed = new Set(Array.isArray(workspaceFilter) ? workspaceFilter : [workspaceFilter])
    workspaces = workspaces.filter((ws) => allowed.has(ws.name))
  }
  const targets: WorkspaceIndexTarget[] = []
  for (const ws of workspaces) {
    const repoRoot = await resolveRepoRoot(ws.codeRoot)
    targets.push({
      name: ws.name,
      codeRoot: ws.codeRoot,
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      ...(ws.graph?.excludePaths !== undefined ? { excludePaths: ws.graph.excludePaths } : {}),
      ...(ws.graph?.respectGitignore !== undefined
        ? { respectGitignore: ws.graph.respectGitignore }
        : {}),
      specs: () => resolveSpecsFromRepo(kernel.specs.repos.get(ws.name), ws.name),
    })
  }
  return targets
}
