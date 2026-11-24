import { loadPluginSafely } from './load-plugin-safely.js'
import type { SpecdConfig } from '@specd/core'
import { isSpecdError } from '../../domain/errors/is-specd-error.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import {
  installContextContributions,
  resolveContributions,
} from '../../domain/services/resolve-contributions.js'
import { hasAgentHooks } from './has-agent-hooks.js'
import type { PluginInstallContext } from '../../domain/types/specd-plugin.js'
import type { PluginLoader } from '../ports/plugin-loader.js'

/**
 * Input contract for uninstalling one plugin.
 */
export interface UninstallPluginInput {
  /** Plugin package name. */
  readonly pluginName: string
  /** Project configuration. */
  readonly config: SpecdConfig
  /** Contribution allowlist. All declared ids when omitted. */
  readonly contributions?: readonly string[]
  /** Optional plugin-specific options. */
  readonly options?: Record<string, unknown>
}

/**
 * Output contract for uninstalling one plugin: nothing is returned.
 */
export type UninstallPluginOutput = void

/**
 * Uninstalls one plugin via the runtime loader.
 *
 * Does not assume a plugin type. The hook is skipped when the plugin has none.
 */
export class UninstallPlugin {
  /**
   * Creates an uninstall-plugin use case.
   *
   * @param loader - Plugin loader dependency
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin uninstall.
   *
   * @param input - Uninstall input
   */
  async execute(input: UninstallPluginInput): Promise<UninstallPluginOutput> {
    const { plugin, manifest } = await loadPluginSafely(this.loader, input.pluginName)
    let contributions: readonly string[]
    let installContributions: readonly string[]
    let hasAgents: boolean
    try {
      contributions = resolveContributions(input.pluginName, manifest, input.contributions)
      installContributions = installContextContributions(manifest, contributions)
      hasAgents = manifest.contributes['agents'] !== undefined
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(input.pluginName, ['load'], error)
    }
    if (hasAgents && !hasAgentHooks(input.pluginName, plugin)) {
      throw new PluginValidationError(input.pluginName, ['install', 'uninstall'])
    }
    const context: PluginInstallContext = {
      config: input.config,
      contributions: installContributions,
      ...(input.options !== undefined ? { options: input.options } : {}),
    }
    try {
      await plugin.uninstall?.(context)
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(input.pluginName, ['uninstall'], error)
    }
  }
}
