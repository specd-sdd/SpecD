# Tasks: schema-provider

## 1. New port and implementation

- [x] 1.1 Create `SchemaProvider` port interface
      `packages/core/src/application/ports/schema-provider.ts`:
      new file — `SchemaProvider` interface with `get(): Promise<Schema | null>`
      Approach: single-method port interface, export from application barrel
      (Req: kernel — SchemaProvider construction)

- [x] 1.2 Export `SchemaProvider` from barrels
      `packages/core/src/application/ports/index.ts` and `packages/core/src/application/index.ts`:
      add re-export for `SchemaProvider`
      Approach: named re-export alongside existing port exports

- [x] 1.3 Create `LazySchemaProvider` implementation
      `packages/core/src/composition/lazy-schema-provider.ts`:
      new file — wraps `ResolveSchema`, lazy evaluation with caching
      Approach: `_cached: Schema | null | undefined = undefined` as three-state sentinel;
      on first `get()`, call `this._resolve.execute()`, cache result; catch errors → cache `null`
      (Req: kernel — SchemaProvider construction)

## 2. Update use case constructors

- [x] 2.1 Update `RunStepHooks` constructor
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      replace `schemas: SchemaRegistry`, `schemaRef: string`, `workspaceSchemasPaths: ReadonlyMap<string, string>`
      with `schemaProvider: SchemaProvider`; replace `this._schemas.resolve(...)` with `this._schemaProvider.get()`
      (Req: Ports and constructor)

- [x] 2.2 Update `TransitionChange` constructor
      `packages/core/src/application/use-cases/transition-change.ts`:
      same pattern as 2.1
      (Req: Dependencies)

- [x] 2.3 Update `GetStatus` constructor
      `packages/core/src/application/use-cases/get-status.ts`:
      replace `schemas`, `schemaRef`, `workspaceSchemasPaths` with `schemaProvider`;
      replace `this._schemas.resolve(...)` with `this._schemaProvider.get()`
      (Req: Constructor dependencies)

- [x] 2.4 Update `GetHookInstructions` constructor
      `packages/core/src/application/use-cases/get-hook-instructions.ts`:
      same pattern
      (Req: Ports and constructor)

- [x] 2.5 Update `ValidateArtifacts` constructor
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      same pattern
      (Req: Ports and constructor)

- [x] 2.6 Update `CompileContext` constructor
      `packages/core/src/application/use-cases/compile-context.ts`:
      same pattern
      (Req: Ports and constructor)

- [x] 2.7 Update `ArchiveChange` constructor
      `packages/core/src/application/use-cases/archive-change.ts`:
      same pattern
      (Req: Ports and constructor)

- [x] 2.8 Update `GetArtifactInstruction` constructor
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`:
      same pattern
      (Req: Ports and constructor)

- [x] 2.9 Update `ApproveSpec` schema resolution
      `packages/core/src/application/use-cases/approve-spec.ts`:
      replace `SchemaRegistry` usage in gate guard with `schemaProvider.get()`
      (Req: Gate guard)

- [x] 2.10 Update `ApproveSignoff` schema resolution
      `packages/core/src/application/use-cases/approve-signoff.ts`:
      same pattern as 2.9
      (Req: Gate guard)

- [x] 2.11 Update `GenerateSpecMetadata` schema resolution
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`:
      replace `schemas.resolve(...)` with `schemaProvider.get()`
      (Req: Schema resolution)

- [x] 2.12 Update `GetProjectContext` constructor
      `packages/core/src/application/use-cases/get-project-context.ts`:
      same pattern as 2.1
      (Req: Construction dependencies)

- [x] 2.13 Update `ValidateSpecs` schema resolution
      `packages/core/src/application/use-cases/validate-specs.ts`:
      replace `schemas.resolve(...)` with `schemaProvider.get()`
      (Req: Resolve the active schema)

## 3. Kernel and factory wiring

- [x] 3.1 Update kernel wiring
      `packages/core/src/composition/kernel.ts`:
      create `ResolveSchema` once, wrap in `LazySchemaProvider`, pass to all use cases;
      share `ResolveSchema` instance with `GetActiveSchema`
      Approach: construct `resolveSchema` before use case construction, create
      `new LazySchemaProvider(resolveSchema)`, pass `schemaProvider` to all 13 use cases
      (Req: createKernel constructs shared adapters once)

- [x] 3.2 Update `createGetStatus` factory
      `packages/core/src/composition/use-cases/get-status.ts`:
      update `FsGetStatusOptions` — replace schema triple with `SchemaProvider` construction
      Approach: create `ResolveSchema` → `LazySchemaProvider` in factory
      (Req: Constructor dependencies)

- [x] 3.3 Update `createTransitionChange` factory
      `packages/core/src/composition/use-cases/transition-change.ts`:
      same pattern as 3.2

- [x] 3.4 Update `createValidateArtifacts` factory
      `packages/core/src/composition/use-cases/validate-artifacts.ts`:
      same pattern

- [x] 3.5 Update `createCompileContext` factory
      `packages/core/src/composition/use-cases/compile-context.ts`:
      same pattern

- [x] 3.6 Update `createArchiveChange` factory
      `packages/core/src/composition/use-cases/archive-change.ts`:
      same pattern

- [x] 3.7 Update `createApproveSpec` factory
      `packages/core/src/composition/use-cases/approve-spec.ts`:
      same pattern

- [x] 3.8 Update `createApproveSignoff` factory
      `packages/core/src/composition/use-cases/approve-signoff.ts`:
      same pattern

- [x] 3.9 Update `createGetProjectContext` factory
      `packages/core/src/composition/use-cases/get-project-context.ts`:
      same pattern

- [x] 3.10 Update `createValidateSpecs` factory
      `packages/core/src/composition/use-cases/validate-specs.ts`:
      same pattern

## 4. Tests

- [x] 4.1 Add `makeSchemaProvider` test helper
      `packages/core/test/application/use-cases/helpers.ts`:
      new helper — returns `SchemaProvider` backed by configurable `Schema | null`
      Approach: `{ async get() { return schema } }` with optional throw behavior

- [x] 4.2 Add `LazySchemaProvider` unit tests
      `packages/core/test/composition/lazy-schema-provider.spec.ts`:
      new file — test lazy resolution, caching, error caching
      Approach: mock `ResolveSchema`, verify single call, verify cached result,
      verify null caching on error

- [x] 4.3 Update all use case tests to use `SchemaProvider`
      All test files in `packages/core/test/application/use-cases/`:
      replace `makeSchemaRegistry()` + schema triple with `makeSchemaProvider()`
      Approach: mechanical find-replace in each test constructor call

- [x] 4.4 Update composition factory tests
      All test files in `packages/core/test/composition/use-cases/`:
      update factory option types and constructor calls

## 5. Build and E2E verification

- [x] 5.1 Build and run full test suite
      `pnpm build && pnpm test`:
      verify all packages compile and all tests pass

- [x] 5.2 E2E: verify schemaOverrides now work
      Manual: add `schemaOverrides` with a run hook to `specd.local.yaml`,
      run `specd change run-hooks <name> implementing --phase post`,
      verify hook executes (currently "no hooks to run")
