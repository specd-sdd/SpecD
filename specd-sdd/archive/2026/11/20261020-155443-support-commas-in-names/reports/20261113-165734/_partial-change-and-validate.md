# Spec Compliance Audit — Batch `change-and-validate`

**Change:** `support-commas-in-names`
**Specs audited:**

1. `core:create-change`
2. `cli:change-create`
3. `core:edit-change`
4. `cli:change-edit`
5. `core:preview-spec`
6. `core:generate-metadata`
7. `core:validate-specs`

---

## Summary Counts

| Spec                     | Status                            | Discrepancies (HIGH / MEDIUM / LOW) | Missing Tests                                   |
| ------------------------ | --------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `core:create-change`     | Compliant (1 minor JSDoc gap)     | 0 / 0 / 1                           | 0                                               |
| `cli:change-create`      | Compliant                         | 0 / 0 / 0                           | 1 (`--format toon`)                             |
| `core:edit-change`       | Compliant                         | 0 / 0 / 0                           | 1 (`composition/use-cases/edit-change.spec.ts`) |
| `cli:change-edit`        | Compliant                         | 0 / 0 / 0                           | 1 (`--format toon`)                             |
| `core:preview-spec`      | Compliant                         | 0 / 0 / 0                           | 0                                               |
| `core:generate-metadata` | Partial (pre-existing spec drift) | 0 / 1 / 1                           | 0                                               |
| `core:validate-specs`    | Partial (pre-existing spec drift) | 0 / 1 / 1                           | 0                                               |
| **Total**                | **5 Compliant, 2 Partial**        | **0 HIGH / 2 MEDIUM / 3 LOW**       | **3**                                           |

All requirements introduced or updated by `support-commas-in-names` (raw spec ID forwarding without comma-splitting, `parseSpecId` validation/normalization with `InvalidSpecIdError` / `WorkspaceNotFoundError` quoting full original values, `readOnly` rejection, `invalidationPolicy` validation) are **fully implemented and tested** across all 7 specs. The 2 MEDIUM and 3 LOW discrepancies are pre-existing spec-vs-implementation drifts or JSDoc `@throws` omissions.

---

## 1. `core:create-change`

### Requirements Summary

- `CreateChange.execute(input)` accepts `name`, `description?`, `specIds`, `schemaName?`, `schemaVersion?`, `invalidationPolicy?`, `includeOverlapCheck?`.
- Enforces name uniqueness (`ChangeAlreadyExistsError`) across active, draft, and discarded changes before spec ID validation.
- Resolves schema identity via `GetActiveSchema.execute()` when both `schemaName` and `schemaVersion` are omitted; rejects partial overrides (`InvalidCreateChangeInputError`).
- Validates `invalidationPolicy` (`none`, `surgical`, `downstream`, `global`) with `InvalidInputError`.
- Validates and normalizes `specIds` via `parseSpecId` (never splitting on commas), collapsing duplicates after normalization, and rejecting `readOnly` workspaces with `ReadOnlyWorkspaceError` (one line per offending spec, ending with the protection sentence, no remediation).
- Enforces schema compatibility guardrail (`IncompatibleSchemaError`), seeds `specDependsOn`, persists via `ChangeRepository.create`, scaffolds via `ChangeRepository.scaffold`, optionally runs `DetectOverlap` (best-effort), and returns `{ change, changePath, overlapReport? }`.
- `createCreateChange(config, options?)` delegates through `resolveCreateChangeDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/create-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts) (lines 62–264)
- [packages/core/src/composition/use-cases/create-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/create-change.ts) (lines 37–101)
- All functional requirements and `_global/architecture` / `_global/cross-platform` contracts are satisfied.

### Discrepancies

1. **LOW — Missing `@throws {IncompatibleSchemaError}` in `CreateChange.execute` JSDoc**
   - **Evidence:** [create-change.ts#L97-L103](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts#L97-L103) documents `@throws` for `ChangeAlreadyExistsError`, `InvalidCreateChangeInputError`, `InvalidInputError`, `InvalidSpecIdError`, `WorkspaceNotFoundError`, and `ReadOnlyWorkspaceError`, but omits `IncompatibleSchemaError` thrown at [create-change.ts#L174](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts#L174).
   - **Possibilities:**
     - _Implementation/docs bug:_ `_global/error-handling-conventions` mandates that use cases document all errors they throw using `@throws`.
     - _Spec drift:_ `core:create-change` spec does not explicitly list `@throws` tags, though `_global/error-handling-conventions` does.

### Test Coverage

- [packages/core/test/application/use-cases/create-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/create-change.spec.ts) (937 lines): covers duplicate names before spec ID validation, `InvalidSpecIdError` (including `'auth/a,b'` comma rejection and `''`), `WorkspaceNotFoundError`, bare ID normalization, duplicate collapse, `readOnly` rejection (single, multiple, mixed), `invalidationPolicy`, schema resolution & compatibility, `specDependsOn` seeding, `create` -> `scaffold` ordering, and `includeOverlapCheck`.
- [packages/core/test/composition/use-cases/create-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/create-change.spec.ts) (82 lines): covers `resolveCreateChangeDeps` and `createCreateChange`.
- _Note on `_global/testing`:_ Line 391 of `create-change.spec.ts` uses `as unknown as ReturnType<typeof makeGetActiveSchema>` for an error-throwing mock.

### Missing Tests

- None for `core:create-change` requirements.

---

## 2. `cli:change-create`

### Requirements Summary

- Command `specd change create <name> [--spec <id>...] [--description <text>] [--invalidation-policy <policy>] [--format text|json|toon] [--config <path>]`.
- Forwards `--spec` and `--invalidation-policy` raw to `kernel.changes.create.execute` without splitting on commas, validating spec IDs, resolving workspaces, checking ownership, or calling `getActiveSchema`.
- Passes `includeOverlapCheck: true` when `specIds` is non-empty and formats `overlapReport` warnings to stderr without calling `detectOverlap` directly.
- Outputs `created change <name>` in `text` mode, or `{ result: "ok", name, state, changePath }` in `json`/`toon` modes. Maps core errors to exit code 1.

### Implementation Status

- [packages/cli/src/commands/change/create.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/create.ts) (lines 12–80)
- Fully compliant with `cli:change-create` and `_global/architecture` (no business logic in CLI adapter).

### Discrepancies

- None.

### Test Coverage

- [packages/cli/test/commands/change-create.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-create.spec.ts) (601 lines): covers missing name, empty `--spec`, raw forwarding of bare/qualified/comma-containing (`auth/a,b`) IDs, `WorkspaceNotFoundError`, `InvalidSpecIdError`, `ReadOnlyWorkspaceError`, `InvalidInputError` for invalidation policy, `ChangeAlreadyExistsError`, `includeOverlapCheck` delegation, `getActiveSchema` non-invocation, `text` and `json` output with `changePath`, and real-kernel integration tests.
- _Note on `_global/testing`:_ Unit mocks in `change-create.spec.ts` use `'/tmp/test-changes/...'` as a mock string `changePath` (no disk I/O; integration tests use `os.tmpdir()`).

### Missing Tests

- Explicit unit test for `--format toon` output on `change create` (handled via shared `output(..., fmt)` helper).

---

## 3. `core:edit-change`

### Requirements Summary

- `EditChange.execute(input)` accepts `name`, `addSpecIds?`, `removeSpecIds?`, `description?`, `invalidationPolicy?`.
- Validates `ChangeNotFoundError` and `invalidationPolicy` (`InvalidInputError`) before mutation.
- Validates and normalizes `addSpecIds` via `parseSpecId` (never splitting on commas), checks `readOnly` ownership (`ReadOnlyWorkspaceError`), and skips ownership/syntax validation for `removeSpecIds` (normalizing valid entries and collapsing duplicates).
- Returns unchanged change with `invalidated: false` (and without resolving actor) on no-op.
- Enforces schema compatibility guardrail (`IncompatibleSchemaError`).
- Runs effective spec/description/policy updates inside `ChangeRepository.mutate`, applying removals before additions, throwing `SpecNotInChangeError` for missing removals, calling `change.updateSpecIds`, seeding `specDependsOn` for newly added specs, unscaffolding removed specs, scaffolding, and calling `refreshImplementationTracking` when provided.
- `createEditChange(config, options?)` delegates through `resolveEditChangeDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/edit-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/edit-change.ts) (lines 50–307)
- [packages/core/src/composition/use-cases/edit-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/edit-change.ts) (lines 32–115)
- Fully compliant with `core:edit-change`, `_global/architecture`, and `_global/error-handling-conventions` (all thrown errors documented with `@throws`).

### Discrepancies

- None.

### Test Coverage

- [packages/core/test/application/use-cases/edit-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/edit-change.spec.ts) (731 lines): covers change lookup, no-op cases (including no actor resolution), description-only and policy-only edits, removal-before-addition, `SpecNotInChangeError` (including invalid syntax on removal), duplicate removal collapse, bare ID normalization, comma-containing `addSpecIds: ['auth/a,b']`, `readOnly` rejection on add and exemption on remove, schema compatibility, `specDependsOn` seeding, `mutate` freshness, `unscaffold`, and `refreshImplementationTracking`.

### Missing Tests

- No dedicated `packages/core/test/composition/use-cases/edit-change.spec.ts` unit test for `resolveEditChangeDeps` / `createEditChange` (unlike `create-change.spec.ts` and `preview-spec.spec.ts`).

---

## 4. `cli:change-edit`

### Requirements Summary

- Command `specd change edit <name> [--add-spec <id>] [--remove-spec <id>] [--description <text>] [--invalidation-policy <policy>] [--format text|json|toon] [--config <path>]`.
- Requires at least one edit flag before config resolution (exits 1 on usage error).
- Forwards `--add-spec`, `--remove-spec`, `--description`, `--invalidation-policy` raw without splitting on commas, validating spec IDs, resolving workspaces, or checking ownership.
- Warns to stderr when `invalidated` is true and on best-effort overlap detection when specs changed.
- Outputs `updated change <name>` + `specs:` + `workspaces:` in `text` mode, or `{ result: "ok", name, specIds, workspaces, invalidated, state }` in `json`/`toon` modes.

### Implementation Status

- [packages/cli/src/commands/change/edit.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/edit.ts) (lines 12–136)
- Fully compliant with `cli:change-edit` and `_global/architecture`.

### Discrepancies

- None.

### Test Coverage

- [packages/cli/test/commands/change-edit.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-edit.spec.ts) (370 lines): covers missing flags before config resolution, raw forwarding of `--add-spec` (including `'auth/a,b'` and `'Bad Id'`), `--remove-spec`, `--invalidation-policy`, `WorkspaceNotFoundError`, `ReadOnlyWorkspaceError`, `ChangeNotFoundError`, invalidation warning, `text` and `json` outputs, and source inspection ensuring no `SpecdConfig` / `ownership` / `helpers/spec-path` usage.

### Missing Tests

- Explicit unit test for `--format toon` output on `change edit` (handled via shared `output(..., fmt)` helper).

---

## 5. `core:preview-spec`

### Requirements Summary

- `PreviewSpec(changes, specs, schemaProvider, parsers, diffGenerator)`.
- `execute({ name, specId, includeDiff? })` validates and normalizes `specId` with `parseSpecId` before loading the change (`InvalidSpecIdError`, `WorkspaceNotFoundError`), verifies `specId` is in `change.specIds` (`SpecNotInChangeError`), and checks `schema.name() === change.schemaName` (`SchemaMismatchError`).
- `@throws` JSDoc lists `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ChangeNotFoundError`, `SchemaMismatchError`, `SpecNotInChangeError`.
- Discovers files via `change.artifacts`, processes all `scope: spec` schema artifact types, applies deltas or loads new spec content, sorts `spec.md` first then alphabetically, optionally generates plain unified diffs for `merged` entries (treating `DiffGenerationError` as warning-only), and returns `PreviewSpecResult`.
- `createPreviewSpec(config, options?)` delegates through `resolvePreviewSpecDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/preview-spec.ts) (lines 61–302)
- [packages/core/src/composition/use-cases/preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/preview-spec.ts) (lines 33–108)
- Fully compliant with `core:preview-spec`, `_global/architecture`, and `_global/error-handling-conventions`.

### Discrepancies

- None.

### Test Coverage

- [packages/core/test/application/use-cases/preview-spec.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/preview-spec.spec.ts) (684 lines): covers all requirements including `InvalidSpecIdError` (`''`, `'Core/Foo'`, `'Bad Id'`, `'auth/a,b'`, `'ws:'`) before repo/change lookup, `WorkspaceNotFoundError`, `SpecNotInChangeError`, `SchemaMismatchError`, delta/new/no-op/missing handling, ordering, `includeDiff` and `DiffGenerationError`, and partial failure warnings.
- [packages/core/test/composition/use-cases/preview-spec.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/preview-spec.spec.ts) covers `resolvePreviewSpecDeps` and `createPreviewSpec`.

### Missing Tests

- None.

---

## 6. `core:generate-metadata`

### Requirements Summary

- `GenerateSpecMetadata.execute({ specId, allowDependsOnOverwrite? })` validates/normalizes `specId` with `parseSpecId` (`InvalidSpecIdError`, `WorkspaceNotFoundError`), loads spec (`SpecNotFoundError`), reads persisted state once (`readPersistedState`), loads and parses `scope: 'spec'` artifacts, runs `extractMetadataFromSpecArtifacts`, resolves canonical `dependsOn` (`DependsOnOverwriteError` on conflict), projects implementation & fresh optimizations, and returns `{ metadata, hasExtraction, sourceState }`.
- `createGenerateSpecMetadata(config, options?)` delegates through `resolveGenerateSpecMetadataDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts) (lines 52–382)
- [packages/core/src/composition/use-cases/generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/generate-spec-metadata.ts) (lines 34–100)
- `support-commas-in-names` requirements (`parseSpecId` validation/normalization, `InvalidSpecIdError`, `WorkspaceNotFoundError`) are fully compliant.

### Discrepancies

1. **MEDIUM — Pre-existing spec drift on schema with no `metadataExtraction`**
   - **Evidence:** `core:generate-metadata` spec (`Schema resolution`) states: _"If the resolved schema has no `metadataExtraction` declarations, the use case returns `{ metadata: {}, hasExtraction: false }` immediately — there is nothing to extract."_ However, [generate-spec-metadata.ts#L95-L225](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L95-L225) does not return early; it still loads artifacts, computes `contentHashes` and `provenance`, and returns `{ metadata, hasExtraction: false, sourceState }` (which is also asserted in [generate-spec-metadata.spec.ts#L668-L670](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/generate-spec-metadata.spec.ts#L668-L670)).
   - **Possibilities:**
     - _Spec drift (likely):_ `GenerateSpecMetadata` evolved to return `contentHashes`, `provenance`, and `sourceState` even when `hasExtraction` is `false` so `MaterializeSpecMetadata` can still materialize metadata/hashes.
     - _Implementation bug:_ If an early `{ metadata: {}, hasExtraction: false }` return was intended, it is not implemented.

2. **LOW — Missing `@throws {SpecNotFoundError}` and `@throws {DependsOnOverwriteError}` in `GenerateSpecMetadata.execute` JSDoc**
   - **Evidence:** [generate-spec-metadata.ts#L91-L92](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L91-L92) only documents `@throws {InvalidSpecIdError}` and `@throws {WorkspaceNotFoundError}`, omitting `SpecNotFoundError` (line 113) and `DependsOnOverwriteError` (line 348).
   - **Possibilities:**
     - _Implementation/docs bug:_ Violates `_global/error-handling-conventions` `@throws` documentation rule.
     - _Spec drift:_ `core:generate-metadata` does not list `@throws` tags explicitly.

### Test Coverage

- [packages/core/test/application/use-cases/generate-spec-metadata.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/generate-spec-metadata.spec.ts) (718 lines): covers transform resolution, cross-workspace paths, `dependsOn` persistence/conflict, single `readPersistedState` snapshot, fresh-only optimizations, `InvalidSpecIdError` (`'Bad Id'`, `''`, `'auth/a,b'`, `'ws:'`) before repo lookup, bare ID normalization, and `WorkspaceNotFoundError`.

### Missing Tests

- None for `support-commas-in-names` requirements.

---

## 7. `core:validate-specs`

### Requirements Summary

- `ValidateSpecs.execute(input)` resolves active schema, filters to `scope: 'spec'` artifacts, and supports three modes: single-spec (`input.specPath` validated/normalized with `parseSpecId`), workspace (`input.workspace`), or all-workspaces.
- Uses `ValidationResultCache` per workspace (passing list Meta stamps for warm hard hits), runs local rule validation (`evaluateRules`) and per-spec cross-artifact validation (`evaluateCrossArtifactRule`), delegates metadata materialization to `GetSpecMetadata.execute({ specId })`, and checks persisted optimization freshness independently.
- `createValidateSpecs(config, options?)` delegates through `resolveValidateSpecsDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/validate-specs.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts) (lines 65–510)
- [packages/core/src/composition/use-cases/validate-specs.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts) (lines 22–143)
- `support-commas-in-names` requirements (`parseSpecId` validation/normalization in single-spec mode, `InvalidSpecIdError` quoting `'auth/a,b'`, bare ID resolution, `WorkspaceNotFoundError`) are fully compliant.

### Discrepancies

1. **MEDIUM — Pre-existing spec drift on `ValidateSpecsDeps.getMetadata` type**
   - **Evidence:** `core:validate-specs` spec (`Config-based factory delegates through resolveValidateSpecsDeps` and verify scenario) specifies `getMetadata: ReadonlyMap<string, GetSpecMetadata>` with one instance per configured workspace. In [packages/core/src/composition/use-cases/validate-specs.ts#L26](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts#L26) and [line 44](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts#L44), `getMetadata` is a single `GetSpecMetadata` instance (`createGetSpecMetadata(resolveGetSpecMetadataDeps(resolver))`), matching `ValidateSpecs` constructor ([validate-specs.ts#L89](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L89)).
   - **Possibilities:**
     - _Spec drift (likely):_ `GetSpecMetadata` already takes `ListWorkspaces` and handles all workspaces, so a single instance replaced the older per-workspace map in code without updating the spec.
     - _Implementation bug:_ If per-workspace `GetSpecMetadata` instances were intended, neither `ValidateSpecs` nor `ValidateSpecsDeps` implements a map.

2. **LOW — Missing `@throws {SpecNotFoundError}` in `ValidateSpecs.execute` JSDoc**
   - **Evidence:** [validate-specs.ts#L115-L118](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L115-L118) documents `InvalidSpecIdError`, `WorkspaceNotFoundError`, and `SchemaNotFoundError`, but omits `SpecNotFoundError` thrown at [validate-specs.ts#L138](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L138), [line 237](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L237), and [line 255](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L255).
   - **Possibilities:**
     - _Implementation/docs bug:_ Violates `_global/error-handling-conventions` `@throws` rule.
     - _Spec drift:_ `core:validate-specs` does not explicitly assert `@throws` JSDoc tags.

### Test Coverage

- [packages/core/test/application/use-cases/validate-specs.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/validate-specs.spec.ts) (1468 lines): covers all three scoping modes, `InvalidSpecIdError` (`'Bad Id'`, `''`, `'auth/a,b'`, `'ws:'`) before repo lookup, bare `specPath` resolution, `WorkspaceNotFoundError`, `SpecNotFoundError`, local & cross-artifact validation, `GetSpecMetadata` delegation, optimization staleness, `ValidationResultCache` hard/soft/miss paths, and `resolveValidateSpecsDeps`.

### Missing Tests

- None for `support-commas-in-names` requirements.
