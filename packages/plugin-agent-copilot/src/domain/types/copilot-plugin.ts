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
 * Copilot implementation of the agent-plugin contract.
 */
export class CopilotAgentPlugin implements AgentPlugin {
  /**
   * Creates a Copilot plugin runtime.
   *
   * @param pluginName - Plugin name from manifest.
   * @param pluginVersion - Plugin version from manifest.
   * @param runInstall - Install operation injected by composition.
   * @param runUninstall - Uninstall operation injected by composition.
   */
  constructor(
    private readonly pluginName: string,
    private readonly pluginVersion: string,
    private readonly runInstall: InstallOperation,
    private readonly runUninstall: UninstallOperation,
  ) {}

  /** Plugin name from manifest. */
  get name(): string {
    return this.pluginName
  }

  /** Plugin type (always 'agent'). */
  get type(): 'agent' {
    return 'agent'
  }

  /** Plugin version from manifest. */
  get version(): string {
    return this.pluginVersion
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
   * Installs Copilot skills into `.github/skills`.
   *
   * @param projectRoot - Absolute project root.
   * @param options - Install options.
   * @returns Install summary.
   */
  async install(projectRoot: string, options?: InstallOptions): Promise<InstallResult> {
    return this.runInstall(projectRoot, options)
  }

  /**
   * Uninstalls Copilot skills from `.github/skills`.
   *
   * @param projectRoot - Absolute project root.
   * @param options - Optional skill filter.
   * @returns A promise that resolves when uninstall finishes.
   */
  async uninstall(projectRoot: string, options?: InstallOptions): Promise<void> {
    return this.runUninstall(projectRoot, options)
  }
}
