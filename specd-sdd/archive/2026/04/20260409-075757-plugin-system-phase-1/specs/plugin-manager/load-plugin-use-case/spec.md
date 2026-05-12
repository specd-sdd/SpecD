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

Discriminated union:

```typescript
type LoadPluginOutput =
  | { plugin: SpecdPlugin }
  | { error: PluginNotFoundError | PluginValidationError }
```

### Requirement: Behavior

The use case MUST:

1. Load the plugin via `PluginLoader`
2. Validate the plugin implements the expected interface
3. Return the plugin or an error

## Constraints

- Read-only operation, no state modification.
- Errors are typed for catchable handling.

## Spec Dependencies

- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
