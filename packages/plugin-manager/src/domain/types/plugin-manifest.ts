/** Kind → contribution id → manifest block. */
export type ContributionBlocks = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/**
 * Static plugin manifest (`specd-plugin.json` schema version 2).
 */
export interface SpecdPluginManifest {
  /** Manifest schema version. Always `2`. */
  readonly schemaVersion: 2
  /** Scoped plugin name. */
  readonly name: string
  /** Plugin version, equal to the runtime plugin's `version`. */
  readonly version: string
  /** Optional human-readable description. */
  readonly description?: string
  /** Minimum compatible core version. Defaults to `*`. */
  readonly minCoreVersion: string
  /** Declared contributions grouped by kind. */
  readonly contributes: ContributionBlocks
  /** Optional JSON Schema subset for this plugin's config. */
  readonly configSchema?: PluginConfigSchema
  /** Optional defaults validated against `configSchema`. */
  readonly defaultConfig?: Readonly<Record<string, unknown>>
}

/** Root config schema. `type` is always `object`. */
export type PluginConfigSchema = {
  readonly type: 'object'
  readonly properties?: Readonly<Record<string, ConfigSchemaNode>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
}

/** One node of the supported JSON Schema subset. */
export type ConfigSchemaNode = {
  readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  readonly enum?: readonly (string | number | boolean)[]
  readonly default?: unknown
  readonly items?: ConfigSchemaNode
  readonly properties?: Readonly<Record<string, ConfigSchemaNode>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
}
