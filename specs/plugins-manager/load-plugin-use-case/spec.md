# plugin-manager:load-plugin-use-case

## Purpose

Use case that loads and validates a single plugin. Returns the loaded plugin or an error.

## Requirements

### Requirement: Input

```typescript
interface LoadPluginInput {
  readonly pluginName: string
}
```

### Requirement: Output

Object type:

```typescript
type LoadPluginOutput = { plugin: SpecdPlugin; manifest: SpecdPluginManifest }
```

`manifest` is the validated manifest, so callers (`plugins show`, `plugins list`) can report contributions, `configSchema` and `defaultConfig` without a second read. All loader errors are thrown, never returned: `PluginNotFoundError` when the package cannot be resolved, `PluginValidationError` and the other typed loader errors (duplicate contribution id, unknown kind, unsupported schema keyword, invalid default config) when validation fails, each naming the plugin.

### Requirement: Behavior

The use case MUST:

1. Load the plugin via `PluginLoader` (manifest validated before plugin code is imported)
2. Rely on the loader to validate that the plugin implements the base `SpecdPlugin` contract (`isSpecdPlugin`); the use case does not repeat the check
3. Return the plugin and its validated manifest; loader errors propagate as thrown errors

The use case MUST NOT call `init`, `install` or `destroy`.

## Constraints

- Read-only operation, no state modification.
- Errors are typed for catchable handling.

## Spec Dependencies

- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
