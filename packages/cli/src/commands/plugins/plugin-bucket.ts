import type { PluginType } from '@specd/plugin-manager'
import type { SpecdConfig } from '@specd/sdk'
import { getDeclaredPlugins, type DeclaredPluginEntry } from './get-declared-plugins.js'

/** Plugin declaration with its config bucket key. */
export interface DeclaredPluginWithBucket extends DeclaredPluginEntry {
  readonly bucket: string
}

/**
 * Maps runtime plugin type to `specd.yaml` plugins bucket key.
 *
 * @param pluginType - Loaded plugin type.
 * @returns Config bucket under `plugins`.
 */
export function toPluginBucket(pluginType: PluginType): string {
  switch (pluginType) {
    case 'agent':
      return 'agents'
    case 'ui':
      return 'ui'
  }
}

/**
 * Lists declared plugins from all install buckets.
 *
 * @param config - Loaded project configuration.
 * @returns Declarations with bucket keys.
 */
export function listDeclaredPlugins(config: SpecdConfig): readonly DeclaredPluginWithBucket[] {
  return [
    ...getDeclaredPlugins(config, 'agents').map((entry) => ({ ...entry, bucket: 'agents' })),
    ...getDeclaredPlugins(config, 'ui').map((entry) => ({ ...entry, bucket: 'ui' })),
  ]
}

/**
 * Finds a declared plugin by name across agent and UI buckets.
 *
 * @param config - Loaded project configuration.
 * @param pluginName - Plugin package name.
 * @returns Declaration and bucket when found.
 */
export function findDeclaredPlugin(
  config: SpecdConfig,
  pluginName: string,
): DeclaredPluginWithBucket | undefined {
  return listDeclaredPlugins(config).find((entry) => entry.name === pluginName)
}
