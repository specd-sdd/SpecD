import { type SpecdConfig } from '@specd/core'
import { type ProjectGraphConfig } from '../domain/value-objects/index-options.js'
import { DEFAULT_EXCLUDE_PATHS } from '../application/use-cases/discover-files.js'

/**
 * Builds the effective graph configuration from a resolved SpecdConfig.
 *
 * This assembles the global and per-workspace inclusion/exclusion patterns
 * into the map structure expected by the code-graph indexer.
 *
 * @param config - Loaded project configuration.
 * @returns Effective project graph configuration.
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
