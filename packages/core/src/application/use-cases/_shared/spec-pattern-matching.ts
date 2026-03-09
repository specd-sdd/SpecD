import { type SpecRepository } from '../../ports/spec-repository.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { type ContextWarning } from './context-warning.js'

/** Internal resolved spec reference shared across context use cases. */
export interface ResolvedSpec {
  readonly workspace: string
  readonly capPath: string
}

/**
 * Lists all spec paths matching a glob-like pattern within the appropriate workspace(s).
 *
 * Pattern syntax: `[workspace:]path[/*]`
 * - `*` → all specs (workspace depends on `allWorkspacesOnBareStar`)
 * - `workspace:*` → all specs in named workspace
 * - `prefix/*` → all specs under prefix in `defaultWorkspace`
 * - `workspace:prefix/*` → all specs under prefix in named workspace
 * - `path/name` → exact spec in `defaultWorkspace`
 * - `workspace:path/name` → exact spec in named workspace
 *
 * @param pattern - The include/exclude pattern
 * @param defaultWorkspace - Workspace to use for unqualified paths
 * @param allWorkspacesOnBareStar - When `true`, bare `*` matches all workspaces
 * @param specs - Spec repositories keyed by workspace name
 * @param warnings - Accumulator for advisory warnings
 * @returns Resolved spec references matching the pattern
 */
export async function listMatchingSpecs(
  pattern: string,
  defaultWorkspace: string,
  allWorkspacesOnBareStar: boolean,
  specs: ReadonlyMap<string, SpecRepository>,
  warnings: ContextWarning[],
): Promise<ResolvedSpec[]> {
  let wsName: string
  let pathPat: string

  if (pattern === '*' && allWorkspacesOnBareStar) {
    wsName = 'ALL'
    pathPat = '*'
  } else {
    const parsed = parseSpecId(pattern, defaultWorkspace)
    wsName = parsed.workspace
    pathPat = parsed.capPath
  }

  const workspacesToSearch: Array<{ name: string; repo: SpecRepository }> = []

  if (wsName === 'ALL') {
    for (const [name, repo] of specs) {
      workspacesToSearch.push({ name, repo })
    }
  } else {
    const repo = specs.get(wsName)
    if (repo === undefined) {
      warnings.push({
        type: 'unknown-workspace',
        path: wsName,
        message: `Unknown workspace '${wsName}' in pattern '${pattern}'`,
      })
      return []
    }
    workspacesToSearch.push({ name: wsName, repo })
  }

  const results: ResolvedSpec[] = []
  for (const { name: ws, repo } of workspacesToSearch) {
    const capPaths = await listByPattern(repo, pathPat, ws, pattern, warnings)
    for (const capPath of capPaths) {
      results.push({ workspace: ws, capPath })
    }
  }
  return results
}

/**
 * Returns spec capability paths matching `pathPat` within a single workspace repo.
 *
 * @param repo - The spec repository to search
 * @param pathPat - Path pattern: `'*'`, `'prefix/*'`, or `'exact/path'`
 * @param workspace - Workspace name (for warning messages)
 * @param fullPattern - The original full pattern (for warning messages)
 * @param warnings - Accumulator for advisory warnings
 * @returns Array of matching capability paths
 */
async function listByPattern(
  repo: SpecRepository,
  pathPat: string,
  workspace: string,
  fullPattern: string,
  warnings: ContextWarning[],
): Promise<string[]> {
  if (pathPat === '*') {
    const specs = await repo.list()
    return specs.map((s) => s.name.toString())
  }

  if (pathPat.endsWith('/*')) {
    const prefix = pathPat.slice(0, -2)
    try {
      const prefixPath = SpecPath.parse(prefix)
      const specs = await repo.list(prefixPath)
      return specs.map((s) => s.name.toString())
    } catch {
      warnings.push({
        type: 'missing-spec',
        path: `${workspace}:${pathPat}`,
        message: `Invalid prefix in pattern '${fullPattern}'`,
      })
      return []
    }
  }

  // Exact path
  try {
    const specPath = SpecPath.parse(pathPat)
    const spec = await repo.get(specPath)
    if (spec === null) {
      warnings.push({
        type: 'missing-spec',
        path: `${workspace}:${pathPat}`,
        message: `Spec '${workspace}:${pathPat}' not found`,
      })
      return []
    }
    return [spec.name.toString()]
  } catch {
    warnings.push({
      type: 'missing-spec',
      path: `${workspace}:${pathPat}`,
      message: `Invalid path in pattern '${fullPattern}'`,
    })
    return []
  }
}
