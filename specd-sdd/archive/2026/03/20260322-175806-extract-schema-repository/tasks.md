# Tasks: extract-schema-repository

## 1. New port and infrastructure

- [x] 1.1 Create `SchemaRepository` abstract class
      `packages/core/src/application/ports/schema-repository.ts`:
      new file — abstract class extending `Repository` with three abstract methods: `resolve(name: string): Promise<Schema | null>`, `resolveRaw(name: string): Promise<SchemaRawResult | null>`, `list(): Promise<SchemaEntry[]>`
      Approach: follow `SpecRepository` pattern — extend `Repository`, declare abstract methods, re-export `SchemaRawResult` and `SchemaEntry` from `schema-registry.ts`
      (Req: Inheritance from Repository base, Abstract class with abstract methods, resolveRaw method signature, resolve method signature, list method signature, SchemaRawResult and SchemaEntry re-export)

- [x] 1.2 Create `FsSchemaRepository` implementation
      `packages/core/src/infrastructure/fs/schema-repository.ts`:
      new file — extends `SchemaRepository`, config includes `schemasPath: string`
      Approach: extract workspace-specific filesystem logic from `FsSchemaRegistry` — YAML loading via `parseSchemaYaml`, template loading (`_loadTemplates` equivalent), directory scanning for `list()`. Constructor takes `FsSchemaRepositoryConfig` extending `RepositoryConfig` with `schemasPath`. `resolve` calls `parseSchemaYaml` + `buildSchema`. `resolveRaw` returns `{ data, templates, resolvedPath }`. `list` scans `schemasPath` subdirectories for `schema.yaml` files
      (Req: Workspace scoping, resolve method signature, resolveRaw method signature, list method signature)

- [x] 1.3 Create `createSchemaRepository` factory
      `packages/core/src/composition/schema-repository.ts`:
      new file — factory function following `createSpecRepository` pattern
      Approach: export `SchemaRepositoryContext` and `FsSchemaRepositoryOptions` interfaces, implement `createSchemaRepository(type: 'fs', context, options): SchemaRepository` that instantiates `FsSchemaRepository`
      (Req: Abstract class with abstract methods)

## 2. Refactor SchemaRegistry

- [x] 2.1 Update `SchemaRegistry` port interface
      `packages/core/src/application/ports/schema-registry.ts`:
      `SchemaRegistry` interface — remove `workspaceSchemasPaths` parameter from `resolve`, `resolveRaw`, `list`
      Approach: all three methods become single-param (`ref: string`) or no-param (`list()`). Update JSDoc. Add import of `SchemaRepository` type
      (Req: Resolve method signature, ResolveRaw method signature, List method signature)

- [x] 2.2 Refactor `FsSchemaRegistry` implementation
      `packages/core/src/infrastructure/fs/schema-registry.ts`:
      `FsSchemaRegistry` — accept `schemaRepositories: ReadonlyMap<string, SchemaRepository>` in config, delegate workspace resolution to repositories
      Approach: add `_schemaRepositories` private field set in constructor. In `_resolveFilePath` (or equivalent), for `#workspace:name` refs, call `this._schemaRepositories.get(workspace)?.resolveRaw(name)` instead of direct fs access. For `resolve`, delegate similarly. For `list`, call `list()` on each repository and concat with npm entries. Keep npm resolution and direct path resolution as-is
      (Req: Resolve prefix routing)

- [x] 2.3 Update `createSchemaRegistry` factory
      `packages/core/src/composition/schema-registry.ts`:
      `FsSchemaRegistryOptions` — add `schemaRepositories: ReadonlyMap<string, SchemaRepository>`, pass to `FsSchemaRegistry`
      Approach: update options interface and switch body to pass repositories through to constructor
      (Req: Interface shape)

## 3. Update consumers

- [x] 3.1 Update `ResolveSchema` use case
      `packages/core/src/application/use-cases/resolve-schema.ts`:
      `ResolveSchema` constructor — remove `workspaceSchemasPaths` parameter and `_workspaceSchemasPaths` field
      Approach: remove third constructor param. Update all 3 call sites: `this._schemas.resolveRaw(ref, this._workspaceSchemasPaths)` → `this._schemas.resolveRaw(ref)`. Same for `resolve` calls
      (Req: Resolve method signature, ResolveRaw method signature)

- [x] 3.2 Update `KernelInternals` and `createKernelInternals`
      `packages/core/src/composition/kernel-internals.ts`:
      `KernelInternals` interface — replace `workspaceSchemasPaths` with building `SchemaRepository` instances per workspace
      Approach: remove `workspaceSchemasPaths` property. In `createKernelInternals`, build `Map<string, SchemaRepository>` by iterating `config.workspaces` and calling `createSchemaRepository('fs', context, { schemasPath: ws.schemasPath })` for each workspace with a non-null `schemasPath`. Pass this map to `createSchemaRegistry`
      (Req: Workspace scoping)

- [x] 3.3 Update `createKernel`
      `packages/core/src/composition/kernel.ts`:
      `createKernel` — remove `i.workspaceSchemasPaths` from `ResolveSchema` constructor call
      Approach: update constructor call to match new 4-param signature: `new ResolveSchema(i.schemas, i.schemaRef, i.schemaPlugins, i.schemaOverrides)`
      (Req: Resolve method signature)

- [x] 3.4 Update all 10 use-case factories
      `packages/core/src/composition/use-cases/*.ts`:
      Each factory's `FsOptions` interface — replace `workspaceSchemasPaths` with `schemaRepositories: ReadonlyMap<string, SchemaRepository>`
      Approach: in each factory, replace the `workspaceSchemasPaths` map-building loop with receiving `schemaRepositories` from options, pass to `createSchemaRegistry`. Update `ResolveSchema` constructor calls to remove the map parameter. Affected files: `get-active-schema.ts`, `validate-specs.ts`, `validate-artifacts.ts`, `compile-context.ts`, `get-status.ts`, `get-project-context.ts`, `approve-spec.ts`, `approve-signoff.ts`, `archive-change.ts`, `transition-change.ts`
      (Req: Resolve method signature, Workspace scoping)

## 4. Update exports

- [x] 4.1 Export new port and factory from package index
      `packages/core/src/index.ts`:
      add exports for `SchemaRepository`, `createSchemaRepository`, `SchemaRepositoryContext`, `FsSchemaRepositoryOptions`
      Approach: follow existing export pattern for `SpecRepository` and `createSpecRepository`
      (Req: Abstract class with abstract methods)

## 5. Tests

- [x] 5.1 Create `FsSchemaRepository` tests
      `packages/core/test/infrastructure/fs/schema-repository.spec.ts`:
      new file — test `resolve`, `resolveRaw`, `list`, workspace scoping, edge cases
      Approach: follow pattern from `schema-registry.spec.ts` — create temp directories, write schema YAML files, instantiate `FsSchemaRepository` with the paths. Test: resolve returns Schema for existing schema, resolve returns null for missing, resolveRaw returns SchemaRawResult with data/templates/resolvedPath, list returns SchemaEntry[] with correct source/workspace, list doesn't throw on invalid YAML, template loading works
      (Req: All SchemaRepository requirements)

- [x] 5.2 Update `FsSchemaRegistry` tests
      `packages/core/test/infrastructure/fs/schema-registry.spec.ts`:
      existing file — update to inject `SchemaRepository` instances instead of `workspaceSchemasPaths`
      Approach: create `FsSchemaRepository` instances in test setup, pass as `ReadonlyMap<string, SchemaRepository>` to `FsSchemaRegistry`. Update all `resolve(ref, map)` calls to `resolve(ref)`. Move workspace-specific resolution tests to `schema-repository.spec.ts`. Add test for unknown workspace returning null. Keep npm and path resolution tests
      (Req: Resolve prefix routing, List result ordering)
