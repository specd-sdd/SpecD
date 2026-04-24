# plugin-manager:install-plugin-use-case

## Purpose

Use case that orchestrates plugin installation. Loads the plugin, calls its install method, and returns a generic result.

## Requirements

### Requirement: Input

```typescript
interface InstallPluginInput {
  readonly pluginName: string // npm package name
  readonly config: SpecdConfig
  readonly options?: Record<string, unknown> // plugin-specific options
}
```

### Requirement: Output

```typescript
interface InstallPluginOutput {
  readonly success: boolean
  readonly message: string // human-readable result
  readonly data?: unknown // plugin-specific result
}
```

### Requirement: Behavior

The use case MUST:

1. Load the plugin via `PluginLoader`
2. Verify the loaded plugin is an `AgentPlugin` using the `isAgentPlugin` type guard
3. If the plugin is not an `AgentPlugin`, throw `PluginValidationError`
4. Call the plugin's `install()` method with the provided `SpecdConfig` and options
5. Return a generic result (no config mutation — that is the CLI's responsibility)

### Requirement: Error handling

On failure, the use case MUST throw an appropriate error:

- `PluginNotFoundError` — when the plugin package cannot be resolved
- `PluginValidationError` — when the plugin fails type guard validation (not an `AgentPlugin`)
- `PluginValidationError` — when `install()` throws

## Constraints

- This use case does NOT modify config — it only calls the plugin's install.
- Config mutation is the CLI's responsibility via ConfigWriter.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../agent-plugin-type/spec.md) — plugin interface
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins dynamically
