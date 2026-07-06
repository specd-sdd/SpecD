# Proposal: fix-project-status-repository-wiring

## Motivation

`project status` and closely related read paths can bootstrap repositories differently from the canonical composition-backed read flow, which makes status reads vulnerable to artifact-drift false positives and similar read-path failures. This needs to be corrected now so status-oriented tooling can rely on one complete repository wiring model.

## Current behaviour

Today, several composition factories build `ChangeRepository` or `SpecRepository` from partial filesystem options instead of using a complete canonical bootstrap path. In practice, the `project status` flow depends on factories such as `createGetProjectSummary`, `createListChanges`, `createListDrafts`, `createListDiscarded`, `createListWorkspaces`, and `createGetStatus`, and those factories can miss schema-driven artifact-type behavior or consistent metadata-path resolution.

This means a read-oriented command can observe a different repository view than other composition-backed status reads, which is enough to trigger false artifact status derivation or other read-path inconsistencies. The separate issue of persisting write-on-read mutations is out of scope for this change and will be handled in `fix-change-repository-write-on-read`.

## Proposed solution

Align the `project status` path and the directly related read/composition factories with a complete canonical repository bootstrap path. The change will standardize how these factories bootstrap `ChangeRepository` and `SpecRepository` so they receive schema-driven artifact-type resolution, spec existence checks, and metadata-path semantics directly from shared composition logic.

The scope also includes sibling factories that share the same incomplete bootstrap pattern and therefore present a similar bug surface. It does not expand into a repo-wide composition refactor or into persistence safeguards for read paths.

## Specs affected

### New specs

None.

### Modified specs

- `core:get-project-summary`: clarify that summary wiring must use complete canonical repository bootstrap for its downstream list use cases.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-workspaces`: clarify that workspace enumeration must expose correctly initialized spec repositories, including canonical metadata-path resolution.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-changes`: clarify that active change enumeration must use complete canonical change repository bootstrap.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-drafts`: clarify that draft enumeration must use complete canonical change repository bootstrap.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-discarded`: clarify that discarded change enumeration must use complete canonical change repository bootstrap.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: clarify that status reads must be assembled from repositories and supporting services bootstrapped through the same canonical composition semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:build-project-status-snapshot`: clarify that the SDK snapshot path inherits the aligned core read-path behavior and remains the canonical cross-package project-status orchestration.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-status`: clarify that the CLI command depends on the aligned SDK/core read path rather than bespoke repository bootstrap behavior.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core` composition factories for project-summary, list, workspace, and status read paths.
- `@specd/sdk` project status snapshot orchestration.
- `@specd/cli` `project status` command behavior and its tests.
- Repository bootstrap semantics for read-oriented status tooling.

## Technical context

- The key affected files identified during exploration were:
  - `packages/core/src/composition/use-cases/get-project-summary.ts`
  - `packages/core/src/composition/use-cases/list-workspaces.ts`
  - `packages/core/src/composition/use-cases/list-changes.ts`
  - `packages/core/src/composition/use-cases/list-drafts.ts`
  - `packages/core/src/composition/use-cases/list-discarded.ts`
  - `packages/core/src/composition/use-cases/get-status.ts`
  - `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
  - `packages/cli/src/commands/project/status.ts`
- `createGetProjectSummary` currently composes multiple list use cases and inherits any wiring defects from them.
- `createListChanges`, `createListDrafts`, and `createListDiscarded` construct `ChangeRepository` directly from basic storage paths.
- `createGetStatus` also assembles its own `ChangeRepository` and related dependencies directly.
- `createListWorkspaces` constructs `SpecRepository` directly using a simplified metadata-path derivation.
- Graph investigation showed `createGetProjectSummary`, `createListWorkspaces`, and `createGetStatus` as critical, high-impact composition points.
- The user explicitly constrained this change to exclude write-on-read persistence handling and to avoid turning the fix into a broad repo-wide composition cleanup.

## Open questions

None. The scope boundary is decided: fix the main `project status` wiring bug and sibling routes with the same incomplete bootstrap pattern, but leave write-on-read persistence fixes to `fix-change-repository-write-on-read`.
