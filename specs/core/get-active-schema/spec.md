# GetActiveSchema

## Overview

The `GetActiveSchema` use case resolves and returns the active schema for the project. It delegates to `ResolveSchema` which orchestrates the full resolution pipeline (base schema → extends chain → plugins → overrides → merge → build). This is the canonical way for delivery mechanisms to obtain the project's schema without duplicating resolution logic.

## Requirements

### Requirement: Accepts no input

`execute()` MUST take no arguments. All configuration is provided at construction time, not at invocation time.

### Requirement: Delegates to ResolveSchema

The use case MUST call `resolveSchema.execute()` to obtain the active schema. It SHALL NOT resolve schemas directly or implement any resolution logic itself. `ResolveSchema` handles the full pipeline: base resolution, extends chain, plugins, overrides, merge, and build.

### Requirement: Returns the resolved Schema on success

`execute` MUST return `Promise<Schema>` — the fully-resolved, customised schema.

### Requirement: Construction dependencies

`GetActiveSchema` MUST be constructed with one dependency:

- `resolveSchema` (`ResolveSchema`) — the use case that orchestrates the full schema resolution pipeline.

All lower-level dependencies (schema registry, schema ref, plugins, overrides) are provided to `ResolveSchema` at its construction time.

## Constraints

- The use case contains no business logic — it is a thin delegation to `ResolveSchema`.
- The schema reference is fixed at construction time — calling `execute` multiple times resolves the same reference.
- The use case is async — it returns `Promise<Schema>`.

## Spec Dependencies

- [`specs/core/resolve-schema/spec.md`](../resolve-schema/spec.md) — full schema resolution pipeline
- [`specs/core/config/spec.md`](../config/spec.md) — schema reference field and resolution semantics
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `Schema` value object structure
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
