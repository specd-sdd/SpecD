# Proposal: fix-change-schema-source

## Motivation

1. The `Change` domain entity incorrectly relies on parsing the `history` array to find the `type: 'created'` event in order to determine its schema (`schemaName` and `schemaVersion`). The root `manifest.schema` object exists but is bypassed. This is conceptually flawed; the schema should be the source of truth and hydrated directly upon change creation.
2. The system does not currently prevent developers from adding a Spec to a Change if the Spec's schema is fundamentally incompatible with the Change's schema. This poses a severe risk in multi-schema configurations where the Change DAG would crash when attempting to process an incompatible Spec.

## Current behaviour

1. `Change.schemaName` and `change.schemaVersion` are derived dynamically via `this._history.find(e => e.type === 'created')`, ignoring the root `manifest.schema`.
2. `CreateChange` and `EditChange` allow adding _any_ existing Spec to a Change's `specIds` without validating if the Spec's persisted schema is identical to (or compatible with) the Change's schema.

## Proposed solution

1. **Schema Source of Truth:**
   - Update `ChangeProps` and the `Change` entity to directly hold and expose `schemaName` and `schemaVersion`.
   - Update adapters (`change-repository.ts`, `manifest-change-loader.ts`) to inject the root schema values during instantiation.
   - Update `changeToManifest` to serialize the root `schema` object from the entity's properties.
2. **Schema Compatibility Guardrail:**
   - Update `CreateChange` and `EditChange` to intercept the addition of new Specs.
   - For every Spec added, load its persisted schema (via `metadata.json`).
   - If the Spec lacks a schema or `metadata.json`, assume it uses the global configuration schema (`this._schemaProvider.get()`).
   - Throw an `IncompatibleSchemaError` if the Change's schema is not equal to the Spec's schema AND the Change's schema does not declare `compat` with the Spec's schema.

## Specs affected

### New specs

None.

### Modified specs

- `core:change`: The domain entity `Change` is modified to accept and expose schema directly from properties rather than the history.
- `core:change-manifest`: The layout/usage of `manifest.json` is clarified such that the root `schema` object becomes the runtime source of truth.
- `core:create-change`: Adds a requirement to validate schema compatibility when seeding a change with `specIds`.
- `core:edit-change`: Adds a requirement to validate schema compatibility when adding new `specIds` to an active change.

## Impact

This refactoring touches core domain properties and affects about 30+ files across the project with a HIGH risk level because `Change` is the central entity.

- **Domain**: `packages/core/src/domain/entities/change.ts` (adding schema properties).
- **Infrastructure**: `packages/core/src/infrastructure/fs/change-repository.ts` and `manifest-change-loader.ts`.
- **Application**: `packages/core/src/application/use-cases/create-change.ts` and `edit-change.ts` (providing schema explicitly and adding the compatibility check).
- **Tests**: Corresponding `.spec.ts` files for the above modules.

## Technical context

- The change name is `fix-change-schema-source`.
- We will retain the `type: 'created'` event in the history for complete tracking.
- We will rely on `GetPersistedSpecSchema` logic (or a dedicated internal lookup) to evaluate the Spec's persisted schema, comparing it to `schema.canonicalSpecSchema()` or `schema.name`.

## Open questions

None.
