import { isSpecdError } from '../../domain/errors/is-specd-error.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import type { LoadedPlugin, PluginLoader } from '../ports/plugin-loader.js'

/**
 * Loads one plugin through a loader and guarantees a `SpecdError` on failure.
 *
 * A caller-supplied loader may reject with any value. A `SpecdError` (for
 * example `PluginNotFoundError`) propagates unchanged; anything else is wrapped
 * in a `PluginValidationError` (`fields: ['load']`) naming the plugin, with the
 * original value as `cause`. A loader that resolves to something that is not
 * `{ plugin, manifest }`, or whose `manifest.contributes` is not a map of blocks, is a
 * load failure of the same kind.
 *
 * @param loader - Loader used to resolve the plugin
 * @param pluginName - Plugin package name
 * @returns The loaded plugin and manifest
 * @throws {SpecdError} Always a specd error when the load fails
 */
export async function loadPluginSafely(
  loader: PluginLoader,
  pluginName: string,
): Promise<LoadedPlugin> {
  let loaded: unknown
  try {
    loaded = await loader.load(pluginName)
  } catch (error) {
    if (isSpecdError(error)) throw error
    throw new PluginValidationError(pluginName, ['load'], error)
  }
  let wellFormed = false
  try {
    wellFormed =
      typeof loaded === 'object' &&
      loaded !== null &&
      typeof (loaded as { plugin?: unknown }).plugin === 'object' &&
      (loaded as { plugin?: unknown }).plugin !== null &&
      typeof (loaded as { manifest?: unknown }).manifest === 'object' &&
      (loaded as { manifest?: unknown }).manifest !== null &&
      hasContributionBlocks(
        (loaded as { manifest: { contributes?: unknown } }).manifest.contributes,
      )
  } catch (error) {
    throw new PluginValidationError(pluginName, ['load'], error)
  }
  if (!wellFormed) throw new PluginValidationError(pluginName, ['load'])
  return loaded as LoadedPlugin
}

/**
 * Checks that `manifest.contributes` is a non-null object whose block values are non-null objects.
 *
 * @param contributes - Candidate `manifest.contributes` value
 * @returns `true` when the shape can be walked safely
 */
function hasContributionBlocks(contributes: unknown): boolean {
  if (typeof contributes !== 'object' || contributes === null) return false
  return Object.values(contributes).every((block) => typeof block === 'object' && block !== null)
}
