# ResolveSchema

## Purpose

Schema resolution involves multiple steps (base lookup, extends chain, plugin merging, overrides) that must execute in a precise order, and scattering this logic across callers would lead to duplication and inconsistency. `ResolveSchema` is the application use case that orchestrates the full resolution pipeline — base schema file, recursive `extends` chain, schema plugins, merge layers via `mergeSchemaLayers`, and final `Schema` construction via `buildSchema` — providing a single entry point for obtaining a fully-resolved, customised schema. `GetActiveSchema` delegates to `ResolveSchema` rather than resolving schemas directly.

## Requirements

### Requirement: Construction dependencies

`ResolveSchema` MUST be constructed with:

- `schemas` (`SchemaRegistry`) — the registry port for resolving schema and plugin references
- `schemaRef` (`string`) — the base schema reference from `specd.yaml`
- `workspaceSchemasPaths` (`ReadonlyMap<string, string>`) — workspace-to-schemas-path map
- `schemaPlugins` (`readonly string[]`) — plugin references from `specd.yaml`, in declaration order
- `schemaOverrides` (`SchemaOperations | undefined`) — inline overrides from `specd.yaml`

### Requirement: Execute takes no arguments

`execute()` MUST take no arguments. All configuration is provided at construction time.

### Requirement: Resolution pipeline

`execute` MUST perform the following steps in order:

1. **Resolve base** — call `SchemaRegistry.resolve(schemaRef, workspaceSchemasPaths)` to obtain the base schema's raw YAML data. If `null`, throw `SchemaNotFoundError`.

2. **Resolve extends chain** — if the base schema declares `extends`, resolve the parent schema recursively until a schema with no `extends` is reached. Each resolved schema becomes an `extends` layer. Detect cycles by tracking resolved file paths; throw `SchemaValidationError` if a cycle is found.

3. **Build extends layers** — construct `SchemaLayer[]` from the extends chain, ordered from root ancestor to immediate parent. Each layer has `source: 'extends'`.

4. **Resolve plugins** — for each reference in `schemaPlugins`, call `SchemaRegistry.resolve(ref, workspaceSchemasPaths)`. If `null`, throw `SchemaNotFoundError`. If the resolved file has `kind: schema` instead of `kind: schema-plugin`, throw `SchemaValidationError`. Each plugin's operations become a `SchemaLayer` with `source: 'plugin'`.

5. **Build override layer** — if `schemaOverrides` is defined, construct a single `SchemaLayer` with `source: 'override'`.

6. **Merge** — call `mergeSchemaLayers(base, [...extendsLayers, ...pluginLayers, ...overrideLayers])` to produce a merged `SchemaYamlData`.

7. **Build** — call `buildSchema(schemaRef, mergedData, templates)` to construct the final `Schema` entity. Template loading happens during base resolution (step 1) — templates from the extends chain are merged (child templates override parent templates with the same path).

### Requirement: Returns the resolved Schema

`execute` MUST return `Promise<Schema>` — the fully-resolved, customised schema.

### Requirement: Template merging across extends chain

When resolving the extends chain, templates from each schema in the chain are accumulated. A child schema's template overrides a parent's template when both declare the same relative path. The final template map passed to `buildSchema` reflects this merge.

### Requirement: SchemaRegistry returns raw data

`SchemaRegistry.resolve()` must return enough information for `ResolveSchema` to:

- Access the parsed `SchemaYamlData` (for the merge engine)
- Access loaded templates (for `buildSchema`)
- Know the resolved file path (for cycle detection in extends)

This may require extending `SchemaRegistry.resolve()` to return a richer result type, or `ResolveSchema` may call a lower-level method that returns intermediate data before domain construction.

## Constraints

- `ResolveSchema` is an application use case — it lives in `application/use-cases/`
- It imports domain services (`mergeSchemaLayers`, `buildSchema`) and the `SchemaRegistry` port
- It MUST NOT import infrastructure modules directly
- The resolution pipeline is deterministic — same inputs always produce the same schema
- Plugin resolution failures are hard errors, not warnings
- The `extends` chain has no depth limit, but cycles are detected

## Spec Dependencies

- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `kind`, `extends`, schema structure
- [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md) — `mergeSchemaLayers`, `SchemaLayer`
- [`specs/core/build-schema/spec.md`](../build-schema/spec.md) — `buildSchema`, `SchemaYamlData`
- [`specs/core/port-schema-registry/spec.md`](../port-schema-registry/spec.md) — `SchemaRegistry` port
- [`specs/core/config/spec.md`](../config/spec.md) — `schemaPlugins`, `schemaOverrides` fields
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — use case design
