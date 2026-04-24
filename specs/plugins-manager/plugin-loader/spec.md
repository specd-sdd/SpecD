# plugin-manager:plugin-loader

## Purpose

Infrastructure component for dynamically loading plugins. Handles package resolution, manifest validation, and plugin instantiation.

## Requirements

### Requirement: Load workflow

The loader MUST:

1. **Package availability**: The package must be in node_modules (installed via npm/pnpm or linked as workspace)
2. **Resolve path**: Use `import.meta.resolve()` or `require.resolve()` to get package path
3. **Read manifest**: Read `specd-plugin.json` from the package root
4. **Validate manifest**: Validate with Zod schema (including `version` field)
5. **Dynamic import**: `import(name)` as ESM module
6. **Factory call**: Call `create()` factory function, passing the loader options
7. **Validate interface**: Use `isSpecdPlugin` and `isAgentPlugin` from the domain layer to validate the returned object

### Requirement: Manifest schema

```typescript
const SpecdPluginManifestSchema = z.object({
  schemaVersion: z.number().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  pluginType: z.enum(['agent']),
  minCoreVersion: z.string().default('*'),
})
```

### Requirement: Error handling

Validation failures MUST throw `PluginValidationError`:

- Base contract violation (missing `name`, `type`, `version`, `configSchema`, `init`, `destroy`) — caught by `isSpecdPlugin`
- Unknown plugin type (type not in `PLUGIN_TYPES`) — caught by `isSpecdPlugin`
- Agent-specific contract violation (missing `install` or `uninstall` when `pluginType` is `'agent'`) — caught by `isAgentPlugin`

### Requirement: Factory function

The npm package MUST export `create(options: PluginLoaderOptions): SpecdPlugin` as default or named export.

The `PluginLoaderOptions` SHALL contain the fully-resolved `SpecdConfig`:

```typescript
interface PluginLoaderOptions {
  readonly config: SpecdConfig
}
```

## Constraints

- All I/O happens here in the infrastructure layer.
- Zod validation happens at the boundary before reaching domain.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — plugin type
- [`plugin-manager:plugin-errors`](../plugin-errors/spec.md) — error classes
