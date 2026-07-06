# Spec-Compliance Audit: `merge-main-user-interface` Core Substantive Scope

## Scope

- Change: `merge-main-user-interface`
- Audit mode: read-only, change-scoped
- Report focus:
  - `core:compile-context`
  - `core:edit-change`
  - `core:get-project-context`
  - `core:get-spec-context`
  - `core:spec-repository-port`
  - `core:change-repository-port`
  - `core:storage`
- Global/dependency specs consulted where relevant:
  - `default:_global/architecture`
  - `default:_global/testing`
  - `core:composition`
  - `core:repository-port`
  - `core:change`

## Method

- Verified graph freshness with `node packages/cli/dist/index.js project status --format toon --graph` and used graph search first for symbol discovery.
- Read change-local spec content with `node packages/cli/dist/index.js changes spec-preview merge-main-user-interface <specId>` for all seven target specs.
- Inspected the implementation and direct tests for:
  - `packages/core/src/application/use-cases/compile-context.ts`
  - `packages/core/src/application/use-cases/edit-change.ts`
  - `packages/core/src/application/use-cases/get-project-context.ts`
  - `packages/core/src/application/use-cases/get-spec-context.ts`
  - `packages/core/src/application/ports/spec-repository.ts`
  - `packages/core/src/application/ports/change-repository.ts`
  - `packages/core/src/application/ports/repository.ts`
  - `packages/core/src/infrastructure/fs/spec-repository.ts`
  - `packages/core/src/infrastructure/fs/change-repository.ts`
- Ran targeted tests:
  - `packages/core/test/application/use-cases/compile-context.spec.ts`
  - `packages/core/test/application/use-cases/edit-change.spec.ts`
  - `packages/core/test/application/use-cases/get-project-context.spec.ts`
  - `packages/core/test/application/use-cases/get-spec-context.spec.ts`
  - `packages/core/test/infrastructure/fs/spec-repository.spec.ts`
  - `packages/core/test/infrastructure/fs/change-repository.spec.ts`

## Findings

### 1. `CompileContext` reports a step as available based only on readiness, ignoring lifecycle permission

- Severity: medium
- Spec:
  - `core:compile-context` says a step is available only when it is both `ready` and `permitted`.
  - The same spec says `stepAvailable` must reflect that lifecycle-engine verdict.
- Implementation:
  - `packages/core/src/application/use-cases/compile-context.ts:517-520`
  - `requestedStepVerdict` is read from `LifecycleEngine`, but `stepAvailable` is set from `requestedStepVerdict?.isReady ?? true` instead of the engine's combined availability verdict.
- Impact:
  - A step can be surfaced as available when artifacts are complete but lifecycle protocol still forbids entry.
  - This is specifically contradictory to the spec's "ready and permitted" rule.
- Test coverage:
  - Existing tests cover blocking by incomplete artifacts.
  - I did not find a test that exercises `isReady === true` with `isPermitted === false`, so this mismatch is currently unguarded by tests.

### 2. `GetProjectContext` uses cached optimized project context even when optimization is not requested

- Severity: medium
- Spec:
  - `core:get-project-context` says optimized project context is preferred when `llmOptimizedContext` is enabled.
  - The spec frames optimization as conditional behavior, not unconditional cache substitution.
- Implementation:
  - `packages/core/src/application/use-cases/get-project-context.ts:144-159`
  - The function returns `projectMeta.optimized.context` whenever cache freshness succeeds, without checking `config.llmOptimizedContext === true`.
- Impact:
  - Callers requesting standard project context can receive optimized/cached context instead.
  - That changes observable behavior for the default path and weakens the meaning of the runtime/config override.
- Test coverage:
  - There are optimization-path tests in `packages/core/test/application/use-cases/get-project-context.spec.ts`.
  - I did not find a test that proves fresh optimized cache is ignored when `llmOptimizedContext` is false or omitted.

## Spec-by-Spec Assessment

### `core:compile-context`

- Status: partial non-compliance
- Positive evidence:
  - Constructor shape, runtime override merge, schema-name guard, `includeChangeSpecs`, `followDeps`, source ordering, preview use for change specs, warnings, and fingerprint output are implemented.
  - `availableSteps` includes `available`, `isReady`, `isPermitted`, and blocker details.
- Main issue:
  - `stepAvailable` is computed from readiness only, not readiness plus permission.

### `core:edit-change`

- Status: compliant in reviewed areas
- Positive evidence:
  - Uses `ChangeRepository.get()` for lookup and `ChangeRepository.mutate()` for effective persisted updates.
  - Applies removals before additions.
  - Preserves idempotent adds.
  - Seeds `specDependsOn` for newly added specs via persisted semantic state first, then metadata fallback.
  - Calls `unscaffold()` after removals and `scaffold()` after invalidating scope changes.
- Test posture:
  - Good direct unit coverage for lookup, no-op, invalidation, dependency seeding, and combined edits.

### `core:get-project-context`

- Status: partial non-compliance
- Positive evidence:
  - Resolves schema before spec processing.
  - Renders context entries in order.
  - Applies only project-level include/exclude patterns.
  - Supports `followDeps`, depth limiting, metadata freshness, and extraction fallback.
  - Treats `hybrid` as `full`.
- Main issue:
  - Fresh optimized cache is used unconditionally instead of only when optimization is enabled.

### `core:get-spec-context`

- Status: compliant with one ambiguity
- Positive evidence:
  - Workspace/spec resolution goes through orchestrated workspaces.
  - Correctly throws `WorkspaceNotFoundError` and `SpecNotFoundError`.
  - Uses metadata freshness, DFS dependency traversal, depth limiting, and warning accumulation.
  - Full-mode defaults to rules + constraints.
- Ambiguity:
  - The spec text says title/description in full mode are only included when no section filter is active, but the verify scenarios expect title/description persistence even with `sections: ['rules']`.
  - Implementation follows the verify behavior.

### `core:spec-repository-port`

- Status: compliant in reviewed areas
- Positive evidence:
  - Port remains an abstract class over `Repository`.
  - `specsPath` is exposed for filesystem-backed repo only.
  - `FsSpecRepository` hides `spec-lock.json` from normal artifact APIs and `Spec.filenames`.
  - Semantic persisted-state methods are implemented through dedicated sidecar handling.
  - Confinement and read-only enforcement are implemented.
  - Search and `resolveFromPath()` are implemented and tested.
- Notes:
  - The implementation uses `metadata.json` rather than `.specd-metadata.yaml`; that matches the current change specs reviewed here.

### `core:change-repository-port`

- Status: compliant in reviewed areas
- Positive evidence:
  - Port remains abstract and includes `mutate`, `mutateDraft`, read-only artifact loading, scaffold/unscaffold, internal paths, and drift reconciliation.
  - `FsChangeRepository` uses a shared internal load path and per-change lock.
  - Drafted read-only semantics, path helpers, and drift reconciliation hooks are implemented.
  - Idempotent manifest persistence around deduped drift invalidation is implemented.

### `core:storage`

- Status: compliant in reviewed areas
- Positive evidence:
  - Timestamped change directory naming and chronological list ordering are implemented.
  - Artifact status derivation and pre-hash cleanup support exist in `FsChangeRepository`.
  - Lock directory derives from `configPath`.
  - Repository path confinement is enforced through confined path resolution in fs adapters.
- Notes:
  - The storage-related requirements covered by the target scope are strongly exercised by `change-repository.spec.ts` and `spec-repository.spec.ts`.

## Test Coverage

### Executed

- `packages/core/test/application/use-cases/get-spec-context.spec.ts`
- `packages/core/test/application/use-cases/edit-change.spec.ts`
- `packages/core/test/application/use-cases/get-project-context.spec.ts`
- `packages/core/test/application/use-cases/compile-context.spec.ts`
- `packages/core/test/infrastructure/fs/spec-repository.spec.ts`
- `packages/core/test/infrastructure/fs/change-repository.spec.ts`

### Result

- 6 test files passed
- 275 tests passed

### Coverage strengths

- `CompileContext` has broad behavioral coverage, including traversal, preview fallback, fingerprinting, sections, and optimized-context behavior.
- `FsSpecRepository` and `FsChangeRepository` both have strong integration-style coverage against temp filesystems.
- `EditChange` has focused unit coverage for scope edits and dependency seeding.

### Coverage gaps relevant to findings

- Missing explicit `CompileContext` test for `isReady: true` plus `isPermitted: false`.
- Missing explicit `GetProjectContext` test proving fresh optimized project cache is ignored when `llmOptimizedContext` is disabled or omitted.

## Ambiguity Notes

### `core:get-spec-context` section-filter semantics

- `spec.md` says title/description in full mode should appear only when no section filter is active.
- `verify.md` says title/description persist when `sections: ['rules']`.
- Implementation matches `verify.md`, not the stricter sentence in `spec.md`.
- This should be reconciled in spec text to remove reviewer ambiguity.

## Summary

- Findings: 2
- Passed targeted tests: 275/275
- Overall assessment:
  - `edit-change`, `spec-repository-port`, `change-repository-port`, and the reviewed `storage` implementation areas are in good shape.
  - `compile-context` and `get-project-context` each have one substantive behavioral mismatch against their current specs.
