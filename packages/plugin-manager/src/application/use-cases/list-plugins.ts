import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import { PluginNotFoundError } from '../../domain/errors/plugin-not-found.js'
import type { PluginLoader } from '../ports/plugin-loader.js'

/**
 * Input contract for listing plugins.
 */
export interface ListPluginsInput {
  /**
   * Plugin package names to inspect.
   */
  readonly pluginNames: readonly string[]
}

/**
 * Per-plugin list status.
 */
export interface PluginListStatus {
  /**
   * Plugin package name.
   */
  readonly name: string

  /**
   * Load status.
   */
  readonly status: 'loaded' | 'not_found' | 'error'

  /**
   * Loaded plugin when status is `loaded`.
   */
  readonly plugin?: SpecdPlugin

  /**
   * Optional error message.
   */
  readonly error?: string
}

/**
 * Output contract for listing plugins.
 */
export interface ListPluginsOutput {
  /**
   * Plugin status entries.
   */
  readonly plugins: readonly PluginListStatus[]
}

/**
 * Lists plugin statuses by attempting runtime load.
 */
export class ListPlugins {
  /**
   * Creates a list-plugins use case.
   *
   * @param loader - Plugin loader dependency.
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin listing.
   *
   * @param input - List input.
   * @returns Plugin status entries.
   */
  async execute(input: ListPluginsInput): Promise<ListPluginsOutput> {
    const plugins: PluginListStatus[] = []
    for (const name of input.pluginNames) {
      try {
        const plugin = await this.loader.load(name)
        plugins.push({ name, status: 'loaded', plugin })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const status: PluginListStatus['status'] =
          error instanceof PluginNotFoundError ? 'not_found' : 'error'
        plugins.push({ name, status, error: message })
      }
    }
    return { plugins }
  }
}
