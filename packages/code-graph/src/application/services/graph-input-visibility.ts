import { isAbsolute, join, relative, resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { type WorkspaceIndexTarget } from '../../domain/value-objects/index-options.js'
import { type ProjectGraphConfig } from '../../domain/value-objects/index-options.js'
import { type IndexedInputObservation } from '../../domain/value-objects/indexed-input-freshness.js'
import { discoverFiles } from '../use-cases/discover-files.js'
import { resolveEffectiveGraphConfig } from '../use-cases/_shared/resolve-effective-graph-config.js'

/** Current graph-visible filesystem membership and explicit input-channel boundaries. */
export interface GraphInputVisibilitySnapshot {
  readonly currentInputs: ReadonlyMap<string, ReadonlyMap<string, string>>
  isVisible(workspace: string, configRelativePath: string): boolean
}

/**
 * Builds the graph-input visibility view shared by indexing freshness paths.
 * @param projectRoot - Configured project root.
 * @param workspaces - Configured workspace targets.
 * @param graphConfig - Raw graph discovery configuration.
 * @param vcsRoot - Optional VCS root for hierarchical ignore evaluation.
 * @param observations - Persisted inputs that preserve visibility for deleted paths.
 * @returns Current membership plus a visibility predicate for VCS candidates.
 */
export function buildGraphInputVisibilitySnapshot(
  projectRoot: string,
  workspaces: readonly WorkspaceIndexTarget[],
  graphConfig: ProjectGraphConfig,
  vcsRoot: string | null,
  observations: readonly IndexedInputObservation[],
): GraphInputVisibilitySnapshot {
  const effective = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  const currentInputs = new Map<string, Map<string, string>>()
  const persistedInputs = new Map<string, Set<string>>()
  const specRoots = new Map<string, string>()

  for (const observation of observations) {
    if (observation.inputKind !== 'filesystem') continue
    const inputs = persistedInputs.get(observation.workspace) ?? new Set<string>()
    inputs.add(normalizePortablePath(observation.inputLocator))
    persistedInputs.set(observation.workspace, inputs)
  }

  for (const workspace of workspaces) {
    const workspaceInputs = new Map<string, string>()
    const workspaceGraph = effective.workspaces.get(workspace.name)
    for (const relativePath of discoverFiles(workspace.codeRoot, undefined, {
      respectGitignore: workspaceGraph?.respectGitignore ?? true,
      vcsRoot,
      ...(workspaceGraph?.excludePaths !== undefined
        ? { excludePaths: workspaceGraph.excludePaths }
        : {}),
      ...(workspaceGraph?.allowedPaths !== undefined
        ? { allowedPaths: workspaceGraph.allowedPaths }
        : {}),
    })) {
      const absolutePath = join(workspace.codeRoot, relativePath)
      workspaceInputs.set(toProjectRelative(projectRoot, absolutePath), absolutePath)
    }
    currentInputs.set(workspace.name, workspaceInputs)

    const specsPath = workspace.specRepo.specsPath
    if (specsPath !== undefined) {
      const relativeSpecsPath = toProjectRelative(projectRoot, specsPath)
      if (!relativeSpecsPath.startsWith('../')) specRoots.set(workspace.name, relativeSpecsPath)
    }
  }

  if (effective.includePaths.length > 0) {
    const rootInputs = new Map<string, string>()
    for (const relativePath of discoverFiles(projectRoot, undefined, {
      allowedPaths: effective.includePaths,
      excludePaths: effective.rootExcludePaths,
      vcsRoot,
    })) {
      const absolutePath = join(projectRoot, relativePath)
      if (workspaces.some((workspace) => isWithin(absolutePath, workspace.codeRoot))) continue
      rootInputs.set(normalizePortablePath(relativePath), absolutePath)
    }
    currentInputs.set('root', rootInputs)
  }

  return {
    currentInputs,
    isVisible(workspace: string, configRelativePath: string): boolean {
      const normalized = normalizePortablePath(configRelativePath)
      if (currentInputs.get(workspace)?.has(normalized) === true) return true
      if (persistedInputs.get(workspace)?.has(normalized) === true) return true
      const specRoot = specRoots.get(workspace)
      return (
        specRoot !== undefined && (normalized === specRoot || normalized.startsWith(`${specRoot}/`))
      )
    },
  }
}

/**
 * Rebases one repository-relative path to the configured project without permitting escape.
 * @param repositoryRoot - Absolute VCS root.
 * @param projectRoot - Absolute configured project root.
 * @param repositoryPath - Portable repository-relative candidate.
 * @returns Project-relative portable path, or null when outside the project/repository.
 */
export function rebaseRepositoryPath(
  repositoryRoot: string,
  projectRoot: string,
  repositoryPath: string,
): string | null {
  if (repositoryPath.length === 0 || isAbsolute(repositoryPath)) return null
  const canonicalRepositoryRoot = canonicalRoot(repositoryRoot)
  const canonicalProjectRoot = canonicalRoot(projectRoot)
  const absolutePath = resolve(canonicalRepositoryRoot, repositoryPath.replaceAll('\\', '/'))
  if (
    !isWithin(absolutePath, canonicalRepositoryRoot) ||
    !isWithin(absolutePath, canonicalProjectRoot)
  ) {
    return null
  }
  return toProjectRelative(canonicalProjectRoot, absolutePath)
}

/**
 * Resolves symlinked roots while retaining a deterministic fallback for unavailable paths.
 * @param root - Root path to canonicalize.
 * @returns Canonical or resolved absolute root.
 */
function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root)
  } catch {
    return resolve(root)
  }
}

/**
 * Converts an absolute path to a portable project-relative locator.
 * @param projectRoot - Absolute project root.
 * @param absolutePath - Absolute input path.
 * @returns Portable project-relative locator.
 */
function toProjectRelative(projectRoot: string, absolutePath: string): string {
  return normalizePortablePath(relative(resolve(projectRoot), resolve(absolutePath)))
}

/**
 * Normalizes a path for portable persisted comparison.
 * @param filePath - Path to normalize.
 * @returns Portable normalized path.
 */
function normalizePortablePath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '')
  return normalized === '.' ? '' : normalized
}

/**
 * Returns whether a resolved path remains confined to a root.
 * @param filePath - Path to test.
 * @param root - Confining root.
 * @returns Whether the path is inside the root.
 */
function isWithin(filePath: string, root: string): boolean {
  const relativePath = relative(resolve(root), resolve(filePath)).replaceAll('\\', '/')
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith('../'))
}
