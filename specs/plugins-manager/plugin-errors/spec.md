# plugin-manager:plugin-errors

## Purpose

Defines error classes for plugin operations. All errors extend the base `SpecdError` from the domain.

## Requirements

### Requirement: PluginNotFoundError

```typescript
class PluginNotFoundError extends SpecdError {
  readonly pluginName: string
}
```

The error MUST include the plugin name that was not found.

### Requirement: PluginValidationError

```typescript
class PluginValidationError extends SpecdError {
  readonly pluginName: string
  readonly fields: string[]
}
```

The error MUST include:

- The plugin name that failed validation
- Array of fields that failed validation

## Constraints

- Errors MUST extend `SpecdError` from `@specd/core`.
- Errors SHOULD be catchable by type for error handling.

## Spec Dependencies

- [`default:_global/architecture`](../default/_global/architecture/spec.md) — SpecdError base class
