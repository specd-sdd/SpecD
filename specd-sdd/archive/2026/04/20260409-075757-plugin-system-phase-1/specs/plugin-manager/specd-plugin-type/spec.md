# plugin-manager:specd-plugin-type

## Purpose

Defines the base plugin interface (`SpecdPlugin`) that all specd plugins must implement. This is the foundation for extensible plugin types.

## Requirements

### Requirement: PluginType

```typescript
type PluginType = 'agent' // extensible
```

### Requirement: SpecdPlugin interface

All plugins MUST implement:

- `name: string` — npm package name
- `type: PluginType` — plugin type
- `version: string` — semver version
- `configSchema: Record<string, ConfigSchemaEntry>` — configuration schema
- `init(context: PluginContext): Promise<void>` — initialization
- `destroy(): Promise<void>` — cleanup

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

## Constraints

- Plugins are pure — no direct I/O in the interface.
- The `init()` and `destroy()` methods handle lifecycle.

## Spec Dependencies

- [`default:_global/architecture`](../default/_global/architecture/spec.md) — architecture constraints
