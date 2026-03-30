import {
  type SpecdConfig,
  type Kernel,
  type SpecRepository,
  createVcsAdapter,
  NodeContentHasher,
} from '@specd/core'
import { type WorkspaceIndexTarget, type DiscoveredSpec } from '@specd/code-graph'

const hasher = new NodeContentHasher()

/**
 * Resolves the repository root for a given directory using the VCS adapter.
 * Returns undefined if the directory is not inside a repository.
 * @param codeRoot - Absolute path to resolve.
 * @returns The repository root, or undefined.
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
 * Builds workspace index targets from specd config and kernel.
 *
 * For each workspace, creates a target with:
 * - name: workspace name
 * - codeRoot: absolute path to code directory
 * - repoRoot: repository root resolved via VCS adapter
 * - specs: callback that resolves specs via SpecRepository
 *
 * @param config - The specd configuration.
 * @param kernel - The wired kernel instance.
 * @param workspaceFilter - Optional workspace name to filter to a single workspace.
 * @returns Array of workspace index targets.
 */
export async function buildWorkspaceTargets(
  config: SpecdConfig,
  kernel: Kernel,
  workspaceFilter?: string,
): Promise<WorkspaceIndexTarget[]> {
  let workspaces = [...config.workspaces]

  if (workspaceFilter) {
    workspaces = workspaces.filter((ws) => ws.name === workspaceFilter)
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

/**
 * Resolves specs from a SpecRepository into DiscoveredSpec objects.
 *
 * For each spec in the repository:
 * 1. Lists all specs
 * 2. Loads metadata via `repo.metadata()` for title, description, and dependencies
 * 3. Loads artifacts for content and hashing
 * 4. Builds DiscoveredSpec with all fields
 *
 * @param repo - The spec repository for this workspace, or undefined if not found.
 * @param workspace - The workspace name.
 * @returns Array of discovered specs.
 */
async function resolveSpecsFromRepo(
  repo: SpecRepository | undefined,
  workspace: string,
): Promise<DiscoveredSpec[]> {
  if (!repo) return []

  const specs = await repo.list()
  const results: DiscoveredSpec[] = []

  for (const spec of specs) {
    const specId = `${spec.workspace}:${spec.name.toString()}`

    // Read metadata for title, description, dependsOn — no fallback parsing
    let title = specId
    let description = ''
    let dependsOn: string[] = []
    const metadata = await repo.metadata(spec)
    if (metadata) {
      title = metadata.title ?? specId
      description = metadata.description ?? ''
      dependsOn = metadata.dependsOn ?? []
    }

    // Build content: spec.md first if present, then rest alphabetically
    const ordered: string[] = []
    const idx = spec.filenames.indexOf('spec.md')
    if (idx !== -1) {
      ordered.push('spec.md')
    }
    ordered.push(...spec.filenames.filter((f) => f !== 'spec.md').sort())

    const parts: string[] = []
    for (const filename of ordered) {
      const artifact = await repo.artifact(spec, filename)
      if (artifact) {
        parts.push(artifact.content)
      }
    }
    const content = parts.join('\0')

    if (content === '' && metadata === null) continue

    const contentHash = hasher.hash(content)

    results.push({
      spec: {
        specId,
        path: spec.name.toString(),
        title,
        description,
        contentHash,
        content,
        dependsOn,
        workspace,
      },
      contentHash,
    })
  }

  return results
}
