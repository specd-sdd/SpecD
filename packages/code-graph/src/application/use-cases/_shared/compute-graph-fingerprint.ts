import { createHash } from 'node:crypto'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../../domain/value-objects/index-options.js'
import { resolveEffectiveGraphConfig } from './resolve-effective-graph-config.js'

/** Input for computing a graph fingerprint. */
export interface GraphFingerprintInput {
  readonly codeGraphVersion: string
  readonly projectRoot: string
  readonly workspaces: readonly ProjectWorkspace[]
  readonly graphConfig: ProjectGraphConfig
}

/** Normalized workspace representation for fingerprint computation. */
interface NormalizedWorkspaceFingerprint {
  readonly name: string
  readonly codeRoot: string
  readonly allowedPaths: readonly string[]
  readonly excludePaths: readonly string[]
  readonly respectGitignore: boolean
}

/**
 * Normalizes workspace targets for deterministic fingerprinting.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspaces - The workspace targets to normalize.
 * @param graphConfig - The project graph configuration.
 * @returns Normalized workspace representations.
 */
function normalizeWorkspaceFingerprintInput(
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
): readonly NormalizedWorkspaceFingerprint[] {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  return workspaces.map((ws) => {
    const wsGraph = effectiveGraphConfig.workspaces.get(ws.name)
    return {
      name: ws.name,
      codeRoot: ws.codeRoot,
      allowedPaths: wsGraph?.allowedPaths ? [...wsGraph.allowedPaths] : [],
      excludePaths: wsGraph?.excludePaths ? [...wsGraph.excludePaths] : [],
      respectGitignore: wsGraph?.respectGitignore ?? true,
    }
  })
}

/**
 * Computes a deterministic fingerprint for the entire graph configuration.
 * @param input - The fingerprint input.
 * @returns A SHA-256 hex digest.
 */
export function computeGraphFingerprint(input: GraphFingerprintInput): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(
    input.projectRoot,
    input.workspaces,
    input.graphConfig,
  )
  const normalized = normalizeWorkspaceFingerprintInput(
    input.projectRoot,
    input.workspaces,
    input.graphConfig,
  )
  const payload = JSON.stringify({
    v: input.codeGraphVersion,
    w: normalized,
    g: {
      includePaths: effectiveGraphConfig.includePaths,
      globalExcludePaths: effectiveGraphConfig.globalExcludePaths,
      syntheticSpecExcludePaths: effectiveGraphConfig.syntheticSpecExcludePaths,
    },
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Computes a deterministic fingerprint for a single workspace.
 * @param codeGraphVersion - The code-graph package version.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspace - The workspace target.
 * @param workspaces - All workspace targets in the current project.
 * @param graphConfig - The project graph configuration.
 * @returns A SHA-256 hex digest.
 */
export function computeWorkspaceFingerprint(
  codeGraphVersion: string,
  projectRoot: string,
  workspace: ProjectWorkspace,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  const wsGraph = effectiveGraphConfig.workspaces.get(workspace.name)
  const normalized: NormalizedWorkspaceFingerprint = {
    name: workspace.name,
    codeRoot: workspace.codeRoot,
    allowedPaths: wsGraph?.allowedPaths ? [...wsGraph.allowedPaths] : [],
    excludePaths: wsGraph?.excludePaths ? [...wsGraph.excludePaths] : [],
    respectGitignore: wsGraph?.respectGitignore ?? true,
  }
  const payload = JSON.stringify({ v: codeGraphVersion, w: [normalized] })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Computes the fingerprint entry for project-global `root:` discovery.
 * @param codeGraphVersion - The current code-graph version.
 * @param projectRoot - Absolute project root used for discovery.
 * @param workspaces - The current workspace targets.
 * @param graphConfig - The project graph configuration.
 * @returns A SHA-256 hex digest.
 */
export function computeRootFingerprint(
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  const payload = JSON.stringify({
    v: codeGraphVersion,
    root: {
      includePaths: effectiveGraphConfig.includePaths,
      excludePaths: effectiveGraphConfig.rootExcludePaths,
    },
    workspaces: workspaces.map((workspace) => ({
      name: workspace.name,
      codeRoot: workspace.codeRoot,
    })),
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Parses a serialized fingerprint map from storage.
 * @param stored - The JSON string or null.
 * @returns A map of workspace name to fingerprint.
 */
export function parseFingerprintMap(stored: string | null): Map<string, string> {
  if (stored === null) return new Map()
  try {
    const parsed = JSON.parse(stored) as Record<string, string>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

/**
 * Serializes a fingerprint map to JSON for storage.
 * @param map - The fingerprint map.
 * @returns A JSON string.
 */
export function serializeFingerprintMap(map: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(map))
}

/**
 * Detects if any stored workspace fingerprint differs from the current one.
 * @param storedMap - The stored fingerprint map.
 * @param codeGraphVersion - The current code-graph version.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspaces - The current workspace targets.
 * @param graphConfig - The project graph configuration.
 * @returns True if any mismatch is detected.
 */
export function detectFingerprintMismatch(
  storedMap: Map<string, string>,
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
): boolean {
  if (storedMap.size === 0) {
    return false
  }

  for (const ws of workspaces) {
    const currentFp = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      ws,
      workspaces,
      graphConfig,
    )
    const storedFp = storedMap.get(ws.name)
    if (storedFp !== currentFp) {
      return true
    }
  }

  const rootFingerprint = computeRootFingerprint(
    codeGraphVersion,
    projectRoot,
    workspaces,
    graphConfig,
  )
  if (storedMap.get('root') !== rootFingerprint) {
    return true
  }

  return false
}
