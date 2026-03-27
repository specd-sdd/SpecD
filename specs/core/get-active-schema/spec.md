# GetActiveSchema

## Purpose

Delivery mechanisms (CLI, MCP, plugins) need a single canonical way to obtain a resolved schema — either the project's active schema or an arbitrary schema identified by reference or file path — without duplicating multi-step resolution logic. `GetActiveSchema` provides this by delegating to `ResolveSchema` for the project's active schema, or by resolving a ref/file through the `SchemaRegistry` with extends chain resolution, and returning the resulting `Schema` entity.

## Requirements

### Requirement: Optional input

`execute()` MAY be called with no arguments or with an optional `GetActiveSchemaInput`:

```typescript
type GetActiveSchemaInput =
  | { readonly mode: 'ref'; readonly ref: string }
  | { readonly mode: 'file'; readonly filePath: string }
```

- When called with **no arguments** (or `undefined`): resolves the project's active schema via `ResolveSchema` — the current default behaviour.
- When called with `{ mode: 'ref', ref }`: resolves the referenced schema through `SchemaRegistry` with extends chain resolution, without applying project plugins or overrides.
- When called with `{ mode: 'file', filePath }`: resolves the schema from the given file path with extends chain resolution, without applying project plugins or overrides.

### Requirement: Delegates to ResolveSchema

When called without input (project mode), the use case MUST call `resolveSchema.execute()` to obtain the active schema. It SHALL NOT resolve schemas directly or implement any resolution logic itself for this mode.

When called with `ref` or `file` input, the use case SHALL resolve the schema through `SchemaRegistry.resolveRaw()`, resolve the extends chain, merge templates, and build the `Schema` via `buildSchema`. No project plugins or overrides are applied in these modes.

### Requirement: Returns the resolved Schema on success

`execute` MUST return `Promise<Schema>` — the fully-resolved, customised schema.

### Requirement: Construction dependencies

`GetActiveSchema` MUST be constructed with:

- `resolveSchema` (`ResolveSchema`) — the use case that orchestrates the full schema resolution pipeline (used for project mode).
- `schemas` (`SchemaRegistry`) — the registry port for resolving schema references (used for ref and file modes).
- `buildSchemaFn` (`(ref: string, data: SchemaYamlData, templates: ReadonlyMap<string, string>) => Schema`) — the domain service for building the Schema entity (used for ref and file modes).

All lower-level dependencies (schema ref, plugins, overrides) are provided to `ResolveSchema` at its construction time.

## Constraints

- For project mode, the use case contains no business logic — it is a thin delegation to `ResolveSchema`.
- For ref and file modes, the use case orchestrates `SchemaRegistry.resolveRaw()`, extends chain resolution, template merging, and `buildSchema` — the same pattern used by `ValidateSchema` for file mode.
- The schema reference is fixed at construction time for project mode — calling `execute()` multiple times without input resolves the same reference.
- The use case is async — it returns `Promise<Schema>`.

## Spec Dependencies

- [`specs/core/resolve-schema/spec.md`](../resolve-schema/spec.md) — full schema resolution pipeline (project mode)
- [`specs/core/config/spec.md`](../config/spec.md) — schema reference field and resolution semantics
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `Schema` value object structure
- [`specs/core/schema-registry-port/spec.md`](../schema-registry-port/spec.md) — `SchemaRegistry` port for ref and file resolution
- [`specs/core/build-schema/spec.md`](../build-schema/spec.md) — `buildSchema` domain service for Schema construction
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
