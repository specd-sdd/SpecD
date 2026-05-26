import type { SpecdConfig } from '@specd/core'
import type { PluginLoader } from '../ports/plugin-loader.js'
import { isAgentPlugin } from '../../domain/types/agent-plugin.js'
import { isUiPlugin } from '../../domain/types/ui-plugin.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'

/**
 * Input contract for plugin update.
 */
export interface UpdatePluginInput {
  /**
   * Plugin package name.
   */
  readonly pluginName: string

  /**
   * Project configuration.
   */
  readonly config: SpecdConfig

  /**
   * Optional plugin-specific options.
   */
  readonly options?: Record<string, unknown>
}

/**
 * Output contract for plugin update.
 */
export interface UpdatePluginOutput {
  /**
   * Whether update finished without throwing.
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
 * Updates one plugin by reinstalling its assets.
 */
export class UpdatePlugin {
  /**
   * Creates an update-plugin use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin update.
   *
   * @param input - Update input.
   * @returns Update result payload.
   */
  async execute(input: UpdatePluginInput): Promise<UpdatePluginOutput> {
    const plugin = await this.loader.load(input.pluginName)
    if (isAgentPlugin(plugin)) {
      const data = await plugin.install(input.config, input.options)
      return {
        success: true,
        message: `Updated '${input.pluginName}'`,
        data,
      }
    }
    if (isUiPlugin(plugin) && plugin.install !== undefined) {
      const data = await plugin.install(input.config, input.options)
      return {
        success: true,
        message: `Updated '${input.pluginName}'`,
        data,
      }
    }
    if (isUiPlugin(plugin)) {
      return {
        success: true,
        message: `Updated '${input.pluginName}'`,
      }
    }
    throw new PluginValidationError(input.pluginName, ['install'])
  }
}
