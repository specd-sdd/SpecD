import { isSpecdError } from '../../domain/errors/is-specd-error.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import { isAgentPlugin } from '../../domain/types/agent-plugin.js'
import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'

/**
 * Checks whether a plugin exposes the agent `install` and `uninstall` hooks, never throwing a raw error.
 *
 * Reading the hooks can run plugin code (accessors); a failure there is wrapped in a
 * `PluginValidationError` (`fields: ['install', 'uninstall']`) with the original value as `cause`.
 *
 * @param pluginName - Plugin package name, used in the error
 * @param plugin - Loaded plugin
 * @returns `true` when both hooks are functions
 * @throws {PluginValidationError} When reading the hooks throws
 */
export function hasAgentHooks(pluginName: string, plugin: SpecdPlugin): boolean {
  try {
    return isAgentPlugin(plugin)
  } catch (error) {
    if (isSpecdError(error)) throw error
    throw new PluginValidationError(pluginName, ['install', 'uninstall'], error)
  }
}
