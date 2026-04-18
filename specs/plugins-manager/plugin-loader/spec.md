# plugin-manager:plugin-loader

## Purpose

Infrastructure component for dynamically loading plugins. Handles package resolution, manifest validation, and plugin instantiation.

## Requirements

### Requirement: Load workflow

The loader MUST:

1. **Package availability**: The package must be in node_modules (installed via npm/pnpm or linked as workspace)
2. **Resolve path**: Use `import.meta.resolve()` or `require.resolve()` to get package path
3. **Read manifest**: Read `specd-plugin.json` (no import yet)
4. **Validate manifest**: Validate with Zod schema
5. **Dynamic import**: `import(name)` as ESM module
6. **Factory call**: Call `create()` factory function
7. **Validate interface**: Validate the returned object against expected interface

### Requirement: Manifest schema

```typescript
const SpecdPluginManifestSchema = z.object({
  schemaVersion: z.number().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  pluginType: z.enum(['agent']),
  minCoreVersion: z.string().default('*'),
})
```

### Requirement: Error handling

Validation failures MUST throw `PluginValidationError`.

### Requirement: Factory function

The npm package MUST export `create(): SpecdPlugin` as default or named export.

## Constraints

- All I/O happens here in the infrastructure layer.
- Zod validation happens at the boundary before reaching domain.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — plugin type
- [`plugin-manager:plugin-errors`](../plugin-errors/spec.md) — error classes
