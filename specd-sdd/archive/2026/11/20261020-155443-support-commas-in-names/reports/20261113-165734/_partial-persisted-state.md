# Spec Compliance Audit — `persisted-state` Batch (`support-commas-in-names`)

## Summary

- **Specs Audited**: 7 (`core:get-persisted-spec-deps`, `core:get-persisted-spec-implementation`, `core:get-persisted-spec-optimizations`, `core:get-persisted-spec-schema`, `core:update-persisted-spec-implementation`, `core:update-persisted-spec-optimizations`, `core:update-persisted-spec-schema`)
- **Test Execution**: 14 test files (7 application + 7 composition), **133 / 133 tests passed** (`pnpm --filter @specd/core exec vitest run ...`)
- **Discrepancies Found**: **8 total** (0 HIGH, 4 MEDIUM, 4 LOW)
  - 6 spec-drift discrepancies in `resolve*Deps` / composition dependency contracts (6 of 7 specs still document `specs` / older collaborator sets, whereas only `core:update-persisted-spec-optimizations` matches the current `specRepositories` + collaborator naming).
  - 1 implementation gap (MEDIUM): `UpdatePersistedSpecImplementation.execute` does not validate `input.action` at runtime for untyped callers.
  - 1 cross-platform test bug (MEDIUM): `update-persisted-spec-implementation.spec.ts` asserts `C:\x` never throws `ImplementationWorkspaceBoundaryError`, which fails on Windows.
- **Missing Test Coverage Items**: 11 scenario gaps identified across the 7 specs.

---

## 1. `core:get-persisted-spec-deps`

### Requirements Summary

- Accepts `GetPersistedSpecDepsInput { specId }`; validates/normalizes `specId` via `parseSpecId` before repository access (`InvalidSpecIdError`, `WorkspaceNotFoundError`).
- Resolves workspace `SpecRepository`, throws `SpecNotFoundError` for unknown spec, calls `readPersistedState(spec)` without reading `spec-lock.json` or metadata.
- Returns `{ specId, dependsOn, initialized }` preserving exact stored order/duplicates when initialized, or `{ specId, dependsOn: [], initialized: false }` when `null` without creating state.
- `createGetPersistedSpecDeps(config, options?)` delegates through `resolveGetPersistedSpecDepsDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-deps.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-deps.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecDepsDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: `resolveGetPersistedSpecDepsDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: `GetPersistedSpecDepsDeps` in [get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-deps.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift** (`specRepositories` is the uniform convention across `packages/core/src/composition/use-cases/*`).

### Test Coverage

- **Covered** in [get-persisted-spec-deps.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-deps.spec.ts) (10 tests) and [composition/get-persisted-spec-deps.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-deps.spec.ts) (4 tests):
  - Uninitialized `dependsOn: []`, `initialized: false`; invalid/empty/malformed `specId` before repo calls; bare ID -> `default:`; `WorkspaceNotFoundError`; qualified ID; stored order & duplicates preserved; `SpecNotFoundError`; never writes state; composition smoke & resolver test.

### Missing Tests

- Runtime rejection when `specId` is missing (`undefined` / `{}`).
- Explicit assertion that `readPersistedState` is the only persisted-data port call (no metadata materialization).

---

## 2. `core:get-persisted-spec-implementation`

### Requirements Summary

- Accepts `GetPersistedSpecImplementationInput { specId }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Resolves workspace `SpecRepository`, throws `SpecNotFoundError` for unknown spec, calls `readPersistedState(spec)` only.
- Returns `{ specId, implementation, initialized }` preserving file-level (`symbols` absent) vs symbol-level (`symbols` present) entries in stored order, or `implementation: [], initialized: false` when `null`.
- `createGetPersistedSpecImplementation(config, options?)` delegates through `resolveGetPersistedSpecImplementationDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-implementation.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-implementation.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecImplementationDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: Requires `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: [get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-implementation.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift**.

### Test Coverage

- **Covered** in [get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-implementation.spec.ts) (8 tests) and [composition/get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-implementation.spec.ts) (4 tests):
  - Uninitialized `[]` & `initialized: false`, invalid/empty/malformed `specId` before repo calls, bare ID -> `default:`, `WorkspaceNotFoundError`, qualified ID, stored order & duplicates, `SpecNotFoundError`, never writes, composition smoke & resolver test.

### Missing Tests

- File-level (`symbols` absent) vs symbol-level (`symbols` present and non-empty) distinction in [get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-implementation.spec.ts#L63-L67) (existing test only uses entries without `symbols`).
- Runtime rejection when `specId` is missing.

---

## 3. `core:get-persisted-spec-optimizations`

### Requirements Summary

- Accepts `{ specId, field? }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Throws `SpecNotFoundError` for unknown spec; returns `{ specId, initialized: false, fresh: false }` when `readPersistedState` returns `null`.
- When initialized with no `optimizations` or absent `field`: returns `{ freshness: 'missing', reasons: ['missing'] }` (no `value`) when `field` is specified, or omits absent fields when unfiltered; aggregate `fresh` is `false` when no fields are present.
- Computes per-field freshness against current `scope: spec` artifacts (`artifactMeta()`) and `persisted.schema`: `artifact-added`, `artifact-removed`, `artifact-changed`, `schema-changed`; `lastModified`-only differences stay `fresh`.
- `createGetPersistedSpecOptimizations(config, options?)` delegates through `resolveGetPersistedSpecOptimizationsDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts) + [spec-optimization-freshness.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/domain/services/spec-optimization-freshness.ts)): **Compliant** (uses `path.basename` safely across POSIX/Windows).
- **Composition** ([get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-optimizations.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — `resolveGetPersistedSpecOptimizationsDeps` property name and missing `getActiveSchema` in spec**
   - **Spec**: `resolveGetPersistedSpecOptimizationsDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>` (does not list `getActiveSchema`).
   - **Code**: [get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-optimizations.ts#L16-L36) resolves `specRepositories: ReadonlyMap<string, SpecRepository>` and `getActiveSchema: GetActiveSchema`.
   - **Assessment**: **Spec drift** (`getActiveSchema` is required to enumerate `scope: spec` artifacts from the active schema).

### Test Coverage

- **Covered** in [get-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-optimizations.spec.ts) (17 tests) and [composition/get-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-optimizations.spec.ts) (4 tests):
  - Uninitialized, missing filtered field, initialized without optimizations, invalid/malformed `specId`, bare ID, `WorkspaceNotFoundError`, `SpecNotFoundError`, filtered vs unfiltered results, `artifact-changed`, `artifact-removed`, `artifact-added`, `lastModified`-only fresh, `schema-changed`, aggregate `fresh`, never writes, composition smoke & resolver test.

### Missing Tests

- Combined multiple staleness reasons in a single field evaluation (`artifact-removed` + `artifact-added` + `schema-changed`).
- Explicit assertion that generated metadata is never read or materialized.

---

## 4. `core:get-persisted-spec-schema`

### Requirements Summary

- Accepts `{ specId }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Throws `SpecNotFoundError` for unknown spec **before** checking initialization; throws `SpecNotInitializedError(specId)` when `readPersistedState` returns `null`.
- Returns `{ specId, schema }` with exact `{ name, version }` from persisted state.
- `createGetPersistedSpecSchema(config, options?)` delegates through `resolveGetPersistedSpecSchemaDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-schema.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-schema.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecSchemaDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: Requires `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: [get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-schema.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift**.

### Test Coverage

- **Covered** in [get-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-schema.spec.ts) (7 tests) and [composition/get-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-schema.spec.ts) (4 tests):
  - `SpecNotInitializedError`, invalid `specId` before repo calls, bare ID, `WorkspaceNotFoundError`, qualified ID returning exact `schema`, `SpecNotFoundError` before `SpecNotInitializedError`, malformed ID quoted and never writes, composition smoke & resolver test.

### Missing Tests

- Explicit assertion that `readPersistedState` is the only persisted-data port call (no metadata materialization).

---

## 5. `core:update-persisted-spec-implementation`

### Requirements Summary

- Accepts `{ specId, action: 'add' | 'remove', file, symbols? }`; validates `specId` via `parseSpecId`, rejects `readOnly` workspaces with `ReadOnlyWorkspaceError`, throws `SpecNotFoundError` for unknown spec.
- Confines `file` to the workspace `codeRoot` via `path.relative` containment (rejects `..`, sibling prefix, cross-workspace qualifier, absolute host paths including Windows drives like `C:\x` as non-qualifiers) -> `ImplementationWorkspaceBoundaryError`; normalizes to forward-slashed `workspace:path`.
- For `add`, verifies file exists on disk (`ImplementationFileNotFoundError`) after confinement and before `readPersistedState`; creates missing state via `resolveInitialPersistedDependsOn()`.
- For `remove` against missing state, no-ops with `implementation: [], created: false` without writing.
- Applies mutation via `applyPersistedImplementationMutation` + `applyPersistedSpecStatePatch`, writes with `expectedRevision` (`originalHash` or `null`), propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecImplementation(config, options?)` delegates through `resolveUpdatePersistedSpecImplementationDeps(resolver)`.

### Implementation Status

- **Application** ([update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-implementation.ts)): **Partial (missing runtime `action` check)**.
- **Composition** ([update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-implementation.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — Missing runtime validation of `action` (`'add' | 'remove'`)**
   - **Verify Scenario** (`action must be add or remove`): An `action` value other than `'add'` or `'remove'` MUST be rejected as an invalid input.
   - **Code**: [update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-implementation.ts#L112-L132) and [apply-persisted-implementation-mutation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/_shared/apply-persisted-implementation-mutation.ts#L21-L55) only check `action === 'add'` and treat any other runtime string as `'remove'`.
   - **Assessment**: **Implementation bug** for untyped/JS callers (no `InvalidInputError` thrown).
2. **MEDIUM — `resolveUpdatePersistedSpecImplementationDeps` collaborator drift**
   - **Spec**: Lists `specs`, `workspaces`, `files`, and an `initializePersistedSpecState` collaborator.
   - **Code**: [update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-implementation.ts#L22-L57) resolves `specRepositories`, `listWorkspaces`, `files`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` (calling `resolveInitialPersistedDependsOn()` directly).
   - **Assessment**: **Spec drift** (implementation was refactored to use `resolveInitialPersistedDependsOn()` directly).
3. **MEDIUM — Non-cross-platform test assertion for `C:\x`**
   - **Contract**: `default:_global/testing` & `default:_global/cross-platform` require tests to pass on both POSIX and Windows.
   - **Test**: [update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts#L157-L168) asserts `await expect(result).rejects.not.toBeInstanceOf(ImplementationWorkspaceBoundaryError)` for `file: 'C:\\x'`. On Windows, `C:\x` is an absolute path outside `/test/code/default`, so `path.isAbsolute(relative)` is `true` and `ImplementationWorkspaceBoundaryError` IS thrown, failing this test on Windows.
   - **Assessment**: **Test implementation bug** (needs platform-aware assertion or `process.platform === 'win32'` branch).

### Test Coverage

- **Covered** in [update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts) (22 tests) and [composition/update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-implementation.spec.ts) (3 tests):
  - Missing file, invalid `specId`, `WorkspaceNotFoundError`, bare ID, confinement escapes (`..`, sibling prefix, cross-workspace, qualified escapes, `.`), forward-slashed nested path, add/remove symbols & whole entry, lock-less add (`created: true`, `expectedRevision: null`), lock-less remove no-op, `ArtifactConflictError`, `SpecNotFoundError`, `ReadOnlyWorkspaceError`, check ordering, composition smoke.

### Missing Tests

- Runtime rejection of invalid `action` value (e.g. `'replace'`).
- `resolveUpdatePersistedSpecImplementationDeps` unit test in [composition/update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-implementation.spec.ts).

---

## 6. `core:update-persisted-spec-optimizations`

### Requirements Summary

- Strict Zod runtime validation of `{ specId, set?, clear? }` before any port access (`InvalidInputError` for shape/mutual-exclusivity/emptiness/missing `specId`; `InvalidSpecIdError` for empty/malformed `specId` string).
- `ReadOnlyWorkspaceError` before `repo.get` / `readPersistedState`; `SpecNotFoundError` for unknown spec.
- `clear` on missing state no-ops with `created: false` and no `writePersistedState`; `set` on missing state creates base via `resolveInitialPersistedDependsOn()`.
- `set` captures fresh `artifactState` baseline and `schema` (`current.schema` if existing, effective project schema if creating) per changed field, preserving unchanged fields.
- `clear` removes listed fields (absent fields are no-ops) and omits `optimizations` block when none remain.
- Patches via `applyPersistedSpecStatePatch`, writes with `expectedRevision` (`originalHash` or `null`), propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecOptimizations(config, options?)` delegates through `resolveUpdatePersistedSpecOptimizationsDeps(resolver)` resolving `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher`.

### Implementation Status

- **Application** ([update-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts)): **Compliant**.
- **Composition** ([update-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-optimizations.ts)): **Compliant**.

### Discrepancies

- None.

### Test Coverage

- **Covered** in [update-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts) (26 tests) and [composition/update-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts) (4 tests):
  - All Zod validation matrix cases, `InvalidSpecIdError` (including `''`), `WorkspaceNotFoundError`, `ReadOnlyWorkspaceError`, `ArtifactConflictError`, partial/absent/final `clear`, independent per-field baselines, effective vs persisted schema recording, `expectedRevision: null`, composition smoke & `resolveUpdatePersistedSpecOptimizationsDeps`.

### Missing Tests

- `SpecNotFoundError` test for an unknown spec.
- Real filesystem `SpecRepository` round-trip test for partial and final `clear` (`verify.md` scenario).

---

## 7. `core:update-persisted-spec-schema`

### Requirements Summary

- Accepts `{ specId, schemaRef }`; validates `specId` via `parseSpecId`, rejects `readOnly` workspaces with `ReadOnlyWorkspaceError`.
- Throws `SpecNotFoundError` before `SpecNotInitializedError` (never creates a lock).
- Resolves `schemaRef` via `GetActiveSchema` in `{ mode: 'ref', ref: schemaRef }`; returns `changed: false` no-op if target equals persisted schema.
- Parses all declared `scope: spec` artifacts with registered parsers (`ArtifactParseError` on failure, skipping formats with no parser or missing files).
- If target schema extracts `dependsOn`, compares with current `dependsOn` and throws `PersistedSchemaDependencyConflictError` on mismatch; otherwise preserves `dependsOn`.
- Preserves `implementation` and `optimizations` verbatim; constructs `PersistedSpecState` directly (not via `applyPersistedSpecStatePatch`), writes with `expectedRevision: current.originalHash`, propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecSchema(config, options?)` delegates through `resolveUpdatePersistedSpecSchemaDeps(resolver)`.

### Implementation Status

- **Application** ([update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-schema.ts)): **Compliant**.
- **Composition** ([update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-schema.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — `resolveUpdatePersistedSpecSchemaDeps` property name and extra collaborators**
   - **Spec**: `resolveUpdatePersistedSpecSchemaDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>` and `getActiveSchema: GetActiveSchema`.
   - **Code**: [update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-schema.ts#L19-L48) resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, and `contentHasher`.
   - **Assessment**: **Spec drift** (the extra dependencies are needed for `_loadParsedArtifacts` and `_extractDependsOn`).

### Test Coverage

- **Covered** in [update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-schema.spec.ts) (17 tests) and [composition/update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-schema.spec.ts) (3 tests):
  - `SpecNotInitializedError`, invalid `specId` before repo calls, bare ID, `WorkspaceNotFoundError`, `ArtifactParseError`, skips unparsed formats and missing files, `changed: true` & verbatim preservation, `changed: false` no-op, `ref`-mode resolution, `PersistedSchemaDependencyConflictError`, equal extracted deps, schema mismatch on optimizations, `expectedRevision: originalHash`, `ArtifactConflictError`, `SpecNotFoundError` before `SpecNotInitializedError`, `ReadOnlyWorkspaceError`, composition smoke.

### Missing Tests

- `resolveUpdatePersistedSpecSchemaDeps` unit test in [composition/update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-schema.spec.ts).
- Assertion that `PersistedSchemaDependencyConflictError` carries `specId`, current `dependsOn`, and extracted `dependsOn`.
- End-to-end test pairing `UpdatePersistedSpecSchema` with `GetPersistedSpecOptimizations` to verify `schema-changed` staleness.
