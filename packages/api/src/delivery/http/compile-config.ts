import { type CompileContextConfig, type SpecdConfig } from '@specd/sdk'

/**
 * Builds compile-context config from resolved {@link SpecdConfig}.
 * @param config
 */
export function buildCompileContextConfig(config: SpecdConfig): CompileContextConfig {
  return {
    ...(config.context !== undefined
      ? {
          context: config.context.map((e) =>
            'file' in e ? { file: e.file } : { instruction: e.instruction },
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
    ...(config.llmOptimizedContext !== undefined
      ? { llmOptimizedContext: config.llmOptimizedContext }
      : {}),
  }
}
