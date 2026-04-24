# plugin-manager:update-plugin-use-case

## Purpose

Use case that orchestrates plugin update. This is an idempotent reinstall that does not modify config.

## Requirements

### Requirement: Input

Same as `InstallPluginInput` (using `SpecdConfig`):

```typescript
interface UpdatePluginInput {
  readonly pluginName: string
  readonly config: SpecdConfig
  readonly options?: Record<string, unknown>
}
```

### Requirement: Output

Same as `InstallPluginOutput`:

```typescript
interface UpdatePluginOutput {
  readonly success: boolean
  readonly message: string
  readonly data?: unknown
}
```

### Requirement: Behavior

The use case MUST:

1. Load the plugin via `PluginLoader`
2. Verify the loaded plugin is an `AgentPlugin` using the `isAgentPlugin` type guard
3. If the plugin is not an `AgentPlugin`, throw `PluginValidationError`
4. Call the plugin's `install()` method with the provided `SpecdConfig` (same as install, but no config mutation)
5. Return a generic result

### Requirement: Idempotency

The use case MUST be idempotent — calling it multiple times produces the same result.

### Requirement: Error handling

On failure, the use case MUST throw an appropriate error:

- `PluginNotFoundError` — when the plugin package cannot be resolved
- `PluginValidationError` — when the plugin fails type guard validation (not an `AgentPlugin`)
- `PluginValidationError` — when `install()` throws

## Constraints

- This use case does NOT modify config.
- The CLI is responsible for any config operations.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../agent-plugin-type/spec.md) — plugin interface
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
