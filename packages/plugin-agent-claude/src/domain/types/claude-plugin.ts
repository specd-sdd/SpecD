import type {
  AgentPlugin,
  InstallOptions,
  InstallResult,
  PluginContext,
} from '@specd/plugin-manager'

/**
 * Install operation used by the plugin runtime.
 */
export type InstallOperation = (
  projectRoot: string,
  options?: InstallOptions,
) => Promise<InstallResult>

/**
 * Uninstall operation used by the plugin runtime.
 */
export type UninstallOperation = (projectRoot: string, options?: InstallOptions) => Promise<void>

/**
 * Claude implementation of the agent-plugin contract.
 */
export class ClaudeAgentPlugin implements AgentPlugin {
  /**
   * Creates a Claude plugin runtime.
   *
   * @param runInstall - Install operation injected by composition.
   * @param runUninstall - Uninstall operation injected by composition.
   */
  constructor(
    private readonly runInstall: InstallOperation,
    private readonly runUninstall: UninstallOperation,
  ) {}

  /**
   * Plugin package name.
   */
  get name(): string {
    return '@specd/plugin-agent-claude'
  }

  /**
   * Fixed plugin type.
   */
  get type(): 'agent' {
    return 'agent'
  }

  /**
   * Plugin version.
   */
  get version(): string {
    return '0.0.1'
  }

  /**
   * Plugin config schema (none in phase 1).
   */
  get configSchema(): Record<string, never> {
    return {}
  }

  /**
   * Initializes plugin runtime.
   *
   * @param context - Runtime plugin context.
   * @returns A resolved promise.
   */
  init(context: PluginContext): Promise<void> {
    void context
    return Promise.resolve()
  }

  /**
   * Releases plugin resources.
   *
   * @returns A resolved promise.
   */
  async destroy(): Promise<void> {}

  /**
   * Installs Claude skills into `.claude/skills`.
   *
   * @param projectRoot - Absolute project root.
   * @param options - Install options.
   * @returns Install summary.
   */
  async install(projectRoot: string, options?: InstallOptions): Promise<InstallResult> {
    return this.runInstall(projectRoot, options)
  }

  /**
   * Uninstalls Claude skills from `.claude/skills`.
   *
   * @param projectRoot - Absolute project root.
   * @param options - Optional skill filter.
   * @returns A promise that resolves when uninstall finishes.
   */
  async uninstall(projectRoot: string, options?: InstallOptions): Promise<void> {
    return this.runUninstall(projectRoot, options)
  }
}
