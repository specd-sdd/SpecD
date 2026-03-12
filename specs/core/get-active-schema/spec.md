# GetActiveSchema

## Overview

The `GetActiveSchema` use case resolves and returns the active schema for the project. It delegates to the `SchemaRegistry` port using the schema reference from `specd.yaml` and throws `SchemaNotFoundError` if resolution fails. This is the canonical way for delivery mechanisms to obtain the project's schema without duplicating resolution logic.

## Requirements

### Requirement: Accepts no input

`execute()` MUST take no arguments. The schema reference and workspace schemas paths are provided at construction time, not at invocation time.

### Requirement: Resolves the schema via SchemaRegistry

The use case MUST call `SchemaRegistry.resolve(schemaRef, workspaceSchemasPaths)` to resolve the active schema. It SHALL NOT load schema files directly or implement any resolution logic itself.

### Requirement: Returns the resolved Schema on success

`execute` MUST return `Promise<Schema>` — the fully-parsed schema value object resolved by the registry.

### Requirement: Throws SchemaNotFoundError when resolution fails

When `SchemaRegistry.resolve` returns `null`, the use case MUST throw a `SchemaNotFoundError` with the schema reference string. It MUST NOT return `null` — the error is the only failure signal.

### Requirement: Construction dependencies

`GetActiveSchema` MUST be constructed with three dependencies:

- `schemas` (`SchemaRegistry`) — the registry port for resolving schema references.
- `schemaRef` (`string`) — the schema reference from `specd.yaml` (e.g. `"@specd/schema-std"`).
- `workspaceSchemasPaths` (`ReadonlyMap<string, string>`) — map of workspace name to absolute schemas directory path, used for workspace-qualified schema resolution.

## Constraints

- The use case contains no business logic beyond null-check and error conversion.
- The schema reference is fixed at construction time — calling `execute` multiple times resolves the same reference.
- The use case is async — it returns `Promise<Schema>`.

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — schema reference field and resolution semantics
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `Schema` value object structure
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
