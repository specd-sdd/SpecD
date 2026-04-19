import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../../ports/spec-repository.js'

/**
 * Resolves a relative spec reference to a canonical spec id.
 */
export type SpecReferenceResolver = (candidate: string) => Promise<string | null>

/**
 * Logical workspace route metadata used for cross-workspace resolution.
 */
export interface SpecWorkspaceRoute {
  readonly workspace: string
  readonly prefixSegments: readonly string[]
}

/**
 * Input required to build a repository-backed spec reference resolver.
 */
export interface CreateSpecReferenceResolverInput {
  readonly originWorkspace: string
  readonly originSpecPath: SpecPath
  readonly repositories: ReadonlyMap<string, SpecRepository>
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
}

/**
 * Removes any trailing fragment from a spec reference candidate.
 *
 * @param candidate - Raw reference candidate
 * @returns Candidate without `#...` fragment
 */
function stripFragment(candidate: string): string {
  const hashIndex = candidate.indexOf('#')
  return hashIndex >= 0 ? candidate.slice(0, hashIndex) : candidate
}

/**
 * Normalizes a spec id to canonical `workspace:cap/path` form.
 *
 * @param specId - Spec id to normalize
 * @returns Canonical spec id
 */
function normalizeSpecId(specId: string): string {
  const { workspace, capPath } = parseSpecId(specId)
  return `${workspace}:${SpecPath.parse(capPath).toString()}`
}

/**
 * Checks whether an array starts with the provided segment prefix.
 *
 * @param value - Full segment array
 * @param prefix - Prefix to match
 * @returns `true` when `value` starts with `prefix`
 */
function startsWithSegments(value: readonly string[], prefix: readonly string[]): boolean {
  if (prefix.length === 0 || value.length < prefix.length) return false
  return prefix.every((segment, index) => value[index] === segment)
}

/**
 * Resolves a cross-workspace hint into an existing canonical spec id.
 *
 * @param hint - Hint segments returned by `resolveFromPath`
 * @param routes - Workspace routing metadata
 * @param repositories - Spec repositories keyed by workspace
 * @returns Canonical spec id when resolvable, otherwise `null`
 */
async function resolveCrossWorkspaceHint(
  hint: readonly string[],
  routes: readonly SpecWorkspaceRoute[],
  repositories: ReadonlyMap<string, SpecRepository>,
): Promise<string | null> {
  for (const route of routes) {
    const repo = repositories.get(route.workspace)
    if (repo === undefined) continue

    let candidatePathSegments: readonly string[] | undefined

    if (route.prefixSegments.length > 0) {
      if (!startsWithSegments(hint, route.prefixSegments)) {
        continue
      }
      candidatePathSegments = hint
    } else {
      if (hint[0] !== route.workspace || hint.length <= 1) {
        continue
      }
      candidatePathSegments = hint.slice(1)
    }

    const candidatePathRaw = candidatePathSegments.join('/')
    let candidatePath: SpecPath
    try {
      candidatePath = SpecPath.parse(candidatePathRaw)
    } catch {
      continue
    }

    const spec = await repo.get(candidatePath)
    if (spec === null) continue

    return `${route.workspace}:${candidatePath.toString()}`
  }

  return null
}

/**
 * Creates a resolver that normalizes relative spec references using repository
 * `resolveFromPath` plus logical workspace routes for cross-workspace hints.
 *
 * @param input - Resolver construction input
 * @returns Async resolver returning canonical spec ids, or null
 */
export function createSpecReferenceResolver(
  input: CreateSpecReferenceResolverInput,
): SpecReferenceResolver {
  const originRepo = input.repositories.get(input.originWorkspace)

  return async (candidate: string): Promise<string | null> => {
    if (originRepo === undefined) return null

    const normalizedCandidate = stripFragment(candidate).trim()
    if (normalizedCandidate.length === 0) return null

    const resolved = await originRepo.resolveFromPath(normalizedCandidate, input.originSpecPath)
    if (resolved === null) return null

    if ('specId' in resolved) {
      return normalizeSpecId(resolved.specId)
    }

    const hint = resolved.crossWorkspaceHint
    if (hint.length === 0) return null

    return await resolveCrossWorkspaceHint(hint, input.workspaceRoutes, input.repositories)
  }
}
