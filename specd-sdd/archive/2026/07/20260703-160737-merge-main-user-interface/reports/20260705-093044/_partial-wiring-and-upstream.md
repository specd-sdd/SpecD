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
