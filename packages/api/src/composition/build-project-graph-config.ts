import { type SpecdConfig } from '@specd/core'
import { type ProjectGraphConfig, DEFAULT_EXCLUDE_PATHS } from '@specd/code-graph'

/**
 * Builds the effective graph configuration for API-triggered indexing.
 *
 * Mirrors the CLI assembly flow so API and CLI index the same project shape.
 *
 * @param config - Loaded project configuration
 * @returns Effective project graph configuration
 */
export function buildProjectGraphConfig(config: SpecdConfig): ProjectGraphConfig {
  return {
    includePaths: [...(config.graph?.includePaths ?? [])],
    excludePaths: [...(config.graph?.excludePaths ?? DEFAULT_EXCLUDE_PATHS)],
    workspaces: new Map(
      config.workspaces.map((workspace) => [
        workspace.name,
        {
          ...(workspace.graph?.allowedPaths !== undefined
            ? { allowedPaths: [...workspace.graph.allowedPaths] }
            : {}),
          ...(workspace.graph?.excludePaths !== undefined
            ? { excludePaths: [...workspace.graph.excludePaths] }
            : {}),
          respectGitignore: workspace.graph?.respectGitignore ?? true,
        },
      ]),
    ),
  }
}
