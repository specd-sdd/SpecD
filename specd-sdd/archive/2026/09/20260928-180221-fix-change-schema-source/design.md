# Design: fix-change-schema-source

## Architecture & Data Flow

The `Change` domain entity incorrectly reads the `type: 'created'` event from the `history` array to figure out its active `schemaName` and `schemaVersion`. This design fixes that architectural flaw by hydrating the `Change` directly from the `manifest.schema` object (which is the true persistent source of truth). The data flow shifts as follows:

1. **Hydration**: Adapters (`change-repository.ts`, `manifest-change-loader.ts`) reading `manifest.json` will pass `manifest.schema.name` and `manifest.schema.version` directly into the `ChangeProps` argument of `new Change()`.
2. **Domain Entity**: The `Change` class enforces the schema values as top-level private read-only properties, entirely decoupled from `_createdEvent()`.
3. **Serialization**: When writing back to `manifest.json` via `changeToManifest`, the root `schema` property is reconstructed directly from the `Change` entity's getter methods, not by searching the history.
4. **Use-case (Creation)**: When a new change is created (`create-change.ts`), the application use-case already resolves `schemaName` and `schemaVersion` and will now pass them directly into the constructor `ChangeProps` in addition to logging them in the `CreatedEvent`.
5. **Guardrail (Compatibility)**: `CreateChange` and `EditChange` will intercept added specs, loading their persisted schemas and verifying compatibility against the Change's schema.

## Affected areas & Concrete Implementation

### 1. `packages/core/src/domain/entities/change.ts`

- **Interface `ChangeProps`**: Add two new required fields:
  ```typescript
  readonly schemaName: string
  readonly schemaVersion: number
  ```
- **Class `Change` Properties**: Add two private fields:
  ```typescript
  private readonly _schemaName: string
  private readonly _schemaVersion: number
  ```
- **Class `Change` Constructor**: Extract and assign them:
  ```typescript
  this._schemaName = props.schemaName
  this._schemaVersion = props.schemaVersion
  ```
- **Class `Change` Getters**: Replace the existing getters to return the private fields directly instead of traversing history:

  ```typescript
  get schemaName(): string {
    return this._schemaName
  }

  get schemaVersion(): number {
    return this._schemaVersion
  }
  ```

- _Remove any internal logic linking schema resolution to `_createdEvent()`._

### 2. `packages/core/src/infrastructure/fs/change-repository.ts`

- **Method `_manifestToChange`**:
  When returning `new Change({...})`, explicitly add the schema fields from the loaded manifest:
  ```typescript
  const change = new Change({
    name: manifest.name,
    // ...
    schemaName: manifest.schema.name,
    schemaVersion: manifest.schema.version,
    // ...
  })
  ```
- **Function `changeToManifest`**:
  Replace the history-lookup logic (lines ~1660-1664) with direct getters:
  ```typescript
  const schema = { name: change.schemaName, version: change.schemaVersion }
  ```

### 3. `packages/core/src/infrastructure/fs/manifest-change-loader.ts`

- **Function `deserializeManifestToChange` / `loadChange`**:
  Similar to `_manifestToChange`, explicitly pass the schema fields to the `Change` constructor from the parsed `ChangeManifest`:
  ```typescript
  return new Change({
    name: manifest.name,
    // ...
    schemaName: manifest.schema.name,
    schemaVersion: manifest.schema.version,
    // ...
  })
  ```

### 4. `packages/core/src/application/use-cases/create-change.ts`

- **Method `execute`**:
  When constructing `new Change({...})` (around line 135), include the locally resolved `schemaName` and `schemaVersion` from `_resolveSchemaIdentity`:
  ```typescript
  const change = new Change({
    name: input.name,
    // ...
    schemaName,
    schemaVersion,
    // ...
  })
  ```
- **Guardrail Implementation**:
  Before constructing the Change, iterate over `input.specIds`. For each spec:
  1. Load its persisted semantic state using `loadPersistedSpecSchema` (or similar internal logic calling the `SpecRepository`). Wait, we need to load the full schema identity, not just dependencies. We will import `loadPersistedSpecSchema` (or create a helper that mimics it) which calls `specRepo.loadMetadata()`.
  2. If the spec has no metadata or the metadata lacks `schema`, assume it equals the global schema (which is what the Change resolves to by default anyway).
  3. If it has a persisted schema, check `persistedSchema.name === schemaName || resolvedChangeSchema.compat()?.name === persistedSchema.name`.
  4. If incompatible, `throw new IncompatibleSchemaError(specId, persistedSchema.name, schemaName)`. Note: we will need to instantiate the `Schema` object via `this._schemaProvider.get()` if we need to check `.compat()`. If `CreateChange` receives `schemaName` override, it might not have the fully resolved `Schema` object handy, so it must resolve it to check `.compat()`.

### 5. `packages/core/src/application/use-cases/edit-change.ts`

- **Guardrail Implementation**:
  In `execute`, when `input.addSpecIds` is provided, perform the same validation logic.
  1. Load the active schema for the change (via `this._schemaProvider.get()`).
  2. For each added spec, load its persisted schema.
  3. Check `persistedSchema.name === change.schemaName || changeSchema.compat()?.name === persistedSchema.name`.
  4. Throw `IncompatibleSchemaError` if it fails.

### 6. `packages/core/src/domain/errors.ts`

- Add `IncompatibleSchemaError` extending `SpecdError`.

### 7. Tests

All tests that manually instantiate `Change` or mock `ChangeProps` will break at compile-time because `schemaName` and `schemaVersion` are now required.

- You MUST update test factories across `packages/core/src/domain/entities/__tests__/change.spec.ts`, `packages/core/src/infrastructure/fs/__tests__/change-repository.spec.ts`, `packages/core/src/infrastructure/fs/__tests__/manifest-change-loader.spec.ts`, and `packages/core/src/application/use-cases/__tests__/*.spec.ts` to include valid mock values (e.g., `schemaName: 'schema-std', schemaVersion: 1`).
- Add tests for `CreateChange` and `EditChange` to verify `IncompatibleSchemaError` is thrown when adding an incompatible spec, and succeeds when adding a compatible one or an uninitialized one.

## New constructs

- `IncompatibleSchemaError` domain error.

## Edge cases & Error handling

- **Backward Compatibility**: `changeManifestSchema` (Zod) has always required `schema: { name, version }` at the root of `manifest.json`. This implies existing on-disk changes will not break hydration since the fields are guaranteed to be present on valid payloads.
- **Uninitialized Specs**: Handled by falling back to the project global schema. Since the project global schema is exactly what `CreateChange` defaults to, this implicitly makes them compatible.

## Testing

- Ensure the TypeScript compiler `typecheck` passes with no errors relating to `ChangeProps`.
- Verify the unit tests specifically assert that a `Change` reflects its constructed `schemaName` and `schemaVersion`, verifying that the output of `changeToManifest` strictly mirrors those root properties rather than traversing events.
- Test `CreateChange` and `EditChange` guardrails with mocked `SpecRepository.loadMetadata()` returning different schema names.

## Open questions

None.
