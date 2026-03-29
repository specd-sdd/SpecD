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

An optional `options` parameter MAY be provided alongside the input:

```typescript
interface GetActiveSchemaOptions {
  readonly raw?: boolean
  readonly resolveTemplates?: boolean
}
```

- `raw` — when `true`, returns the parsed schema data without resolving `extends`, applying plugins, or merging overrides. In project mode, this returns the base schema file's parsed data.
- `resolveTemplates` — when `true` and `raw` is also `true`, template file references in the raw schema are resolved and their content included. Ignored when `raw` is `false` or absent.

### Requirement: Delegates to ResolveSchema

When called without input (project mode), the use case MUST call `resolveSchema.execute()` to obtain the active schema. It SHALL NOT resolve schemas directly or implement any resolution logic itself for this mode.

When called with `ref` or `file` input, the use case SHALL resolve the schema through `SchemaRegistry.resolveRaw()`, resolve the extends chain, merge templates, and build the `Schema` via `buildSchema`. No project plugins or overrides are applied in these modes.

### Requirement: Returns the resolved Schema on success

When `raw` is `false` or absent, `execute` MUST return `Promise<Schema>` — the fully-resolved, customised schema.

When `raw` is `true`, `execute` MUST return `Promise<SchemaRawResult>` — the parsed but unresolved schema data. `SchemaRawResult` contains the `SchemaYamlData` and optionally resolved template contents (when `resolveTemplates` is `true`).

The return type is a discriminated union:

```typescript
type GetActiveSchemaResult =
  | { readonly raw: false; readonly schema: Schema }
  | {
      readonly raw: true
      readonly data: SchemaYamlData
      readonly templates: ReadonlyMap<string, string>
    }
```

### Requirement: Construction dependencies

`GetActiveSchema` MUST be constructed with:

- `resolveSchema` (`ResolveSchema`) — the use case that orchestrates the full schema resolution pipeline (used for project mode).
- `schemas` (`SchemaRegistry`) — the registry port for resolving schema references (used for ref and file modes).
- `buildSchemaFn` (`(ref: string, data: SchemaYamlData, templates: ReadonlyMap<string, string>) => Schema`) — the domain service for building the Schema entity (used for ref and file modes).

All lower-level dependencies (schema ref, plugins, overrides) are provided to `ResolveSchema` at its construction time.

## Constraints

- For project mode without `raw`, the use case contains no business logic — it is a thin delegation to `ResolveSchema`.
- For ref and file modes without `raw`, the use case orchestrates `SchemaRegistry.resolveRaw()`, extends chain resolution, template merging, and `buildSchema` — the same pattern used by `ValidateSchema` for file mode.
- For raw mode (any input mode), the use case fetches the schema file via `SchemaRegistry.resolveRaw()` and returns the `SchemaYamlData` directly, without resolving the extends chain or calling `buildSchema`.
- The schema reference is fixed at construction time for project mode — calling `execute()` multiple times without input resolves the same reference.
- The use case is async — it returns `Promise<GetActiveSchemaResult>`.

## Spec Dependencies

- [`specs/core/resolve-schema/spec.md`](../resolve-schema/spec.md) — full schema resolution pipeline (project mode)
- [`specs/core/config/spec.md`](../config/spec.md) — schema reference field and resolution semantics
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `Schema` value object structure
- [`specs/core/schema-registry-port/spec.md`](../schema-registry-port/spec.md) — `SchemaRegistry` port for ref and file resolution
- [`specs/core/build-schema/spec.md`](../build-schema/spec.md) — `buildSchema` domain service for Schema construction
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
