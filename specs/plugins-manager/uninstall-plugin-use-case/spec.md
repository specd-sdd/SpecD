# plugin-manager:uninstall-plugin-use-case

## Purpose

Use case that orchestrates plugin removal for any plugin, whatever kinds it contributes. Loads the plugin and calls its optional uninstall method with the selected contributions.

## Requirements

### Requirement: Input

```typescript
interface UninstallPluginInput {
  readonly pluginName: string
  readonly config: SpecdConfig
  readonly contributions?: readonly string[] // ids that were installed; omitted = all declared
  readonly options?: Record<string, unknown> // plugin-specific options
}
```

### Requirement: Output

```typescript
type UninstallPluginOutput = void
```

### Requirement: Behavior

The use case MUST:

1. Load the plugin and its validated manifest via `PluginLoader`
2. Resolve the contribution ids as in `InstallPlugin` (unknown id throws `UnknownContributionError`)
3. If the manifest declares `contributes.agents`, verify the loaded plugin is an `AgentPlugin` using `isAgentPlugin`; otherwise throw `PluginValidationError`
4. Call the plugin's `uninstall()` method, when implemented, with a `PluginInstallContext` (`config`, `contributions`, and `options`, forwarded as given); `contributions` follows the same rule as `InstallPlugin` (the `agents` ids only when the manifest declares `agents`; when none of the selected ids is an `agents` id the hook is still called with `contributions: []`); a plugin without `uninstall` is a successful no-op
5. Return void (no config mutation)

The use case MUST NOT call `init` or `destroy`, and MUST NOT assume any plugin kind or config bucket.

### Requirement: Error handling

On failure, the use case MUST throw an appropriate error:

- `PluginNotFoundError` — when the plugin package cannot be resolved
- `PluginValidationError` — when the plugin declares `agents` but is not an `AgentPlugin`
- `UnknownContributionError` — when a requested id is not declared by the manifest
- `PluginValidationError` naming the plugin, with the original error as `cause`, when `uninstall()` throws an error that is not already a `SpecdError`; a `SpecdError` thrown by the hook propagates unchanged

## Constraints

- This use case does NOT modify config — config mutation is the CLI's responsibility.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
- [`plugin-manager:plugin-errors`](../plugin-errors/spec.md) — typed errors thrown by the use case
- [`plugin-manager:agent-plugin-type`](../agent-plugin-type/spec.md) — `AgentPlugin` and `isAgentPlugin`
