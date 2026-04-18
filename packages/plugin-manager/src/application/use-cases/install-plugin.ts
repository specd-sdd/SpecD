import type { PluginLoader } from '../ports/plugin-loader.js'
import type { AgentPlugin } from '../../domain/types/agent-plugin.js'

/**
 * Input contract for plugin install.
 */
export interface InstallPluginInput {
  /**
   * Plugin package name.
   */
  readonly pluginName: string

  /**
   * Absolute project root path.
   */
  readonly projectRoot: string

  /**
   * Optional plugin-specific options.
   */
  readonly options?: Record<string, unknown>
}

/**
 * Output contract for plugin install.
 */
export interface InstallPluginOutput {
  /**
   * Whether install finished without throwing.
   */
  readonly success: boolean

  /**
   * Human-readable summary.
   */
  readonly message: string

  /**
   * Optional plugin-specific output.
   */
  readonly data?: unknown
}

/**
 * Installs one plugin using the runtime loader.
 */
export class InstallPlugin {
  /**
   * Creates an install-plugin use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin installation.
   *
   * @param input - Install input.
   * @returns Install result payload.
   */
  async execute(input: InstallPluginInput): Promise<InstallPluginOutput> {
    const plugin = await this.loader.load(input.pluginName)
    const agentPlugin = plugin as AgentPlugin
    const data = await agentPlugin.install(input.projectRoot, input.options)
    return {
      success: true,
      message: `Installed '${input.pluginName}'`,
      data,
    }
  }
}
