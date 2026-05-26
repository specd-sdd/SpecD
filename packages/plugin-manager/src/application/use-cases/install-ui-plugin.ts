import type { SpecdConfig } from '@specd/core'
import type { PluginLoader } from '../ports/plugin-loader.js'
import {
  type UiInstallOptions,
  type UiInstallResult,
  isUiPlugin,
} from '../../domain/types/ui-plugin.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import type { InstallPluginOutput } from './install-plugin.js'

/**
 * Installs one UI plugin (optional dist validation only).
 */
export class InstallUiPlugin {
  /**
   * Creates an {@link InstallUiPlugin} use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Loads and validates a UI plugin package.
   *
   * @param input - Install input.
   * @param input.pluginName - NPM package name to install.
   * @param input.config - Project configuration.
   * @param input.options - Optional install validation flags.
   * @returns Install result payload.
   */
  async execute(input: {
    readonly pluginName: string
    readonly config: SpecdConfig
    readonly options?: UiInstallOptions
  }): Promise<InstallPluginOutput> {
    const plugin = await this.loader.load(input.pluginName)
    if (!isUiPlugin(plugin)) {
      throw new PluginValidationError(input.pluginName, ['hasServer', 'getStaticRoot'])
    }

    let data: UiInstallResult | undefined
    if (plugin.install !== undefined) {
      data = await plugin.install(input.config, input.options)
    } else if (!plugin.hasServer()) {
      const staticRoot = plugin.getStaticRoot()
      data = {
        staticRoot,
        hasIndexHtml: false,
        message: `Registered UI plugin '${input.pluginName}' at ${staticRoot}`,
      }
    }

    return {
      success: true,
      message: `Installed '${input.pluginName}'`,
      data,
    }
  }
}
