# Tasks: fix-change-schema-source

## 1. Domain updates

- [x] 1.1 Add schema fields to ChangeProps
      `packages/core/src/domain/entities/change.ts`: `ChangeProps` — add `schemaName: string` and `schemaVersion: number`
      Approach: Make the fields required and read-only.
      (Req: Schema version)
- [x] 1.2 Update Change constructor and properties
      `packages/core/src/domain/entities/change.ts`: `Change` — add `_schemaName` and `_schemaVersion` private fields
      Approach: Assign them from `props` inside the constructor.
      (Req: Schema version)
- [x] 1.3 Update Change getters
      `packages/core/src/domain/entities/change.ts`: `Change.schemaName` and `Change.schemaVersion` — return new fields
      Approach: Replace `this._createdEvent().schemaName` and `this._createdEvent().schemaVersion` with `this._schemaName` and `this._schemaVersion`.
      (Req: Schema version)
- [x] 1.4 Fix domain tests
      `packages/core/src/domain/entities/__tests__/change.spec.ts`: Test factories — supply `schemaName` and `schemaVersion`
      Approach: Update mocked `ChangeProps` in test setups to satisfy the new required properties.
      (Req: Schema version)

## 2. Infrastructure updates

- [x] 2.1 Pass schema properties on hydration
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange()` — pass schema
      Approach: Extract `manifest.schema.name` and `manifest.schema.version` from the JSON payload and pass them directly into the `new Change({...})` constructor arguments.
      (Req: Schema version)
- [x] 2.2 Reconstruct root schema on serialization
      `packages/core/src/infrastructure/fs/change-repository.ts`: `changeToManifest()` — reconstruct root schema object
      Approach: Instead of looking up the `created` event, directly assign `schema: { name: change.schemaName, version: change.schemaVersion }`.
      (Req: Schema version)
- [x] 2.3 Pass schema properties in manifest loader
      `packages/core/src/infrastructure/fs/manifest-change-loader.ts`: `deserializeManifestToChange()` — pass schema
      Approach: Explicitly pass `schemaName: manifest.schema.name` and `schemaVersion: manifest.schema.version` to the `new Change({...})` constructor from the parsed `ChangeManifest`.
      (Req: Schema version)
- [x] 2.4 Fix infrastructure tests
      `packages/core/src/infrastructure/fs/__tests__/change-repository.spec.ts` and `manifest-change-loader.spec.ts`
      Approach: Ensure all test fixtures and assertions reflect the new `ChangeProps` signature.
      (Req: Schema version)

## 3. Application updates

- [x] 3.1 Update CreateChange use-case
      `packages/core/src/application/use-cases/create-change.ts`: `execute()` — pass schema
      Approach: Supply the locally resolved `schemaName` and `schemaVersion` from `_resolveSchemaIdentity` directly into the `new Change({...})` constructor.
      (Req: Schema version)
- [x] 3.2 Fix application tests
      `packages/core/src/application/use-cases/__tests__/create-change.spec.ts`, `compile-context.spec.ts`, etc.
      Approach: Fix TS errors from missing `schemaName` and `schemaVersion` in `ChangeProps` payloads across test factories.
      (Req: Schema version)

## 4. Schema Compatibility Guardrail

- [x] 4.1 Create `IncompatibleSchemaError`
      `packages/core/src/domain/errors.ts`: add `IncompatibleSchemaError` class
      Approach: Extend `SpecdError` with message formatting specifying the specId, its schema, and the change's schema.
      (Req: Schema compatibility guardrail)
- [x] 4.2 Enforce guardrail in CreateChange
      `packages/core/src/application/use-cases/create-change.ts`: `execute()`
      Approach: Iterate over `input.specIds`. Call `specRepo.loadMetadata(specId)`. If a schema exists in metadata, verify it matches `schemaName` or `resolvedSchema.compat()?.name`. Throw `IncompatibleSchemaError` if they don't match.
      (Req: Schema compatibility guardrail)
- [x] 4.3 Enforce guardrail in EditChange
      `packages/core/src/application/use-cases/edit-change.ts`: `execute()`
      Approach: Iterate over `input.addSpecIds`. Load metadata and compare `persistedSchema.name` to `change.schemaName` and `schema.compat()?.name`. Throw `IncompatibleSchemaError` if invalid.
      (Req: Schema compatibility guardrail)
- [x] 4.4 Add guardrail tests
      `packages/core/src/application/use-cases/__tests__/create-change.spec.ts` and `edit-change.spec.ts`
      Approach: Add test cases asserting `IncompatibleSchemaError` is thrown for incompatible specs, but succeeds for matching or uninitialized specs.
      (Req: Schema compatibility guardrail)
