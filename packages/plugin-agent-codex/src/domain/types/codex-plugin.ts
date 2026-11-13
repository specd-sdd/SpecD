import type { SpecdConfig } from '@specd/core'
import type { UninstallResult } from '@specd/skills'
import type {
  AgentPlugin,
  AgentInstallContext,
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
) => Promise<UninstallResult | void>

/**
 * Codex implementation of the agent-plugin contract.
 */
export class CodexAgentPlugin implements AgentPlugin {
  /**
   * Creates a Codex plugin runtime.
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

  /** Plugin version from manifest. */
  get version(): string {
    return this.pluginVersion
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
   * Installs Codex skills into `.codex/skills`.
   *
   * @param context - Install context with config, contributions, and options.
   * @returns Install summary.
   */
  async install(context: AgentInstallContext): Promise<AgentInstallResult> {
    return this.runInstall(context.config, context.options)
  }

  /**
   * Uninstalls specd skills and agents; see {@link CodexAgentPlugin.uninstallWithResult} for the report.
   *
   * @param context - Install context with config, contributions, and options.
   * @returns A promise that resolves when uninstall finishes.
   */
  async uninstall(context: AgentInstallContext): Promise<void> {
    await this.uninstallWithResult(context)
  }

  /**
   * Uninstalls specd skills and agents and reports the skipped names.
   *
   * Names in `options.skills` / `options.agents` that are not specd-managed (or that
   * contain a path separator or `..`) are never touched and are listed in `skipped`.
   *
   * @param context - Install context with config, contributions, and options.
   * @returns The requested names that were skipped.
   */
  async uninstallWithResult(context: AgentInstallContext): Promise<UninstallResult> {
    return (await this.runUninstall(context.config, context.options)) ?? { skipped: [] }
  }
}
