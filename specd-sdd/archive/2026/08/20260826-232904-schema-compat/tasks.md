# Tasks: schema-compat

## 1. Domain model & Value Objects

- [x] 1.1 Add `SchemaCompatIdentity` and `parseSchemaCompat` utility
      `packages/core/src/domain/value-objects/schema.ts`: `SchemaCompatIdentity`, `parseSchemaCompat` — define identity interface and normalizer function
      Approach: Parse string identifiers (`@scope/pkg@v`, `pkg@v`, `pkg`) and object forms into canonical `{ name, version }`
      (Req: Requirement: Schema compat field)
- [x] 1.2 Add `compat()` and `canonicalSpecSchema()` methods to `Schema`
      `packages/core/src/domain/value-objects/schema.ts`: `Schema` — add `_compat` field and getters
      Approach: Implement 3-tier fallback resolution (`compat` → `extends` → `name@version`) in `canonicalSpecSchema()`
      (Req: Requirement: Schema compat field)
- [x] 1.3 Export domain symbols from public barrel files
      `packages/core/src/domain/value-objects/index.ts`, `packages/core/src/public.ts`: export `type SchemaCompatIdentity` and `parseSchemaCompat`
      Approach: Re-export value object types and parser helper
      (Req: Requirement: Schema compat field)

## 2. Infrastructure & YAML Parsing

- [x] 2.1 Add `compat` field validation to `SchemaYamlZodSchema`
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `SchemaYamlZodSchema`, `parseSchemaYaml` — validate `compat` on `kind: schema`
      Approach: Accept string or `{ name: string, version?: number }` and reject `compat` on `kind: schema-plugin` with `SchemaValidationError`
      (Req: Requirement: Schema compat field, Requirement: Schema plugin kind)

## 3. Domain Services & Schema Cascade

- [x] 3.1 Pass `compat` through `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — parse `compat` and pass to `Schema` constructor
      Approach: Parse `data.compat` via `parseSchemaCompat` and supply to `new Schema(...)`
      (Req: Requirement: Schema compat field)
- [x] 3.2 Add `compat` support to `mergeSchemaLayers`
      `packages/core/src/domain/services/merge-schema-layers.ts`: `mergeSchemaLayers`, `SetTargets`, `RemoveTargets` — handle `set.compat` and `remove.compat`
      Approach: Support scalar set and null removal of `compat` in merge layers
      (Req: Requirement: Operation target structure, Requirement: Remove operation semantics)
- [x] 3.3 Cascade `compat` across multi-level `extends` chains
      `packages/core/src/application/use-cases/resolve-extends-chain.ts`: `overlayData` — propagate parent compat to child
      Approach: Set `compat: child.compat ?? parent.compat` in `overlayData`
      (Req: Requirement: Resolution pipeline)

## 4. Application Use Cases & Persistence

- [x] 4.1 Update `ArchiveChange` to stamp `canonicalSpecSchema()` in `spec-lock.json`
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange.execute` — derive publication schema from `canonicalSpecSchema()`
      Approach: Use `persistedSchema ?? canonicalSpecSchema()` when publishing spec-lock sidecar for new specs
      (Req: Requirement: spec-lock sidecar persistence)
- [x] 4.2 Update `InitializePersistedSpecState` to use `canonicalSpecSchema()`
      `packages/core/src/application/use-cases/initialize-persisted-spec-state.ts`: `InitializePersistedSpecState.execute` — apply canonical schema identity
      Approach: Pass `schema.canonicalSpecSchema()` as initial lock schema
      (Req: Requirement: Per-target initialization algorithm)
- [x] 4.3 Update `GenerateSpecMetadata` fallback provenance
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `GenerateSpecMetadata.execute` — use `canonicalSpecSchema()` for lock-less provenance
      Approach: Fall back to `schema.canonicalSpecSchema()` when `persistedState` is null
      (Req: Requirement: Assembled result)

## 5. CLI Presentation

- [x] 5.1 Display `compat` in `specd schema show` text and JSON output
      `packages/cli/src/commands/schema/show.ts`: `formatSchemaText`, `serializeSchema` — expose declared `compat`
      Approach: Safely check `schema.compat()` and format `compat: <name>@<version>`
      (Req: Requirement: Output format)

## 6. Verification & Automated Tests

- [x] 6.1 Unit tests for schema YAML parser and plugin restriction
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: `parseSchemaYaml — compat field`
      Approach: Test string format, object format, and plugin rejection
      (Scenario: Schema with string compat format, Scenario: Schema plugin with compat field is rejected)
- [x] 6.2 Unit tests for `buildSchema` 3-tier fallback resolution
      `packages/core/test/domain/services/build-schema.spec.ts`: `buildSchema`
      Approach: Test `compat` present, `extends` fallback, and own identity fallback
      (Scenario: Schema with object compat format)
- [x] 6.3 Unit tests for `ResolveSchema` extends cascade
      `packages/core/test/application/use-cases/resolve-schema.spec.ts`: `ResolveSchema — extends`
      Approach: Test multi-level hierarchy (`root` → `intermediate` with compat → `leaf`)
      (Scenario: Cascades compat across multi-level extends chain)
- [x] 6.4 Unit tests for `ArchiveChange` spec-lock persistence
      `packages/core/test/application/use-cases/archive-change.spec.ts`: `ArchiveChange`
      Approach: Test archiving with custom schema declaring compat stamps canonical schema in `spec-lock.json`
      (Scenario: First archive creates spec-lock sidecar with schema and dependsOn)
- [x] 6.5 CLI unit tests for `specd schema show`
      `packages/cli/test/commands/schema-show.spec.ts`: `Output format`
      Approach: Test text and JSON rendering of `compat`
      (Scenario: Text output shows extends and compat when present, Scenario: JSON output includes all schema fields)
