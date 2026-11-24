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
 * Input contract for plugin install.
 */
export interface InstallPluginInput {
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
 * Output contract for plugin install.
 */
export interface InstallPluginOutput {
  /** Whether install finished without throwing. */
  readonly success: boolean
  /** Human-readable summary. */
  readonly message: string
  /** Selected contribution ids. */
  readonly contributions: readonly string[]
  /** Manifest default config, when declared. Not written by this use case. */
  readonly defaultConfig?: Readonly<Record<string, unknown>>
  /** Optional plugin-specific output. */
  readonly data?: unknown
}

/**
 * Installs one plugin using the runtime loader.
 *
 * Does not call `init`. Agent plugins are required only when the manifest
 * declares the `agents` kind.
 */
export class InstallPlugin {
  /**
   * Creates an install-plugin use case.
   *
   * @param loader - Plugin loader dependency
   */
  constructor(private readonly loader: PluginLoader) {}

  /**
   * Executes plugin installation.
   *
   * @param input - Install input
   * @returns Install result payload
   */
  async execute(input: InstallPluginInput): Promise<InstallPluginOutput> {
    const { plugin, manifest } = await loadPluginSafely(this.loader, input.pluginName)
    let selected: readonly string[]
    let contributions: readonly string[]
    let hasAgents: boolean
    let defaultConfig: Readonly<Record<string, unknown>> | undefined
    try {
      selected = resolveContributions(input.pluginName, manifest, input.contributions)
      contributions = installContextContributions(manifest, selected)
      hasAgents = manifest.contributes['agents'] !== undefined
      defaultConfig = manifest.defaultConfig
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
      message: `Installed '${input.pluginName}'`,
      contributions,
      ...(defaultConfig !== undefined ? { defaultConfig } : {}),
      ...(data !== undefined ? { data } : {}),
    }
  }
}
