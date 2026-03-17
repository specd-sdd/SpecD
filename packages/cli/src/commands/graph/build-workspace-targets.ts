import { createHash } from 'node:crypto'
import { type SpecdConfig, type Kernel, type SpecRepository, createVcsAdapter } from '@specd/core'
import { type WorkspaceIndexTarget, type DiscoveredSpec } from '@specd/code-graph'

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
 * 2. Loads `.specd-metadata.yaml` for title, description, and dependencies
 * 3. Loads remaining artifacts for content and hashing (excluding metadata)
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
    const metadata = await repo.artifact(spec, '.specd-metadata.yaml')
    if (metadata) {
      title = extractMetadataField(metadata.content, 'title') ?? specId
      description = extractMetadataField(metadata.content, 'description') ?? ''
      dependsOn = extractDependsOnFromMetadata(metadata.content)
    }

    // Build content: all artifacts EXCEPT .specd-metadata.yaml
    // spec.md first if present, then rest alphabetically
    const contentFilenames = spec.filenames.filter((f) => f !== '.specd-metadata.yaml')
    const ordered: string[] = []
    const idx = contentFilenames.indexOf('spec.md')
    if (idx !== -1) {
      ordered.push('spec.md')
    }
    ordered.push(...contentFilenames.filter((f) => f !== 'spec.md').sort())

    let content = ''
    for (const filename of ordered) {
      const artifact = await repo.artifact(spec, filename)
      if (artifact) {
        content += artifact.content
      }
    }

    if (content === '' && !metadata) continue

    const contentHash = computeHash(content)

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

/**
 * Extracts a top-level scalar field from a YAML metadata file.
 * @param content - The raw YAML content.
 * @param field - The field name to extract (e.g. `title`, `description`).
 * @returns The field value, or undefined if not found.
 */
function extractMetadataField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  if (!match?.[1]) return undefined
  let value = match[1].trim()
  // Strip surrounding quotes (YAML scalar quoting)
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1)
  }
  return value
}

/**
 * Computes a SHA-256 content hash.
 * @param content - The content to hash.
 * @returns The hex hash string.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Parses the dependsOn list from a .specd-metadata.yaml file.
 * @param metadataContent - The raw YAML metadata content.
 * @returns An array of dependency spec identifiers.
 */
function extractDependsOnFromMetadata(metadataContent: string): string[] {
  const deps: string[] = []
  const lines = metadataContent.split('\n')
  let inDependsOn = false

  for (const line of lines) {
    const headerMatch = line.match(/^dependsOn\s*:\s*(.*)/)
    if (headerMatch) {
      // Check for inline list syntax: dependsOn: [a, b, c]
      const inlineValue = headerMatch[1]?.trim()
      if (inlineValue && inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
        const items = inlineValue.slice(1, -1).split(',')
        for (const item of items) {
          const trimmed = item.trim()
          if (trimmed) deps.push(trimmed)
        }
        return deps
      }
      inDependsOn = true
      continue
    }
    if (inDependsOn) {
      const match = line.match(/^\s+-\s+(.+)/)
      if (match?.[1]) {
        deps.push(match[1].trim())
      } else if (!line.match(/^\s/)) {
        inDependsOn = false
      }
    }
  }
  return deps
}
