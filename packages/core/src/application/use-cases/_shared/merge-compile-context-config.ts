import { type CompileContextConfig } from '../compile-context.js'

/** Per-call runtime overrides for context compilation configuration. */
export interface CompileContextRuntimeOverrides {
  /** Display mode override from host flags. */
  readonly contextMode?: CompileContextConfig['contextMode']
  /** Whether optimized context is preferred for this invocation. */
  readonly llmOptimizedContext?: boolean
}

/**
 * Merges construction-time yaml defaults with per-call runtime overrides.
 *
 * @param defaults - Yaml-derived snapshot from kernel composition
 * @param overrides - Optional host-provided runtime overrides
 * @returns Effective configuration for a single execute call
 */
export function mergeCompileContextRuntimeOverrides(
  defaults: CompileContextConfig,
  overrides: CompileContextRuntimeOverrides,
): CompileContextConfig {
  let result = defaults
  if (overrides.contextMode !== undefined) {
    result = { ...result, contextMode: overrides.contextMode }
  }
  if (overrides.llmOptimizedContext !== undefined) {
    result = { ...result, llmOptimizedContext: overrides.llmOptimizedContext }
  }
  return result
}
