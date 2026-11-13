import { isInstanceOf } from '../../domain/errors/is-specd-error.js'
import { describeThrown } from '../../domain/errors/describe-thrown.js'
import { PluginNotFoundError } from '../../domain/errors/plugin-not-found.js'
import { declaredContributionIds } from '../../domain/services/resolve-contributions.js'
import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import type { SpecdPluginManifest } from '../../domain/types/plugin-manifest.js'
import type { PluginLoader } from '../ports/plugin-loader.js'
import { loadPluginSafely } from './load-plugin-safely.js'

/**
 * Input contract for listing plugins.
 */
export interface ListPluginsInput {
  /** Plugin package names to inspect. */
  readonly pluginNames: readonly string[]
}

/**
 * Per-plugin list status.
 */
export interface PluginListStatus {
  /** Plugin package name. */
  readonly name: string
  /** Load status. */
  readonly status: 'loaded' | 'not_found' | 'error'
  /** Loaded plugin when status is `loaded`. */
  readonly plugin?: SpecdPlugin
  /** Parsed manifest when status is `loaded`. */
  readonly manifest?: SpecdPluginManifest
  /** Declared contribution ids when status is `loaded`. */
  readonly contributions?: readonly string[]
  /** Optional error message. */
  readonly error?: string
}

/**
 * Output contract for listing plugins.
 */
export interface ListPluginsOutput {
  /** Plugin status entries. */
  readonly plugins: readonly PluginListStatus[]
}

/**
 * Lists plugin statuses by attempting runtime load.
 *
 * An invalid manifest becomes an `error` entry and does not stop the rest.
 */
export class ListPlugins {
  /**
   * Creates a list-plugins use case.
   *
   * @param loader - Plugin loader dependency
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin listing.
   *
   * @param input - List input
   * @returns Plugin status entries
   */
  async execute(input: ListPluginsInput): Promise<ListPluginsOutput> {
    const plugins: PluginListStatus[] = []
    for (const name of input.pluginNames) {
      try {
        const loaded = await loadPluginSafely(this.loader, name)
        plugins.push({
          name,
          status: 'loaded',
          plugin: loaded.plugin,
          manifest: loaded.manifest,
          contributions: declaredContributionIds(loaded.manifest),
        })
      } catch (error) {
        const message = describeThrown(error)
        const status: PluginListStatus['status'] = isInstanceOf(error, PluginNotFoundError)
          ? 'not_found'
          : 'error'
        plugins.push({ name, status, error: message })
      }
    }
    return { plugins }
  }
}
