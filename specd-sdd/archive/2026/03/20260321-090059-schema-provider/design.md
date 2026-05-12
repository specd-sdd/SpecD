# Design: schema-provider

## Non-goals

- Refactoring `SchemaRegistry` internals (issue #32)
- Per-spec schema resolution (issue #3)
- Changing the `Kernel` public interface — consumers see no difference

## Affected areas

### `packages/core/src/application/ports/schema-registry.ts`

No changes to the existing `SchemaRegistry` port. It remains the low-level adapter for resolving schemas from disk/npm. `SchemaProvider` wraps it (via `ResolveSchema`), not replaces it.

### `packages/core/src/application/use-cases/get-status.ts`

Constructor changes: remove `schemas: SchemaRegistry`, `schemaRef: string`, `workspaceSchemasPaths: ReadonlyMap<string, string>`. Add `schemaProvider: SchemaProvider`. In `execute()`, replace `this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)` with `this._schemaProvider.get()`.

### `packages/core/src/application/use-cases/run-step-hooks.ts`

Constructor changes: remove `schemas`, `schemaRef`, `workspaceSchemasPaths`. Add `schemaProvider`. In `execute()`, replace `this._schemas.resolve(...)` with `this._schemaProvider.get()`.

### `packages/core/src/application/use-cases/transition-change.ts`

Constructor changes: remove `schemas`, `schemaRef`, `workspaceSchemasPaths`. Add `schemaProvider`. In `execute()`, replace `this._schemas.resolve(...)` with `this._schemaProvider.get()`.

### `packages/core/src/application/use-cases/get-hook-instructions.ts`

Constructor changes: same pattern. Replace `schemas.resolve(...)` with `schemaProvider.get()`.

### `packages/core/src/application/use-cases/validate-artifacts.ts`

Constructor changes: same pattern.

### `packages/core/src/application/use-cases/compile-context.ts`

Constructor changes: same pattern.

### `packages/core/src/application/use-cases/archive-change.ts`

Constructor changes: same pattern.

### `packages/core/src/application/use-cases/get-artifact-instruction.ts`

Constructor changes: same pattern. Note: this use case previously used `SchemaRegistry` to read template files, but templates are already embedded in `ArtifactType.template` by `buildSchema()` during resolution. No separate template loading is needed.

### `packages/core/src/application/use-cases/approve-spec.ts`

Replace `SchemaRegistry` usage in the gate guard (step 4) with `schemaProvider.get()`.

### `packages/core/src/application/use-cases/approve-signoff.ts`

Same as approve-spec.

### `packages/core/src/application/use-cases/generate-spec-metadata.ts`

Replace `schemas.resolve(...)` with `schemaProvider.get()`.

### `packages/core/src/application/use-cases/get-project-context.ts`

Constructor changes: same pattern.

### `packages/core/src/application/use-cases/validate-specs.ts`

Replace `schemas.resolve(...)` with `schemaProvider.get()`.

### `packages/core/src/composition/kernel.ts`

Create the `SchemaProvider` once and pass it to all use cases. Remove `i.schemas`, `i.schemaRef`, `i.workspaceSchemasPaths` from use case constructors.

### `packages/core/src/composition/kernel-internals.ts`

No changes needed — `schemaRef`, `workspaceSchemasPaths`, `schemaPlugins`, `schemaOverrides` are still needed to construct `ResolveSchema` and `SchemaProvider`. The internals interface is not exposed publicly.

### `packages/core/src/composition/use-cases/*.ts` (factories)

Factory functions for `GetStatus`, `TransitionChange`, `ValidateArtifacts`, `CompileContext`, `ArchiveChange`, `ApproveSpec`, `ApproveSignoff`, `GetProjectContext`, `ValidateSpecs` need updated `FsOptions` interfaces and constructor calls. Each factory that currently creates a `SchemaRegistry` and passes the triple will instead create a `LazySchemaProvider`.

### `packages/core/src/application/use-cases/index.ts`

Add export for `SchemaProvider`.

### Tests

All use case tests that construct with `(schemas, schemaRef, workspaceSchemasPaths)` need updated constructor calls. The existing `makeSchemaRegistry()` test helper will be complemented by a `makeSchemaProvider()` helper.

## New constructs

### `SchemaProvider` (port interface)

- **Location**: `packages/core/src/application/ports/schema-provider.ts`
- **Shape**:
  ```typescript
  export interface SchemaProvider {
    get(): Promise<Schema | null>
  }
  ```
- **Responsibility**: Provides the fully-resolved schema (with extends, plugins, and overrides applied). Returns `null` if the schema reference cannot be resolved. Implementations may cache the result.
- **Relationships**: Consumed by all use cases that need the schema. Implemented by `LazySchemaProvider` in the composition layer.

### `LazySchemaProvider` (composition implementation)

- **Location**: `packages/core/src/composition/lazy-schema-provider.ts`
- **Shape**:

  ```typescript
  export class LazySchemaProvider implements SchemaProvider {
    private _cached: Schema | null | undefined = undefined
    private readonly _resolve: ResolveSchema

    constructor(resolve: ResolveSchema)

    async get(): Promise<Schema | null> {
      if (this._cached !== undefined) return this._cached
      try {
        this._cached = await this._resolve.execute()
        return this._cached
      } catch {
        this._cached = null
        return null
      }
    }
  }
  ```

- **Responsibility**: Wraps `ResolveSchema` with lazy evaluation and caching. Resolves on first call, caches for all subsequent calls. Catches resolution errors and returns `null` (matching `SchemaRegistry.resolve()` semantics).
- **Relationships**: Constructed in `kernel.ts` from `ResolveSchema`. Injected into all use cases.

## Approach

### 1. Create the `SchemaProvider` port

New file `packages/core/src/application/ports/schema-provider.ts` with the interface. Export from barrels.

### 2. Create `LazySchemaProvider`

New file `packages/core/src/composition/lazy-schema-provider.ts`. Takes `ResolveSchema` in constructor. Caches on first `get()`. Catches errors → returns `null`.

### 3. Update kernel wiring

In `kernel.ts`:

1. Construct `ResolveSchema` (already done for `GetActiveSchema`)
2. Wrap in `LazySchemaProvider`
3. Pass `schemaProvider` to all 13 use cases instead of `(i.schemas, i.schemaRef, i.workspaceSchemasPaths)`

The existing `ResolveSchema` construction for `GetActiveSchema` can be reused — share the same `ResolveSchema` instance between `GetActiveSchema` and `LazySchemaProvider`.

### 4. Update each use case constructor (mechanical)

For each of the 13 use cases:

1. Replace `schemas: SchemaRegistry`, `schemaRef: string`, `workspaceSchemasPaths: ReadonlyMap<string, string>` with `schemaProvider: SchemaProvider`
2. Replace `this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)` with `this._schemaProvider.get()`
3. Remove `SchemaRegistry` import, add `SchemaProvider` import
4. Update JSDoc

### 5. Update composition factories

For each factory in `packages/core/src/composition/use-cases/`:

1. Update `FsOptions` to include schema provider construction params (or accept a `SchemaProvider` directly)
2. Create `ResolveSchema` → `LazySchemaProvider` in the factory (or reuse if shared)
3. Pass `schemaProvider` to use case constructor

### 6. Update tests

1. Add `makeSchemaProvider()` test helper
2. Update all use case test constructors (mechanical find-replace)

## Key decisions

**Decision: `SchemaProvider` as a port interface, not a function type** → The user explicitly requested a port interface. This is consistent with `ChangeRepository`, `SpecRepository`, etc. **Alternative rejected**: `() => Promise<Schema | null>` function type — less discoverable, can't be typed in barrels.

**Decision: Cache errors as `null`** → When `ResolveSchema` throws (bad schema ref, plugin error), `LazySchemaProvider` caches `null` and returns it. This matches the existing `SchemaRegistry.resolve()` return-null semantics. Use cases already handle `null` gracefully. **Alternative rejected**: re-throw on every call — would force callers to handle errors repeatedly for the same broken config.

**Decision: Share `ResolveSchema` instance between `GetActiveSchema` and `LazySchemaProvider`** → Both need the same resolved schema. Sharing avoids double construction. **Alternative rejected**: separate instances — wasteful, no benefit.

**Decision: `_cached` uses `undefined` as sentinel** → `undefined` = not resolved yet, `null` = resolved but not found, `Schema` = resolved successfully. Three-state pattern avoids a separate `_resolved: boolean` flag.

## Testing

### Automated tests

#### `packages/core/test/composition/lazy-schema-provider.spec.ts` (new)

- Resolves schema on first `get()` call
- Returns cached schema on subsequent calls without re-resolving
- Caches `null` when `ResolveSchema` throws
- Returns `null` on subsequent calls after error (does not retry)

#### All use case test files (mechanical update)

Every test file that constructs a use case with `(makeSchemaRegistry(), 'ref', new Map())` needs updating to `makeSchemaProvider()`. The helper returns a `SchemaProvider` that returns a configurable `Schema`.

#### `packages/core/test/composition/kernel.spec.ts` (if exists)

Verify that `schemaOverrides` in config result in the overridden schema being returned by use cases.

### Manual / E2E verification

```bash
# Add schemaOverrides to specd.local.yaml
# (append a run hook to implementing via schemaOverrides)
# Run: specd change run-hooks <name> implementing --phase post
# Expected: hook executes (currently "no hooks to run")
```

## Open questions

_(none)_
