import type { SpecdConfig } from '@specd/core'
import type { SpecdPlugin } from './specd-plugin.js'

/**
 * Options used during plugin install and uninstall operations.
 */
export interface AgentInstallOptions {
  /**
   * Optional skill-name filter. When omitted, install all skills.
   */
  readonly skills?: readonly string[]

  /**
   * Variables used for template substitution.
   */
  readonly variables?: Record<string, string>
}

/**
 * Result returned by an agent-plugin install operation.
 */
export interface AgentInstallResult {
  /**
   * Successfully installed skills and output paths.
   */
  readonly installed: ReadonlyArray<{ skill: string; path: string }>

  /**
   * Skipped skills and the reason for skipping.
   */
  readonly skipped: ReadonlyArray<{ skill: string; reason: string }>
}

/**
 * Plugin contract specialized for AI-agent integrations.
 */
export interface AgentPlugin extends SpecdPlugin {
  /**
   * Fixed plugin type for agent plugins.
   */
  readonly type: 'agent'

  /**
   * Installs agent assets into a project root.
   *
   * @param config - Project configuration.
   * @param options - Install options.
   * @returns Install summary.
   */
  install(config: SpecdConfig, options?: AgentInstallOptions): Promise<AgentInstallResult>

  /**
   * Uninstalls agent assets from a project root.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   * @returns A promise that resolves when uninstall completes.
   */
  uninstall(config: SpecdConfig, options?: AgentInstallOptions): Promise<void>
}

/**
 * Checks whether a value satisfies the agent-plugin extension contract.
 *
 * Validates that the plugin has `type: 'agent'` and exposes both
 * `install` and `uninstall` methods.
 *
 * @param value - Candidate plugin to check.
 * @returns `true` when the value matches {@link AgentPlugin}.
 */
export function isAgentPlugin(value: SpecdPlugin): value is AgentPlugin {
  const record = value as unknown as Record<string, unknown>
  return (
    record['type'] === 'agent' &&
    typeof record['install'] === 'function' &&
    typeof record['uninstall'] === 'function'
  )
}
