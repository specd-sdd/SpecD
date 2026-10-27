import { relative } from 'node:path'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../../domain/value-objects/index-options.js'
import { DEFAULT_EXCLUDE_PATHS } from '../discover-files.js'

/**
 * Built-in default per-file size limit in bytes (256 KiB).
 */
export const DEFAULT_MAX_FILE_BYTES = 262144

/** Effective workspace discovery settings after global resolution. */
export interface EffectiveWorkspaceGraphConfig {
  /** Optional include filters relative to the workspace code root. */
  readonly allowedPaths?: readonly string[]
  /** Final exclusion list applied to this workspace discovery run. */
  readonly excludePaths: readonly string[]
  /** Whether `.gitignore` files remain active for this workspace. */
  readonly respectGitignore: boolean
  /** Effective per-file limit in bytes; 0 means no limit. Workspace value, else project value, else DEFAULT_MAX_FILE_BYTES. */
  readonly maxFileBytes: number
  /** Project-level exemption patterns, evaluated relative to the project root. */
  readonly projectLargeFilePaths: readonly string[]
  /** Workspace-level exemption patterns, evaluated relative to the workspace code root. */
  readonly workspaceLargeFilePaths: readonly string[]
}

/** Effective graph discovery settings consumed by index and stats flows. */
export interface EffectiveGraphConfig {
  /** Project-global root discovery include patterns. */
  readonly includePaths: readonly string[]
  /** Global exclusion patterns from config/CLI before synthetic additions. */
  readonly globalExcludePaths: readonly string[]
  /** Synthetic exclusions derived from filesystem-backed spec roots. */
  readonly syntheticSpecExcludePaths: readonly string[]
  /** Final exclusion list used by project-global root discovery. */
  readonly rootExcludePaths: readonly string[]
  /** Limit applied to `root:` project-global files: the project value, else the default. */
  readonly rootMaxFileBytes: number
  /** Exemption patterns for `root:` files (the project-level ones). */
  readonly rootLargeFilePaths: readonly string[]
  /** Per-workspace resolved discovery settings. */
  readonly workspaces: ReadonlyMap<string, EffectiveWorkspaceGraphConfig>
}

/**
 * Computes synthetic discovery exclusions for filesystem-backed spec repositories.
 *
 * Only spec roots inside the configured project root participate, because roots
 * outside the project cannot be reached by project-local discovery anyway.
 *
 * @param projectRoot - Absolute project root used for discovery.
 * @param workspaces - Rich workspace list with bound repositories.
 * @returns Normalized project-relative exclusion prefixes ending in `/`.
 */
export function computeSyntheticSpecExcludePaths(
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
): readonly string[] {
  const excludes = new Set<string>()

  for (const workspace of workspaces) {
    const specsPath = workspace.specRepo.specsPath
    if (specsPath === undefined) continue

    const projectRelative = relative(projectRoot, specsPath).replaceAll('\\', '/')
    if (projectRelative === '' || projectRelative.startsWith('../') || projectRelative === '..') {
      continue
    }

    excludes.add(projectRelative.endsWith('/') ? projectRelative : `${projectRelative}/`)
  }

  return [...excludes].sort()
}

/**
 * Resolves the final discovery configuration actually used by the indexer.
 *
 * This materializes synthetic spec-root exclusions and merges global/workspace
 * exclusions into a single deterministic shape for both discovery and
 * fingerprinting.
 *
 * @param projectRoot - Absolute project root used for discovery.
 * @param workspaces - Rich workspace list with bound repositories.
 * @param graphConfig - Raw project graph configuration.
 * @returns Effective discovery settings for the current run.
 */
export function resolveEffectiveGraphConfig(
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
): EffectiveGraphConfig {
  const syntheticSpecExcludePaths = computeSyntheticSpecExcludePaths(projectRoot, workspaces)
  const globalExcludePaths = [...(graphConfig.excludePaths ?? DEFAULT_EXCLUDE_PATHS)]
  const rootExcludePaths = [...globalExcludePaths, ...syntheticSpecExcludePaths]
  const rootMaxFileBytes = graphConfig.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const rootLargeFilePaths = [...(graphConfig.largeFilePaths ?? [])]

  return {
    includePaths: [...(graphConfig.includePaths ?? [])],
    globalExcludePaths,
    syntheticSpecExcludePaths,
    rootExcludePaths,
    rootMaxFileBytes,
    rootLargeFilePaths,
    workspaces: new Map(
      workspaces.map((workspace) => {
        const workspaceGraph = graphConfig.workspaces?.get(workspace.name)
        const maxFileBytes =
          workspaceGraph?.maxFileBytes ?? graphConfig.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
        const workspaceLargeFilePaths = [...(workspaceGraph?.largeFilePaths ?? [])]

        return [
          workspace.name,
          {
            ...(workspaceGraph?.allowedPaths !== undefined
              ? { allowedPaths: [...workspaceGraph.allowedPaths] }
              : {}),
            excludePaths: [
              ...globalExcludePaths,
              ...syntheticSpecExcludePaths,
              ...(workspaceGraph?.excludePaths ?? []),
            ],
            respectGitignore: workspaceGraph?.respectGitignore ?? true,
            maxFileBytes,
            projectLargeFilePaths: rootLargeFilePaths,
            workspaceLargeFilePaths,
          },
        ] satisfies [string, EffectiveWorkspaceGraphConfig]
      }),
    ),
  }
}
