import type { PluginLoader } from '../ports/plugin-loader.js'
import { isAgentPlugin } from '../../domain/types/agent-plugin.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'

/**
 * Input contract for uninstalling one plugin.
 */
export interface UninstallPluginInput {
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
 * Uninstalls one plugin via the runtime loader.
 */
export class UninstallPlugin {
  /**
   * Creates an uninstall-plugin use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin uninstall.
   *
   * @param input - Uninstall input.
   * @returns A promise that resolves when uninstall finishes.
   */
  async execute(input: UninstallPluginInput): Promise<void> {
    const plugin = await this.loader.load(input.pluginName)
    if (!isAgentPlugin(plugin)) {
      throw new PluginValidationError(input.pluginName, ['uninstall'])
    }
    await plugin.uninstall(input.projectRoot, input.options)
  }
}
