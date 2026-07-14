import { type SpecdConfig, type ProjectGraphConfig, DEFAULT_EXCLUDE_PATHS } from '@specd/sdk'

/**
 * Optional CLI-level overrides for graph configuration assembly.
 */
export interface GraphConfigOverrides {
  readonly includePaths?: readonly string[]
  readonly excludePaths?: readonly string[]
}

/**
 * Builds the effective project graph configuration used by graph commands.
 *
 * @param config - The loaded project configuration.
 * @param overrides - Optional CLI overrides for include/exclude paths.
 * @returns The effective graph configuration.
 */
export function buildProjectGraphConfig(
  config: SpecdConfig,
  overrides: GraphConfigOverrides = {},
): ProjectGraphConfig {
  const globalExcludePaths =
    overrides.excludePaths !== undefined
      ? [...(config.graph?.excludePaths ?? DEFAULT_EXCLUDE_PATHS), ...overrides.excludePaths]
      : [...(config.graph?.excludePaths ?? DEFAULT_EXCLUDE_PATHS)]

  return {
    includePaths: [...(overrides.includePaths ?? config.graph?.includePaths ?? [])],
    excludePaths: globalExcludePaths,
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
