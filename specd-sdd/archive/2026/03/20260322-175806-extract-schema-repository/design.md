# Design: extract-schema-repository

## Non-goals

- **No new storage adapters** — only `FsSchemaRepository` is implemented. Cloud/HTTP adapters are future work.
- **No changes to schema resolution semantics** — npm resolution, path resolution, prefix routing logic, and `extends` chain all behave identically. Only the plumbing changes.
- **No changes to `ResolveSchema` merge pipeline** — the use case keeps calling `SchemaRegistry` methods; only the parameter signatures change.

## Affected areas

### `packages/core/src/application/ports/schema-registry.ts`

- Remove `workspaceSchemasPaths: ReadonlyMap<string, string>` parameter from all three methods (`resolve`, `resolveRaw`, `list`).
- Add import of `SchemaRepository` type.
- Update JSDoc to reflect delegation model.

### `packages/core/src/infrastructure/fs/schema-registry.ts`

- `FsSchemaRegistry` constructor gains a `schemaRepositories: ReadonlyMap<string, SchemaRepository>` parameter.
- Remove `workspaceSchemasPaths` parameter from `resolve`, `resolveRaw`, `list`.
- `_resolveFilePath` no longer receives or uses `workspaceSchemasPaths` — for `#workspace:name` refs, it delegates to the corresponding `SchemaRepository` from the stored map.
- Workspace schema reading (YAML parse + template loading) moves to `FsSchemaRepository`. The registry keeps npm resolution (`_resolveNpmPath`) and direct path resolution.
- `list()` aggregates workspace entries by calling `list()` on each `SchemaRepository`, then appends npm entries.

### `packages/core/src/application/use-cases/resolve-schema.ts`

- Remove `workspaceSchemasPaths` constructor parameter and private field `_workspaceSchemasPaths`.
- All calls to `this._schemas.resolveRaw(ref, this._workspaceSchemasPaths)` become `this._schemas.resolveRaw(ref)`.
- Constructor signature: `(schemas: SchemaRegistry, schemaRef: string, schemaPlugins: readonly string[], schemaOverrides: SchemaOperations | undefined)`.

### `packages/core/src/composition/kernel-internals.ts`

- Remove `workspaceSchemasPaths` from `KernelInternals` interface.
- `createKernelInternals` builds `SchemaRepository` instances per workspace (instead of the `workspaceSchemasPaths` map) and passes them to `createSchemaRegistry`.

### `packages/core/src/composition/kernel.ts`

- `createKernel` no longer passes `i.workspaceSchemasPaths` to `ResolveSchema` constructor.

### `packages/core/src/composition/schema-registry.ts`

- `FsSchemaRegistryOptions` gains `schemaRepositories: ReadonlyMap<string, SchemaRepository>`.
- `createSchemaRegistry` passes repositories to `FsSchemaRegistry`.

### 10 use-case factories in `packages/core/src/composition/use-cases/`

Every factory that currently builds `workspaceSchemasPaths` and passes it to `ResolveSchema` must be updated:

- `get-active-schema.ts`
- `validate-specs.ts`
- `validate-artifacts.ts`
- `compile-context.ts`
- `get-status.ts`
- `get-project-context.ts`
- `approve-spec.ts`
- `approve-signoff.ts`
- `archive-change.ts`
- `transition-change.ts`

For each:

- Remove `workspaceSchemasPaths` from the `FsOptions` interface.
- Add `schemaRepositories: ReadonlyMap<string, SchemaRepository>` to `FsOptions`.
- Pass repositories to `createSchemaRegistry` instead of building the map.
- Remove `workspaceSchemasPaths` from `ResolveSchema` constructor call.

### `packages/core/test/infrastructure/fs/schema-registry.spec.ts`

- Tests that create `workspaceSchemasPaths` and pass it to registry methods need reworking.
- Workspace-related tests move to new `FsSchemaRepository` test file.
- Registry tests that remain should verify delegation (npm, path routing, workspace delegation to repo).

## New constructs

### `SchemaRepository` abstract class

- **Location:** `packages/core/src/application/ports/schema-repository.ts`
- **Shape:**

  ```typescript
  import { Repository } from './repository.js'
  import { type SchemaRawResult, type SchemaEntry } from './schema-registry.js'
  import { type Schema } from '../../domain/value-objects/schema.js'

  export { type SchemaRawResult, type SchemaEntry }

  export abstract class SchemaRepository extends Repository {
    abstract resolve(name: string): Promise<Schema | null>
    abstract resolveRaw(name: string): Promise<SchemaRawResult | null>
    abstract list(): Promise<SchemaEntry[]>
  }
  ```

- **Responsibility:** Defines the contract for reading and listing schemas within a single workspace. Does not handle routing — that stays in `SchemaRegistry`.
- **Relationships:** Extends `Repository` (inherits workspace/ownership/isExternal). Used by `SchemaRegistry` implementations for workspace schema delegation. Injected into `FsSchemaRegistry` at construction.

### `FsSchemaRepository` class

- **Location:** `packages/core/src/infrastructure/fs/schema-repository.ts`
- **Shape:**

  ```typescript
  import { SchemaRepository } from '../../application/ports/schema-repository.js'
  import { type RepositoryConfig } from '../../application/ports/repository.js'
  import {
    type SchemaRawResult,
    type SchemaEntry,
  } from '../../application/ports/schema-registry.js'
  import { type Schema } from '../../domain/value-objects/schema.js'

  export interface FsSchemaRepositoryConfig extends RepositoryConfig {
    readonly schemasPath: string
  }

  export class FsSchemaRepository extends SchemaRepository {
    private readonly _schemasPath: string

    constructor(config: FsSchemaRepositoryConfig) {
      super(config)
      this._schemasPath = config.schemasPath
    }

    async resolve(name: string): Promise<Schema | null>
    async resolveRaw(name: string): Promise<SchemaRawResult | null>
    async list(): Promise<SchemaEntry[]>
  }
  ```

- **Responsibility:** Reads schema YAML files and templates from a workspace's `schemasPath` directory. Scans for available schemas. Does not handle npm or path resolution.
- **Relationships:** Extends `SchemaRepository`. Constructed in composition layer via `createSchemaRepository` factory. Used by `FsSchemaRegistry` for workspace-scoped operations.

### `createSchemaRepository` factory

- **Location:** `packages/core/src/composition/schema-repository.ts`
- **Shape:**

  ```typescript
  import { type SchemaRepository } from '../application/ports/schema-repository.js'

  export interface SchemaRepositoryContext {
    readonly workspace: string
    readonly ownership: 'owned' | 'shared' | 'readOnly'
    readonly isExternal: boolean
  }

  export interface FsSchemaRepositoryOptions {
    readonly schemasPath: string
  }

  export function createSchemaRepository(
    type: 'fs',
    context: SchemaRepositoryContext,
    options: FsSchemaRepositoryOptions,
  ): SchemaRepository
  ```

- **Responsibility:** Factory for creating `SchemaRepository` instances. Same pattern as `createSpecRepository`.
- **Relationships:** Used by `createKernelInternals` and use-case factories to instantiate repositories per workspace.

### `FsSchemaRepository` test file

- **Location:** `packages/core/test/infrastructure/fs/schema-repository.spec.ts`
- **Responsibility:** Tests for workspace schema resolution, raw resolution, listing, and edge cases (missing schemas, invalid YAML, templates).

## Approach

### Phase 1: New port and infrastructure

1. Create `SchemaRepository` abstract class in `application/ports/schema-repository.ts`.
2. Create `FsSchemaRepository` in `infrastructure/fs/schema-repository.ts`, extracting workspace filesystem logic from `FsSchemaRegistry` — specifically `_loadSchemaYaml`, `_loadTemplates`, and workspace directory scanning from `list`.
3. Create `createSchemaRepository` factory in `composition/schema-repository.ts`.

### Phase 2: Refactor SchemaRegistry

4. Modify `SchemaRegistry` port — remove `workspaceSchemasPaths` from all method signatures.
5. Modify `FsSchemaRegistry` — accept `ReadonlyMap<string, SchemaRepository>` at construction, delegate `#workspace:name` resolution to `SchemaRepository.resolveRaw(name)` / `resolve(name)`, delegate workspace listing to `SchemaRepository.list()`.
6. Update `createSchemaRegistry` factory to accept and pass repositories.

### Phase 3: Update consumers

7. Update `ResolveSchema` — remove `workspaceSchemasPaths` parameter from constructor, update all `resolveRaw` calls.
8. Update `KernelInternals` — remove `workspaceSchemasPaths`, build `SchemaRepository` map instead.
9. Update `createKernel` — no longer pass `workspaceSchemasPaths` to `ResolveSchema`.
10. Update all 10 use-case factories — replace `workspaceSchemasPaths` with `schemaRepositories` in their `FsOptions` interfaces, pass to `createSchemaRegistry`.

### Phase 4: Tests

11. Create `schema-repository.spec.ts` for `FsSchemaRepository`.
12. Update `schema-registry.spec.ts` — workspace tests move to repository tests; registry tests verify delegation and npm/path routing.

## Key decisions

**Decision: `SchemaRepository` methods accept `name: string`, not `ref: string`.**
The registry handles ref parsing (prefix routing). By the time the repository is called, the workspace is already resolved and only the schema name within that workspace is needed. This keeps the repository focused on storage access without duplicating routing logic.
**Alternatives rejected:** Having the repository accept full refs would duplicate prefix parsing logic and break the single-responsibility split.

**Decision: `FsSchemaRegistry` stores `ReadonlyMap<string, SchemaRepository>` internally.**
This is injected at construction and used for all workspace-scoped resolution. It matches how the registry already stores `nodeModulesPaths` at construction — stateful config.
**Alternatives rejected:** Passing repositories per method call (like `workspaceSchemasPaths` today) would not improve the current situation — the whole point is to stop threading maps through every call.

**Decision: `FsSchemaRepository.resolve` builds the full `Schema` entity internally.**
The repository calls `parseSchemaYaml` and `buildSchema` itself, just like `FsSchemaRegistry.resolve` does today. This keeps resolution self-contained within the repository.
**Alternatives rejected:** Having the repository return only raw data and requiring the caller to build would add complexity to the registry delegation path and not match the port contract.

## Trade-offs

**[Risk: Large blast radius — 15+ files modified]** → Mitigated by phasing: port + infra first, then registry refactor, then consumers. Each phase can be validated independently. All existing tests must pass after each phase.

**[Risk: Workspace schema resolution latency]** → No change expected. The repository performs the same filesystem operations as the registry does today — just from a different call site.

## Testing

### Automated tests

**New file: `packages/core/test/infrastructure/fs/schema-repository.spec.ts`**

- `resolve` returns `Schema` for existing workspace schema
- `resolve` returns `null` for missing schema
- `resolveRaw` returns `SchemaRawResult` with data, templates, resolvedPath
- `resolveRaw` returns `null` for missing schema
- `resolveRaw` loads template files referenced in schema
- `list` returns `SchemaEntry[]` for all schemas in workspace
- `list` returns entries with `source: 'workspace'` and correct `workspace` field
- `list` does not load schema contents (invalid YAML doesn't throw)
- workspace scoping — operations never access files outside `schemasPath`

**Modified file: `packages/core/test/infrastructure/fs/schema-registry.spec.ts`**

- Tests for workspace resolution now verify delegation to `SchemaRepository` (registry receives repositories in constructor)
- npm resolution tests unchanged
- Path resolution tests unchanged
- `list` ordering test verifies workspace entries (from repositories) before npm entries
- New: unknown workspace reference returns `null`
- Remove `workspaceSchemasPaths` parameter from all test calls

### Manual / E2E verification

```bash
# Build and run all tests
pnpm build && pnpm test

# Verify schema resolution still works end-to-end
node packages/cli/dist/index.js schema show --format json

# Verify workspace schema listing
node packages/cli/dist/index.js schema list

# Verify a change can be created and validated (exercises ResolveSchema)
node packages/cli/dist/index.js change create test-verify --description "test" && \
  node packages/cli/dist/index.js change status test-verify --format json
```

## Open questions

None.
