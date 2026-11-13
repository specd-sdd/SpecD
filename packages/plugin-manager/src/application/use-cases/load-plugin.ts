import { loadPluginSafely } from './load-plugin-safely.js'
import type { LoadedPlugin, PluginLoader } from '../ports/plugin-loader.js'

/**
 * Input for loading one plugin.
 */
export interface LoadPluginInput {
  /** Plugin package name. */
  readonly pluginName: string
}

/**
 * Output for loading one plugin.
 */
export type LoadPluginOutput = LoadedPlugin

/**
 * Loads and validates one plugin through the loader.
 */
export class LoadPlugin {
  /**
   * Creates a load-plugin use case.
   *
   * @param loader - Plugin loader dependency
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes the use case.
   *
   * @param input - Plugin input
   * @returns Loaded plugin and manifest
   */
  async execute(input: LoadPluginInput): Promise<LoadPluginOutput> {
    return loadPluginSafely(this.loader, input.pluginName)
  }
}
