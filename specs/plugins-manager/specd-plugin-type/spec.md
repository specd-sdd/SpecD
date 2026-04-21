# plugin-manager:specd-plugin-type

## Purpose

Defines the base plugin interface (`SpecdPlugin`) that all specd plugins must implement. This is the foundation for extensible plugin types.

## Requirements

### Requirement: PluginType

The spec MUST define a runtime const array of known plugin types and derive the `PluginType` union from it:

```typescript
export const PLUGIN_TYPES = ['agent'] as const
export type PluginType = (typeof PLUGIN_TYPES)[number]
```

Adding a new plugin type requires only adding a string to the `PLUGIN_TYPES` array — both compile-time type and runtime validation update automatically.

### Requirement: SpecdPlugin interface

All plugins MUST implement:

- `name: string` — plugin package name, sourced from the manifest at runtime
- `type: PluginType` — plugin type, hardcoded in the plugin class for type safety
- `version: string` — semver version, sourced from the manifest at runtime
- `configSchema: Record<string, ConfigSchemaEntry>` — configuration schema
- `init(context: PluginContext): Promise<void>` — initialization
- `destroy(): Promise<void>` — cleanup

Plugins MUST NOT hardcode `name` or `version` — these fields MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor. The `type` field MUST remain hardcoded to ensure compile-time type safety.

### Requirement: PluginContext

```typescript
interface PluginContext {
  projectRoot: string // absolute path
  config: Record<string, unknown> // this plugin's config from specd.yaml
  typeContext: unknown // type-specific context
}
```

### Requirement: ConfigSchemaEntry

```typescript
interface ConfigSchemaEntry {
  type: 'string' | 'boolean' | 'number'
  description: string
  default?: unknown
  required?: boolean
}
```

### Requirement: isSpecdPlugin type guard

The spec MUST export a pure function `isSpecdPlugin(value: unknown): value is SpecdPlugin` that validates:

1. `value` is a non-null object
2. `name`, `type`, and `version` are strings
3. `configSchema` is a non-null object
4. `init` and `destroy` are functions
5. `type` is one of the values in `PLUGIN_TYPES`

The `type` check against `PLUGIN_TYPES` ensures unknown plugin types are rejected at the base level, before any subtype validation runs.

## Constraints

- Plugins are pure — no direct I/O in the interface.
- The `init()` and `destroy()` methods handle lifecycle.
- `PLUGIN_TYPES` is the single source of truth for known plugin types — both compile-time (`PluginType`) and runtime validation derive from it.
- `name` and `version` MUST be sourced from `specd-plugin.json` at runtime, not hardcoded in plugin classes. The plugin factory (`create()`) reads the manifest and passes these values to the constructor.
- `type` MUST remain hardcoded in the plugin class — reading it from the manifest would allow invalid types at runtime.

## Spec Dependencies

- [`default:_global/architecture`](../default/_global/architecture/spec.md) — architecture constraints
