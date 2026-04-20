/**
 * Known plugin types. Single source of truth for runtime validation
 * and compile-time type derivation. Add new types here.
 */
export const PLUGIN_TYPES = ['agent'] as const

/**
 * Plugin type discriminator, derived from {@link PLUGIN_TYPES}.
 */
export type PluginType = (typeof PLUGIN_TYPES)[number]

/**
 * Single configurable entry for a plugin option.
 */
export interface ConfigSchemaEntry {
  /**
   * Primitive config type.
   */
  readonly type: 'string' | 'boolean' | 'number'

  /**
   * Human-readable option description.
   */
  readonly description: string

  /**
   * Optional default value.
   */
  readonly default?: unknown

  /**
   * Whether the option must be provided.
   */
  readonly required?: boolean
}

/**
 * Runtime context passed into plugin initialization.
 */
export interface PluginContext {
  /**
   * Absolute project root path.
   */
  readonly projectRoot: string

  /**
   * Plugin-specific config section from `specd.yaml`.
   */
  readonly config: Record<string, unknown>

  /**
   * Type-specific context payload.
   */
  readonly typeContext: unknown
}

/**
 * Base contract implemented by all specd plugins.
 */
export interface SpecdPlugin {
  /**
   * NPM package name.
   */
  readonly name: string

  /**
   * Plugin type.
   */
  readonly type: PluginType

  /**
   * Plugin semantic version.
   */
  readonly version: string

  /**
   * Declared configuration schema.
   */
  readonly configSchema: Record<string, ConfigSchemaEntry>

  /**
   * Initializes plugin runtime.
   *
   * @param context - Plugin context.
   * @returns A promise that resolves when initialization completes.
   */
  init(context: PluginContext): Promise<void>

  /**
   * Cleans up plugin resources.
   *
   * @returns A promise that resolves when cleanup finishes.
   */
  destroy(): Promise<void>
}

/**
 * Checks whether a value satisfies the base plugin contract.
 *
 * Validates that the value is a non-null object with the required
 * {@link SpecdPlugin} properties and that its `type` field is one
 * of the known {@link PLUGIN_TYPES}.
 *
 * @param value - Candidate runtime value.
 * @returns `true` when the value matches {@link SpecdPlugin}.
 */
export function isSpecdPlugin(value: unknown): value is SpecdPlugin {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['name'] === 'string' &&
    typeof record['type'] === 'string' &&
    typeof record['version'] === 'string' &&
    typeof record['configSchema'] === 'object' &&
    record['configSchema'] !== null &&
    typeof record['init'] === 'function' &&
    typeof record['destroy'] === 'function' &&
    (PLUGIN_TYPES as readonly string[]).includes(record['type'])
  )
}
