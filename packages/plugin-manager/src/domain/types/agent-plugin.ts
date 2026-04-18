import type { SpecdPlugin } from './specd-plugin.js'

/**
 * Options used during plugin install and uninstall operations.
 */
export interface InstallOptions {
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
export interface InstallResult {
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
   * @param projectRoot - Absolute project root path.
   * @param options - Install options.
   * @returns Install summary.
   */
  install(projectRoot: string, options?: InstallOptions): Promise<InstallResult>

  /**
   * Uninstalls agent assets from a project root.
   *
   * @param projectRoot - Absolute project root path.
   * @param options - Uninstall options.
   * @returns A promise that resolves when uninstall completes.
   */
  uninstall(projectRoot: string, options?: InstallOptions): Promise<void>
}
