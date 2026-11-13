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
 * Input contract for plugin update.
 */
export interface UpdatePluginInput {
  /** Plugin package name. */
  readonly pluginName: string
  /** Project configuration. */
  readonly config: SpecdConfig
  /** Previously selected contribution ids. All declared ids when omitted. */
  readonly contributions?: readonly string[]
  /** Optional plugin-specific options. */
  readonly options?: Record<string, unknown>
}

/**
 * Output contract for plugin update.
 */
export interface UpdatePluginOutput {
  /** Whether update finished without throwing. */
  readonly success: boolean
  /** Human-readable summary. */
  readonly message: string
  /** Selected contribution ids. */
  readonly contributions: readonly string[]
  /** Optional plugin-specific output. */
  readonly data?: unknown
}

/**
 * Updates one plugin by reinstalling the already selected contributions.
 *
 * Does not write project configuration.
 */
export class UpdatePlugin {
  /**
   * Creates an update-plugin use case.
   *
   * @param loader - Plugin loader dependency
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin update.
   *
   * @param input - Update input
   * @returns Update result payload
   */
  async execute(input: UpdatePluginInput): Promise<UpdatePluginOutput> {
    const { plugin, manifest } = await loadPluginSafely(this.loader, input.pluginName)
    let selected: readonly string[]
    let contributions: readonly string[]
    let hasAgents: boolean
    try {
      selected = resolveContributions(input.pluginName, manifest, input.contributions)
      contributions = installContextContributions(manifest, selected)
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
      contributions,
      ...(input.options !== undefined ? { options: input.options } : {}),
    }
    let data: unknown
    try {
      data = await plugin.install?.(context)
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(input.pluginName, ['install'], error)
    }
    return {
      success: true,
      message: `Updated '${input.pluginName}'`,
      contributions,
      ...(data !== undefined ? { data } : {}),
    }
  }
}
