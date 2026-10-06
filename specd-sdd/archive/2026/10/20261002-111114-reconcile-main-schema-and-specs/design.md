# Design: reconcile-main-schema-and-specs

## Approach

This design reconciles and formalizes the merge of branch `main` into `feat/lifecycle-transitions-ux`. The primary goal is unifying two concurrent lines of evolution in `@specd/core`:

1. The **Manifest Root Schema Model** from `main` (commit `174a72a13`), which establishes `manifest.schema` as the definitive, immutable source of truth for `Change` entities and introduces `IncompatibleSchemaError`.
2. The **Custom Check Registry and Resilient Hook System** from `feat/lifecycle-transitions-ux` (commit `30d1a06a1`), which introduces open check catalog governance, typed predicate execution, and robust transition checks.

### 1. Root Schema Hydration and Persistence

- `ChangeProps` requires `schemaName: string` and `schemaVersion: number`.
- `ManifestChangeLoader` deserializes `manifest.schema.name` and `manifest.schema.version` into `ChangeProps` during manifest load (`loadV2Manifest` and `adaptV1Manifest`).
- `ChangeRepository` serializes `schemaName: change.schemaName` and `schemaVersion: change.schemaVersion` directly from the `Change` aggregate.
- Test helpers (`makeChange`, `makeDoneChange`, `makeReadyChange`, etc.) and mock builders are updated to supply default schema identity (`test-schema` / `@specd/schema-std`).

### 2. Schema Compatibility Guardrails in Creation and Scoping

- In `CreateChange`: verifies that all initial spec IDs belong to the same schema family as the target change, throwing `IncompatibleSchemaError` if any spec has an incompatible persisted schema.
- In `EditChange`: verifies that newly added specs (`addSpecIds`) match the change's root schema identity before mutating `specIds`, throwing `IncompatibleSchemaError` on mismatch.

### 3. Normative Spec and Lock Reconciliation

- Reconciled specs in `specs/core/change`, `specs/core/change-manifest`, `specs/core/create-change`, `specs/core/edit-change`, and `specs/core/kernel`.
- Synchronized all 14 `spec-lock.json` dependency and hash records across workspaces.
- Documented changes via no-op delta artifacts against the merged normative baseline.

## Architecture Decisions

### Decision 1: Root Manifest Schema Truth

- **Decision**: The `Change` entity derives its schema identity strictly from the manifest root `schema` property, not from scanning `history` for a `created` event.
- **Rationale**: Scanning event history created circular hydration dependencies during early validity checks and made manifest reloading fragile. Root manifest properties provide an immutable, constant-time reference.

### Decision 2: Check System and Schema Guardrail Coexistence

- **Decision**: In `CreateChange` and `EditChange`, schema compatibility verification executes before transition checks and repository mutation.
- **Rationale**: If a spec belongs to an incompatible schema family, the operation must fail immediately without initiating actor resolution, lifecycle transitions, or partial directory scaffolding.

### Decision 3: Change as the Authority for its Lifecycle

- **Decision**: A change's lifecycle, workflow requirements, and checks are governed by its own stamped schema (`change.schemaName`).
- **Rationale**: The project's global `specd.yaml` configuration defines only the default schema for new changes. Once created, each change is an autonomous aggregate whose schema dictates its lifecycle.

## Affected Areas

- `packages/core/src/domain/entities/change.ts`: Top-level `schemaName` and `schemaVersion` fields on `ChangeProps` and `Change`.
- `packages/core/src/infrastructure/fs/manifest-change-loader.ts`: Manifest schema extraction for v1 and v2 formats.
- `packages/core/src/infrastructure/fs/change-repository.ts`: Serialization of `schemaName` and `schemaVersion` from `Change`.
- `packages/core/src/application/use-cases/create-change.ts`: Schema compatibility validation on change creation.
- `packages/core/src/application/use-cases/edit-change.ts`: Schema compatibility validation on `addSpecIds`.
- `packages/core/test/**`: Updated test factories and fixtures across `@specd/core`.
- `specs/core/**`: Normative specs and `spec-lock.json` files.

## Testing

- Unit tests in `packages/core/test/domain/entities/change.spec.ts` verifying immutable schema properties.
- Unit tests in `packages/core/test/application/use-cases/create-change.spec.ts` verifying `IncompatibleSchemaError` on incompatible spec creation.
- Unit tests in `packages/core/test/application/use-cases/edit-change.spec.ts` verifying `IncompatibleSchemaError` on incompatible `addSpecIds`.
- Regression verification: All 2,910 unit/integration tests in `@specd/core` pass cleanly.
- Global verification: Full workspace build (`pnpm build`), typecheck (`pnpm typecheck`), and test suites (`pnpm test`) across all 13 packages pass with 100% success.

## Documentation

- Updated normative specs in `specs/core/` and regenerated guide bundles in `@specd/guide`.

## Open Questions

None — All architecture decisions and code resolutions were confirmed during merge integration and test execution.
