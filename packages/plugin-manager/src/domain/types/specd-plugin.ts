/**
 * Plugin type discriminator.
 */
export type PluginType = 'agent'

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
