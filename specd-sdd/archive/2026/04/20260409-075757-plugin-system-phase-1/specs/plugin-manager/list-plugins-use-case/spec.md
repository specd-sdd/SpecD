# plugin-manager:list-plugins-use-case

## Purpose

Use case that returns the plugin inventory — the status of each requested plugin.

## Requirements

### Requirement: Input

```typescript
interface ListPluginsInput {
  readonly pluginNames: string[]
}
```

### Requirement: Output

```typescript
interface ListPluginsOutput {
  readonly plugins: Array<{
    name: string
    status: 'loaded' | 'not_found' | 'error'
    plugin?: SpecdPlugin
    error?: string
  }>
}
```

### Requirement: Behavior

For each plugin name:

- Attempt to load via `PluginLoader`
- If loaded successfully → status: `'loaded'`
- If npm package not found → status: `'not_found'`
- If load fails → status: `'error'` with error message

## Constraints

- Read-only operation, no state modification.

## Spec Dependencies

- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
