# plugin-manager:list-plugins-use-case

## Purpose

Use case that returns the plugin inventory — the status of each requested plugin.

## Requirements

### Requirement: Input

```typescript
interface ListPluginsInput {
  readonly pluginNames: readonly string[]
}
```

### Requirement: Output

```typescript
interface ListPluginsOutput {
  readonly plugins: readonly PluginListStatus[]
}

interface PluginListStatus {
  readonly name: string
  readonly status: 'loaded' | 'not_found' | 'error'
  readonly plugin?: SpecdPlugin
  readonly manifest?: SpecdPluginManifest // present when status is 'loaded'
  readonly contributions?: readonly string[] // ids declared by the manifest, when loaded
  readonly error?: string // present when status is 'error'
}
```

The input is `{ pluginNames: readonly string[] }`. Entries are returned in input order.

### Requirement: Behavior

For each plugin name:

- Attempt to load via `PluginLoader` (manifest validated before code is imported)
- If loaded successfully → status: `'loaded'`, with its manifest and declared contribution ids
- If the loader throws `PluginNotFoundError` → status: `'not_found'`
- If load or validation fails with any other error → status: `'error'` with the error message (a non-`Error` rejection is rendered through its `message` when it has one); a failed load carries the typed error message (for a non-`SpecdError` rejection `Plugin '<name>' failed validation (load): <original>`); a loader result that is not `{ plugin, manifest }` is also `'error'`, never `'loaded'`
- A failure for one plugin MUST NOT prevent the remaining plugins from being listed

The use case MUST NOT call `init`, `install` or `destroy` and MUST NOT depend on plugin kinds.

## Constraints

- Read-only operation, no state modification.

## Spec Dependencies

- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads plugins
