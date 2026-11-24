import type { SpecdConfig } from '@specd/sdk'

/**
 * One plugin declaration row from the flat `plugins` list.
 */
export interface DeclaredPluginEntry {
  /** Scoped plugin package name. */
  readonly name: string
  /** Optional plugin-specific config payload. */
  readonly config?: Readonly<Record<string, unknown>>
  /** Optional contribution allowlist. */
  readonly contributions?: readonly string[]
}

/**
 * Returns the flat plugin declarations from an in-memory config snapshot.
 *
 * @param config - Loaded project configuration
 * @returns Declarations, or an empty list when none are present
 */
export function getDeclaredPlugins(config: SpecdConfig): readonly DeclaredPluginEntry[] {
  return config.plugins ?? []
}

/**
 * Finds one declared plugin by scoped name.
 *
 * @param config - Loaded project configuration
 * @param name - Plugin package name
 * @returns The matching entry, or `undefined` when it is not declared
 */
export function findDeclaredPlugin(
  config: SpecdConfig,
  name: string,
): DeclaredPluginEntry | undefined {
  return getDeclaredPlugins(config).find((entry) => entry.name === name)
}
