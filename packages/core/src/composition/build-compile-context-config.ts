import {
  type CompileContextConfig,
  type WorkspaceContextConfig,
} from '../application/use-cases/compile-context.js'
import { type SpecdConfig } from '../application/specd-config.js'

/**
 * Maps a resolved {@link SpecdConfig} into the yaml-stable subset used by context use cases.
 *
 * Runtime CLI overrides such as `--mode` and `--optimized` are not applied here.
 *
 * @param config - Fully-resolved project configuration from kernel composition
 * @returns Yaml-derived defaults for {@link CompileContext} and {@link GetProjectContext}
 */
export function buildCompileContextConfig(config: SpecdConfig): CompileContextConfig {
  const workspaces: Record<string, WorkspaceContextConfig> = {}
  for (const ws of config.workspaces) {
    if (ws.contextIncludeSpecs === undefined && ws.contextExcludeSpecs === undefined) {
      continue
    }
    const entry: WorkspaceContextConfig = {
      ...(ws.contextIncludeSpecs !== undefined
        ? { contextIncludeSpecs: [...ws.contextIncludeSpecs] }
        : {}),
      ...(ws.contextExcludeSpecs !== undefined
        ? { contextExcludeSpecs: [...ws.contextExcludeSpecs] }
        : {}),
    }
    workspaces[ws.name] = entry
  }

  return {
    projectRoot: config.projectRoot,
    configPath: config.configPath,
    ...(config.llmOptimizedContext !== undefined
      ? { llmOptimizedContext: config.llmOptimizedContext }
      : {}),
    ...(config.context !== undefined
      ? {
          context: config.context.map((entry) =>
            'file' in entry ? { file: entry.file } : { instruction: entry.instruction },
          ),
        }
      : {}),
    ...(config.contextIncludeSpecs !== undefined
      ? { contextIncludeSpecs: [...config.contextIncludeSpecs] }
      : {}),
    ...(config.contextExcludeSpecs !== undefined
      ? { contextExcludeSpecs: [...config.contextExcludeSpecs] }
      : {}),
    ...(config.contextMode !== undefined ? { contextMode: config.contextMode } : {}),
    ...(Object.keys(workspaces).length > 0 ? { workspaces } : {}),
  }
}
