# plugin-manager:uninstall-plugin-use-case

## Purpose

Use case that orchestrates plugin removal. Loads the plugin and calls its uninstall method.

## Requirements

### Requirement: Input

```typescript
interface UninstallPluginInput {
  readonly pluginName: string
  readonly projectRoot: string
  readonly options?: Record<string, unknown> // plugin-specific options
}
```

### Requirement: Output

```typescript
type UninstallPluginOutput = void
```

### Requirement: Behavior

The use case MUST:

1. Load the plugin via `PluginLoader`
2. Verify the loaded plugin is an `AgentPlugin` using the `isAgentPlugin` type guard
3. If the plugin is not an `AgentPlugin`, throw `PluginValidationError`
4. Call the plugin's `uninstall()` method with project root and options
5. Return void (no config mutation)

### Requirement: Error handling

On failure, the use case MUST throw an appropriate error:

- `PluginNotFoundError` — when the plugin package cannot be resolved
- `PluginValidationError` — when the plugin fails type guard validation (not an `AgentPlugin`)
- `PluginValidationError` — when `uninstall()` throws

## Constraints

- This use case does NOT modify config — config mutation is the CLI's responsibility.

## Spec Dependencies

- [`plugin-manager:agent-plugin-type`](../agent-plugin-type/spec.md) — plugin interface
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
