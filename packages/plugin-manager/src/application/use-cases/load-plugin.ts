import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import type { PluginLoader } from '../ports/plugin-loader.js'

/**
 * Input for loading one plugin.
 */
export interface LoadPluginInput {
  /**
   * Plugin package name.
   */
  readonly pluginName: string
}

/**
 * Output for loading one plugin.
 */
export interface LoadPluginOutput {
  /**
   * Loaded plugin instance.
   */
  readonly plugin: SpecdPlugin
}

/**
 * Loads and validates one plugin through the loader.
 */
export class LoadPlugin {
  /**
   * Creates a load-plugin use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes the use case.
   *
   * @param input - Plugin input.
   * @returns Loaded plugin.
   */
  async execute(input: LoadPluginInput): Promise<LoadPluginOutput> {
    const plugin = await this.loader.load(input.pluginName)
    return { plugin }
  }
}
