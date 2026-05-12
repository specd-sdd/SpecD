# Proposal: schema-provider

## Motivation

`schemaOverrides` declared in `specd.yaml` are never applied at runtime. Every use case that needs the schema calls `SchemaRegistry.resolve()` directly, which returns the base schema without plugins or overrides. Only `ResolveSchema` (the use case) applies merge layers, but no other use case calls it. This means `schemaOverrides` for workflow hooks, artifact rules, validations, and metadata extraction are all silently ignored.

## Current behaviour

The kernel constructs 11+ use cases with the triple `(SchemaRegistry, schemaRef, workspaceSchemasPaths)`. Each use case calls `schemas.resolve(schemaRef, workspaceSchemasPaths)` at execution time, getting back the raw base schema from disk/npm. `ResolveSchema` — which applies extends chains, plugins, and overrides — is only used by `GetActiveSchema` and `schema show`. The `schemaOverrides` config field is loaded, stored in kernel internals, passed to `ResolveSchema`, but never reaches the use cases that actually consume the schema.

Additionally, each use case independently resolves the same schema on every call — redundant I/O for an immutable result within a kernel's lifetime.

## Proposed solution

Introduce a `SchemaProvider` port — an interface with a single `get(): Promise<Schema | null>` method. The kernel constructs one implementation that lazily resolves the schema (via `ResolveSchema`) on the first call and caches the result. All use cases receive this provider instead of the `(SchemaRegistry, schemaRef, workspaceSchemasPaths)` triple.

This:

- Fixes the `schemaOverrides` bug — every consumer gets the fully resolved schema
- Simplifies constructors — 3 params become 1
- Eliminates redundant resolution — schema is resolved once per kernel lifetime
- Keeps kernel construction synchronous — the async resolution is deferred to first use

## Specs affected

### New specs

_(none — `SchemaProvider` is a port interface, documented within affected specs)_

### Modified specs

- `core:core/kernel`: add `SchemaProvider` construction (wrapping `ResolveSchema`), pass it to all use cases instead of the registry triple
- `core:core/run-step-hooks`: replace `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` constructor params with `SchemaProvider`
- `core:core/transition-change`: same constructor simplification
- `core:core/get-status`: same constructor simplification
- `core:core/get-hook-instructions`: same constructor simplification
- `core:core/validate-artifacts`: same constructor simplification
- `core:core/compile-context`: same constructor simplification
- `core:core/archive-change`: same constructor simplification
- `core:core/get-artifact-instruction`: same constructor simplification
- `core:core/approve-spec`: update schema resolution in gate guard to use `SchemaProvider`
- `core:core/approve-signoff`: same gate guard update
- `core:core/generate-metadata`: replace `SchemaRegistry.resolve()` with `SchemaProvider.get()`
- `core:core/get-project-context`: same constructor simplification
- `core:core/validate-specs`: replace `SchemaRegistry.resolve()` with `SchemaProvider.get()`

## Impact

- **`@specd/core` — application layer**: new `SchemaProvider` port interface, all use case constructors updated
- **`@specd/core` — composition layer**: kernel wiring changes, new `LazySchemaProvider` implementation
- **`@specd/core` — composition/use-cases factories**: `createGetStatus`, `createTransitionChange`, etc. updated
- **Tests**: all use case tests need updated constructor calls (mechanical — replace triple with mock provider)
- **No CLI/MCP changes**: the kernel API surface (`Kernel` interface) is unchanged

## Open questions

_(none)_
