import type { SpecdConfig } from '@specd/core'
import type {
  AgentPlugin,
  AgentInstallOptions,
  AgentInstallResult,
  PluginContext,
} from '@specd/plugin-manager'

/**
 * Install operation used by the plugin runtime.
 */
export type InstallOperation = (
  config: SpecdConfig,
  options?: AgentInstallOptions,
) => Promise<AgentInstallResult>

/**
 * Uninstall operation used by the plugin runtime.
 */
export type UninstallOperation = (
  config: SpecdConfig,
  options?: AgentInstallOptions,
) => Promise<void>

/**
 * Open Code implementation of the agent-plugin contract.
 */
export class OpenCodeAgentPlugin implements AgentPlugin {
  /**
   * Creates an Open Code plugin runtime.
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
   * Installs Open Code skills into `.opencode/skills`.
   *
   * @param config - Project configuration.
   * @param options - Install options.
   * @returns Install summary.
   */
  async install(config: SpecdConfig, options?: AgentInstallOptions): Promise<AgentInstallResult> {
    return this.runInstall(config, options)
  }

  /**
   * Uninstalls Open Code skills from `.opencode/skills`.
   *
   * @param config - Project configuration.
   * @param options - Optional skill filter.
   * @returns A promise that resolves when uninstall completes.
   */
  async uninstall(config: SpecdConfig, options?: AgentInstallOptions): Promise<void> {
    return this.runUninstall(config, options)
  }
}
