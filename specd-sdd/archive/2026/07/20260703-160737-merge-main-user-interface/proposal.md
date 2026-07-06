# Proposal: merge-main-user-interface

## Motivation

Local `main` now contains three new core-oriented commits that this branch does not yet include. They change canonical spec dependency handling, project-status repository wiring, and change-repository read-path behavior, all of which sit on high-coupling paths that can silently regress the Studio branch if merged without an explicit integration plan.

## Current behaviour

`feat/user-interface` is far ahead of `main` with Studio, API, UI, and SDK work already in place, while local `main` adds only three new commits. The incoming delta is still narrow relative to branch size, but it now touches shared `core`/`sdk`/`cli` behavior and `FsChangeRepository` read semantics, so a naive merge risks breaking kernel wiring, context traversal, project status orchestration, or read-only change inspection even though most branch work is unrelated.

Generated metadata diffs also appear in the overlap surface, but they are not the source of the functional risk and should not drive the manual merge strategy.

After the functional merge and verification work, the change artifacts are no longer fully aligned with the merged outcome: compliance review found a duplicated requirement block in `core:get-project-summary`, context compilation still points at an invalid dependency ID (`core:core/project-metadata`) instead of the existing `core:project-metadata` spec in the affected deltas, and newer `main` commits already carry several config-bootstrap requirements and matching verification scenarios that this branch had originally added.

## Proposed solution

Merge the three new `main` commits into `feat/user-interface` through an explicit integration change that focuses on functional behavior, not generated metadata. The change will align branch behavior with `main` for canonical persisted spec dependency handling, project-status repository wiring, and change-repository read-path locking/invalidation semantics, preserve branch-specific behavior that is still required, and define the expected post-merge verification focus for the highest-risk files.

Metadata conflicts are intentionally treated as generated output and will be regenerated after functional merge resolution with `generate-metadata --write`.

With the merge implemented, the remaining work is to realign the change artifacts with the verified result: collapse any requirement/scenario already present on `main` to `no-op`, replace invalid `core:core/project-metadata` references with the canonical `core:project-metadata` dependency where this change introduced them, and keep the review artifacts synchronized with that narrower correction.

## Specs affected

### New specs

None.

### Modified specs

- `core:compile-context`: align context-compilation expectations with the canonical persisted dependency model introduced on `main`, including how dependency traversal and warnings behave.
  - Depends on (added): `core:project-metadata`
  - Depends on (removed): none
- `core:change-repository-port`: reflect `main`’s new guarantees around lock-protected read-path invalidation and uninitialized repository bypass, while preserving branch-only read-only artifact and drift-reconciliation contracts that still have downstream consumers on this branch.
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: align change-scope dependency seeding for added specs with the persisted dependency semantics introduced on `main`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-context`: align project-context expectations with the incoming canonical metadata and traversal behavior used by the new `main` commits.
  - Depends on (added): `core:project-metadata`
  - Depends on (removed): none
- `core:get-project-summary`: reflect the repository-wiring changes used by `main` for project status reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-spec-context`: align spec-context behavior with the same canonical dependency and extraction rules introduced on `main`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: reflect the canonical repository bootstrap path now required by `main` for status-oriented reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-changes`: reflect the shared repository-wiring path introduced by `main` for status snapshot reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-discarded`: reflect the shared repository-wiring path introduced by `main` for status snapshot reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-drafts`: reflect the shared repository-wiring path introduced by `main` for status snapshot reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-workspaces`: reflect the shared repository-wiring path introduced by `main` for status snapshot reads.
  - Depends on (added): none
  - Depends on (removed): none
- `core:spec-repository-port`: update the port contract to match `main`’s canonical persisted spec-state and metadata expectations.
  - Depends on (added): none
  - Depends on (removed): none
- `core:storage`: reflect `main`’s new requirement that drift/status derivation is bypassed when change repositories are not initialized with resolved artifact types.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-specs`: align validation expectations with canonical metadata consistency checks introduced on `main`.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:build-project-status-snapshot`: align snapshot orchestration with `main`’s canonical host-context and repository-backed read path.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-status`: align CLI `project status` semantics with `main`’s shared snapshot/repository wiring path.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Affected code areas:
  - `packages/core/src/composition/kernel.ts`
  - `packages/core/src/application/use-cases/*` around context, metadata, validation, and project-summary/status reads
  - `packages/core/src/infrastructure/fs/change-repository.ts`
  - `packages/core/src/infrastructure/fs/spec-repository.ts`
  - `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
  - `packages/cli/src/commands/project/status.ts`
  - related tests in `packages/core/test/**`, `packages/sdk/test/**`, and `packages/cli/test/**`
- Affected behavior:
  - persisted spec dependency interpretation
  - change-repository read semantics for `get()`/`mutate()` and lock-scoped drift invalidation
  - project/spec context compilation
  - project status aggregation and wiring
  - artifact/spec consistency after verification, specifically duplicate requirement prose and malformed spec dependency IDs
  - status snapshot orchestration consumed by CLI and Studio-adjacent hosts
- Excluded from manual merge reasoning:
  - generated metadata side effects, which will be regenerated after functional resolution

## Technical context

- Three new commits from local `main` need integration:
  - `971da768` — prevent change repository read paths from writing manifest
  - `5756f9d5` — canonicalize spec dependency metadata
  - `5ed2b5f7` — align project status repository wiring
- The incoming delta now adds a second clear functional hotspot beyond the earlier kernel wiring work: `packages/core/src/infrastructure/fs/change-repository.ts`.
- The expected kernel resolution is to accept `main`’s expanded constructor wiring for `ValidateSpecs` and `GetSpecContext` while preserving branch-only kernel surface that is still used on this branch, including artifact read/save helpers, batch validation, outline helpers, and log-ring-backed log access.
- The expected change-repository resolution is to preserve a real `get()` read path for active changes while moving any manifest persistence behind lock-protected internal reads and bypassing drift detection when artifact types are unresolved, without assuming that branch-only `artifactReadOnly` or shared drift-reconciliation contracts should be deleted unless the merge proves an incompatibility.
- Analysis so far does not show nominal replacements for branch-only helpers such as `GetReadOnlyChangeArtifact`, `SaveChangeArtifact`, `artifactReadOnly`, `reconcileArtifactDrift`, `ValidateChangeBatch`, `OutlineChangeArtifact`, or log-ring-backed kernel logging on the `main` side. The merge strategy is therefore to preserve those capabilities on this branch but update their implementation to fit `main`'s newer repository/bootstrap conventions instead of carrying the branch implementation forward unchanged.
- Review attention is still required for overlapping tests, especially:
  - `packages/core/test/application/use-cases/helpers.ts`
  - `packages/core/test/infrastructure/fs/change-repository.spec.ts`
- Graph impact findings from discovery:
  - `core:src/composition/kernel.ts` is `CRITICAL`
  - `core:src/application/use-cases/get-project-context.ts` is `CRITICAL`
  - `core:src/infrastructure/fs/change-repository.ts` is `CRITICAL`
  - `sdk:src/orchestration/build-project-status-snapshot.ts` is `HIGH`
- Merge verification must therefore prioritize kernel wiring, change-repository read semantics, context traversal, and project status orchestration rather than Studio UI surfaces.
- Metadata conflicts are explicitly non-authoritative for manual decision-making in this change and are expected to be regenerated after merge resolution.
- Compliance review after implementation found two artifact-only issues that now drive the design revision:
  - `core:get-project-summary` merged spec content repeats the same repository-bootstrap requirement twice.
  - Some merged artifacts still reference `core:core/project-metadata`, but the canonical spec ID present in the repository is `core:project-metadata`.
- Additional upstream drift since the merge began means the config-bootstrap requirement/scenario pairs for `core:get-status`, `core:list-changes`, `core:list-discarded`, `core:list-drafts`, `core:list-workspaces`, `core:validate-specs`, `sdk:build-project-status-snapshot`, and `cli:project-status` are now already satisfied by `main`, so the local deltas for those specs are expected to reduce to `no-op`.

## Open questions

None at proposal stage. The change direction is settled: integrate the three new `main` commits, ignore generated metadata in manual merge reasoning, and concentrate design and implementation on the functional `core`/`sdk`/`cli` plus `FsChangeRepository` integration path.
