# Specs Compliance Audit

- Change: `merge-main-user-interface`
- Mode: `--change`
- Timestamp: `20260705-093044`
- Partial reports: `2`
- Total findings: `5`
- High severity: `2`
- Medium severity: `3`
- Targeted tests observed: `354 passed` (`275` substantive + `79` wiring/upstream)

## Detailed Findings

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

---

# Spec Compliance Audit: Wiring / No-op / Spec-Absorption Slice

Change: `merge-main-user-interface`  
Audit slice: wiring, no-op deltas, upstream/spec-absorption checks  
Audited specs:

- `core:get-project-summary`
- `core:get-status`
- `core:list-changes`
- `core:list-discarded`
- `core:list-drafts`
- `core:list-workspaces`
- `core:validate-specs`
- `sdk:build-project-status-snapshot`
- `cli:project-status`

Report date: `2026-07-05`

## Scope and Method

- Used graph-first discovery via `project status --graph`, `graph search`, and `graph impact`.
- Read merged change previews with `node packages/cli/dist/index.js changes spec-preview merge-main-user-interface <specId>`.
- Inspected implementation and wiring in `core`, `sdk`, and `cli`.
- Ran focused tests for the slice:
  - `packages/core/test/application/use-cases/{get-project-summary,get-status,list-changes,list-discarded,list-drafts,list-workspaces,validate-specs}.spec.ts`
  - `packages/core/test/composition/use-cases/{get-project-summary,get-status,list-changes,list-discarded,list-drafts,list-workspaces}.spec.ts`
  - `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
  - `packages/cli/test/commands/project/status.spec.ts`
- Result: `15` test files passed, `79` tests passed.

## Findings

### 1. `buildProjectStatusSnapshot` does not degrade `graphHealth` to `null` when hotspot loading fails

Severity: high  
Specs:

- `sdk:build-project-status-snapshot`
- upstream consumer risk for `cli:project-status`

Evidence:

- The spec requires graph-loading failures, including hotspot loading failure, to return `graphHealth: null` and not throw.
- Current implementation only nulls `hotspots` when `provider.getHotspots()` fails, while preserving the previously loaded `graphHealth`.
- Relevant code: [packages/sdk/src/orchestration/build-project-status-snapshot.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/sdk/src/orchestration/build-project-status-snapshot.ts:68)
  - `graphHealth` is assigned before hotspot loading.
  - hotspot failure is caught locally at lines 79-84 and only sets `hotspots = null`.
  - the outer catch that nulls `graphHealth` is not reached for hotspot-only failures.

Why this is noncompliant:

- The merged spec text for `sdk:build-project-status-snapshot` explicitly treats hotspot failure as part of graph loading failure behavior.
- Current behavior can report a partially successful graph snapshot where the spec requires degraded unavailability semantics.

Test coverage status:

- Existing tests cover:
  - no graph request
  - graph success
  - hotspot success
  - provider-open failure
- Existing tests do **not** cover hotspot failure degradation.
- Relevant test file: [packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts:38)

### 2. `createGetStatus(config)` bypasses canonical schema-resolution semantics by dropping `schemaPlugins` and `schemaOverrides`

Severity: high  
Specs:

- `core:get-status`

Evidence:

- The spec requires `GetStatus` to use a `SchemaProvider` that supplies the fully resolved active schema.
- Canonical config-based schema resolution includes plugins and overrides:
  - [packages/core/src/composition/schema-resolution.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/composition/schema-resolution.ts:71)
  - `createResolveSchemaForConfig()` passes `config.schemaPlugins ?? []` and `config.schemaOverrides`.
- `createGetStatus(config)` does not use that canonical helper.
- Instead it constructs `ResolveSchema` manually with empty plugins and no overrides:
  - [packages/core/src/composition/use-cases/get-status.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/composition/use-cases/get-status.ts:150)
  - same issue exists in the explicit-options branch at line 189.

Why this is noncompliant:

- Status derivation is schema-driven.
- Any project relying on schema plugins or overrides can receive lifecycle/status projections from a weaker schema than the canonical kernel path.
- That violates the absorbed requirement that config-based status wiring preserve complete repository/bootstrap semantics and the spec text that `SchemaProvider` represents the fully resolved schema.

Observed impact surface:

- Artifact DAG interpretation
- task-capable artifact behavior
- lifecycle gating and effective status calculation
- review/blocker derivation

Test coverage status:

- Composition coverage only asserts the factory returns a `GetStatus` instance.
- No test asserts that `createGetStatus(config)` preserves plugin/override semantics.
- Relevant test file: [packages/core/test/composition/use-cases/get-status.spec.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/test/composition/use-cases/get-status.spec.ts:63)

### 3. `createValidateSpecs(config)` also drops `schemaPlugins` and `schemaOverrides`, diverging from canonical active-schema resolution

Severity: medium  
Specs:

- `core:validate-specs`

Evidence:

- `createValidateSpecs(config)` delegates into an options-based branch that manually constructs:
  - `new ResolveSchema(schemas, opts.schemaRef, [], undefined)`
- Relevant code:
  - [packages/core/src/composition/use-cases/validate-specs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/composition/use-cases/validate-specs.ts:59)
  - [packages/core/src/composition/use-cases/validate-specs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/composition/use-cases/validate-specs.ts:82)
- As above, canonical config-based schema resolution preserves plugins and overrides:
  - [packages/core/src/composition/schema-resolution.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/composition/schema-resolution.ts:71)

Why this is noncompliant:

- `ValidateSpecs` is specified to validate against the active schema.
- If schema plugins or overrides add, remove, or mutate spec-scoped artifacts, validations, or metadata extraction, the config-based factory can validate against the wrong schema.
- This directly affects the absorbed no-op checks around metadata consistency and spec-level structural validation.

Test coverage status:

- Application-level tests cover metadata consistency behavior and cross-artifact validation well.
- They instantiate `ValidateSpecs` directly with an injected schema provider, so they do not exercise the config-based factory wiring.
- No composition-level test for `createValidateSpecs(config)` was identified in this slice.

## Conformant Areas Checked

- `core:get-project-summary`
  - Implementation matches count-only aggregation requirements.
  - Uses `Promise.all` for independent operations.
  - Uses `archived.meta.total`, not `items.length`.
  - Config factory composes `createListChanges`, `createListDrafts`, `createListDiscarded`, `createListArchived`, and `createListWorkspaces`.

- `core:list-changes`, `core:list-drafts`, `core:list-discarded`
  - Runtime behavior matches their simple repository-delegation requirements.
  - Config-based factories route through `createSharedChangeRepository`, preserving canonical change-repository bootstrap for those paths.

- `core:list-workspaces`
  - Returns ordered workspace views with `specRepo`.
  - Config-based factory routes through shared spec-repository wiring.

- `cli:project-status`
  - Uses `openSpecdHost` and `buildProjectStatusSnapshot`.
  - Uses summary counts from snapshot rather than direct list/count orchestration for project totals.
  - Uses `listWorkspaces` for workspace display.
  - `--context` path calls `GetProjectContext.execute({})` and, when optimized context is fresh, `GetProjectContext.execute({ llmOptimizedContext: false })`.

## Test Coverage Assessment

Strong coverage:

- `GetProjectSummary` application behavior
- `GetStatus` application behavior for refresh, blockers, drafted-read-only projection, task completion, and effective-status cascade
- `ValidateSpecs` application behavior for metadata/hash/dependsOn drift
- `project status` command routing and output shape

Residual gaps:

- No test covers hotspot-failure degradation semantics in `buildProjectStatusSnapshot`.
- `createGetStatus(config)` has only a smoke test and does not verify canonical schema-resolution wiring.
- No composition test was found for `createValidateSpecs(config)`.
- The no-op/bootstrap requirements for `list-changes`, `list-drafts`, `list-discarded`, and `get-project-summary` are mostly covered by smoke assertions rather than explicit semantic bootstrap probes.

## Ambiguity Notes

- The absorbed no-op deltas in this slice were treated as in-scope requirements, not as ignorable metadata. The audit therefore evaluated current code against the merged preview content even where the change preview reported "no-op delta, showing original".
- Finding 1 depends on the merged spec wording for hotspot failure being part of graph-loading failure semantics. Based on the current preview content, that interpretation is direct rather than inferred.

## Summary

- Findings: `3`
- High severity: `2`
- Medium severity: `1`
- Focused tests run: `79 passed / 79 total`
