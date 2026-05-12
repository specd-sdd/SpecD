# Proposal: extract-schema-repository

## Motivation

The project config (`specd.yaml`) already models workspace schemas with an explicit `adapter` key (e.g. `adapter: fs`), identical to how `specs` and `storage` sections are structured. However, the implementation bypasses this: `kernel-internals.ts` extracts only the raw `schemasPath` string from each workspace and passes it as a `Map<string, string>` through every use case that needs schema resolution. This means the adapter abstraction declared in config is not honoured, and there is no clean extension point for alternative schema storage backends.

## Current behaviour

- `SchemaRegistry` is an interface with three methods (`resolve`, `resolveRaw`, `list`), all of which receive `workspaceSchemasPaths: ReadonlyMap<string, string>` as a parameter.
- `FsSchemaRegistry` performs direct filesystem access (read files, scan directories) for workspace schemas inside its implementation.
- The composition layer (`kernel-internals.ts`) builds the `workspaceSchemasPaths` map by iterating over `config.workspaces` and extracting `ws.schemasPath`. This map is then threaded through `KernelInternals` into `ResolveSchema` and every use case that calls it.
- Unlike `SpecRepository` and `ChangeRepository`, there is no per-workspace repository instance for schemas — no `Repository` base class usage, no workspace/ownership/isExternal metadata.

## Proposed solution

Extract a `SchemaRepository` abstract class following the existing repository pattern:

1. **`SchemaRepository` (new port)** — abstract class extending `Repository`, one instance per workspace. Responsible for reading and listing schemas from a single workspace's storage location. `FsSchemaRepository` as the v1 adapter.

2. **`SchemaRegistry` (refactored)** — becomes a pure router. Holds a `Map<string, SchemaRepository>` internally (injected at construction). Routes by prefix:
   - `@scope/name` → npm resolution (stays in registry — not a workspace concern)
   - `#workspace:name` → delegates to the corresponding `SchemaRepository`
   - `#name` / bare name → delegates to `SchemaRepository` for `default` workspace
   - Relative/absolute path → direct resolution (stays in registry)

3. **Composition** — `kernel-internals.ts` instantiates one `SchemaRepository` per workspace (using the `adapter` field from config), collects them in a map, and passes the map to the `SchemaRegistry` constructor. The `workspaceSchemasPaths` parameter is removed from all method signatures.

## Specs affected

### New specs

- `core:core/schema-repository-port`: Defines the `SchemaRepository` abstract class — extends `Repository`, declares methods for reading and listing schemas within a single workspace. Specifies the `FsSchemaRepository` adapter contract.

### Modified specs

- `core:core/schema-registry-port`: Remove `workspaceSchemasPaths` parameter from all method signatures. Add constructor/configuration requirement for receiving `SchemaRepository` instances. Update routing description to delegate workspace schema access to repositories instead of accessing filesystem directly.

## Impact

- **Port layer** (`application/ports/`): New `schema-repository.ts` file; modified `schema-registry.ts` signatures.
- **Infrastructure** (`infrastructure/fs/`): New `FsSchemaRepository` class extracting workspace filesystem operations from `FsSchemaRegistry`. `FsSchemaRegistry` simplified — workspace schema reads delegated to repositories.
- **Composition** (`composition/`): `kernel-internals.ts` changes to instantiate `SchemaRepository` per workspace and pass them to `SchemaRegistry`. `KernelInternals` type updated (no more `workspaceSchemasPaths`).
- **Use cases**: `ResolveSchema` and all use cases that currently pass `workspaceSchemasPaths` lose that parameter — they call `SchemaRegistry` without it.
- **Tests**: `FsSchemaRegistry` tests split — workspace schema tests move to `FsSchemaRepository` tests.

## Open questions

None — the pattern is well-established by `SpecRepository` and `ChangeRepository`, and the config already declares the adapter structure.
