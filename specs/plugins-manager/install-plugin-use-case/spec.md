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
2. If the loaded plugin is an `AgentPlugin` (`isAgentPlugin`), call `install()` with the provided `SpecdConfig` and options and return `InstallPluginOutput`
3. If the loaded plugin is a `UiPlugin` (`isUiPlugin`), throw `PluginValidationError` directing callers to `InstallUiPlugin` — this use case MUST NOT install UI plugins
4. Otherwise throw `PluginValidationError` for an unknown plugin contract

UI plugin installation is specified by `plugin-manager:ui-plugin-type` (`InstallUiPlugin`).

### Requirement: Error handling

On failure, the use case MUST throw an appropriate error:

- `PluginNotFoundError` — when the plugin package cannot be resolved
- `PluginValidationError` — when the plugin is not an `AgentPlugin`, when a UI plugin is passed to this use case, or when `install()` throws

## Constraints

- This use case does NOT modify config — it only calls the plugin's install.
- Config mutation is the CLI's responsibility via ConfigWriter.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../agent-plugin-type/spec.md) — plugin interface
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins dynamically
