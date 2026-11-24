# Tasks: reconcile-main-schema-and-specs

## 1. Domain and Loaders

- [x] 1.1 Ensure Change entity exposes immutable schema identity
      `packages/core/src/domain/entities/change.ts`: `ChangeProps` and `Change` — ensure `schemaName` and `schemaVersion` are required and accessible
      Approach: enforce top-level properties on `ChangeProps` and read them directly in the constructor
      (Req: Identity)
- [x] 1.2 Hydrate schema identity in manifest loader
      `packages/core/src/infrastructure/fs/manifest-change-loader.ts`: `loadV2Manifest` and `adaptV1Manifest` — extract `manifest.schema` into `ChangeProps`
      Approach: read `manifest.schema.name` and `manifest.schema.version` directly from the root object
      (Req: Schema version)
- [x] 1.3 Persist schema identity in repository serializer
      `packages/core/src/infrastructure/fs/change-repository.ts`: `changeToManifest` — serialize `schemaName` and `schemaVersion` from `Change`
      Approach: map `change.schemaName` and `change.schemaVersion` into `manifest.schema`
      (Req: Manifest structure)

## 2. Use Cases and Guardrails

- [x] 2.1 Validate initial spec compatibility in CreateChange
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChange.execute` — guard against incompatible initial specs
      Approach: throw `IncompatibleSchemaError` if any spec's persisted schema does not match the change's schema
      (Req: Schema compatibility guardrail)
- [x] 2.2 Validate added spec compatibility in EditChange
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute` — guard against incompatible `addSpecIds`
      Approach: verify added specs match `change.schemaName` before mutating scope, throwing `IncompatibleSchemaError` on mismatch
      (Req: Schema compatibility guardrail)

## 3. Spec and Verification Reconciliation

- [x] 3.1 Synchronize normative specs and spec locks
      `specs/core/`: `spec-lock.json` — align spec locks and deltas with merged state
      Approach: commit no-op delta artifacts against the merged baseline and regenerate metadata
      (Req: Spec Dependencies)
- [x] 3.2 Verify test fixtures and regression suites
      `packages/core/test/`: test fixtures — verify all unit, integration, and typecheck suites pass
      Approach: run `pnpm test` and `pnpm typecheck` to guarantee 100% compliance across monorepo packages
      (Req: Verification)
