import type { SpecdConfig } from '@specd/sdk'

/**
 * One plugin declaration row from config.
 */
export interface DeclaredPluginEntry {
  /** Plugin package name. */
  readonly name: string
  /** Optional plugin-specific config payload. */
  readonly config?: Readonly<Record<string, unknown>>
}

/**
 * Returns plugin declarations for a type bucket from an in-memory config snapshot.
 *
 * @param config - Loaded project configuration.
 * @param type - Plugin type key (for example `agents`).
 * @returns Declarations for that type, or empty when absent.
 */
export function getDeclaredPlugins(
  config: SpecdConfig,
  type: string,
): readonly DeclaredPluginEntry[] {
  const plugins = config.plugins as
    | Readonly<Record<string, readonly DeclaredPluginEntry[] | undefined>>
    | undefined
  return plugins?.[type] ?? []
}
