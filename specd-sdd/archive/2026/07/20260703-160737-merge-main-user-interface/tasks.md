# Tasks: merge-main-user-interface

## 1. Merge execution

- [x] 1.1 Execute the real merge from `main` into `feat-user-interface`
      `git merge main`: repository merge state — create the actual Git merge and surface the true conflict set instead of replaying code manually
      Approach: run `git merge main` first, keep the merge state intact while resolving conflicts, and treat subsequent file edits as conflict resolution on top of Git's merge result
      (Req: No direct repository bootstrap in snapshot orchestration, Req: No direct repository bootstrap in command handler)

- [x] 1.2 Resolve non-metadata conflicts with the documented canonical strategy
      `packages/core/src/composition/kernel.ts`, `packages/core/src/infrastructure/fs/change-repository.ts`, `packages/core/src/application/use-cases/*.ts`, `packages/sdk/src/orchestration/build-project-status-snapshot.ts`, `packages/cli/src/commands/project/status.ts`: merge conflicts — reconcile branch work with `main` using canonical bootstrap, metadata, and change-repository read semantics
      Approach: resolve Git conflict hunks in favor of `main`'s canonical bootstrap path and lock-scoped read semantics where the updated specs require it, then reapply any still-valid branch behavior only when it does not reintroduce parallel repository/bootstrap logic or write-on-read side effects
      Note: newer `main` commits already absorbed the `GetProjectSummary` bootstrap requirement/scenario plus the equivalent config-bootstrap requirement/scenario pairs for `GetStatus`, `ListChanges`, `ListDiscarded`, `ListDrafts`, `ListWorkspaces`, `ValidateSpecs`, SDK snapshot orchestration, and CLI `project status`, so those local spec/verify deltas are expected to collapse to `no-op` during artifact review rather than be re-added here.
      (Req: Config-based factory preserves complete repository bootstrap, Req: Config-based summary wiring preserves complete repository bootstrap semantics)

## 2. Canonical metadata semantics

- [x] 2.1 Return persisted metadata freshness from the spec repository contract
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository.metadata()` — change the return type to `PersistedSpecMetadata | null` so every caller receives freshness state as part of the contract
      Approach: update the abstract port first, then adapt all repository and use-case call sites to consume `metadata.freshness` instead of recomputing hash checks locally
      (Req: metadata returns parsed metadata or null)

- [x] 2.2 Classify metadata freshness inside the filesystem repository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository.metadata()` and `_classifyMetadataFreshness()` — compute freshness from `contentHashes` parity plus `readPersistedDependsOn(spec)` parity
      Approach: parse persisted metadata, read semantic dependency state, run `checkMetadataFreshness`, and return `fresh` only when both artifact hashes and dependency projections match canonical persisted state
      (Req: persisted spec semantics and stable spec hash)

- [x] 2.3 Hide `spec-lock.json` from generic artifact enumeration and counting
      `packages/core/src/infrastructure/fs/spec-repository.ts`: directory walking, `filterFiles()`, `allowedSpecArtifactFilenames()`, and spec counting helpers — exclude `spec-lock.json` from `Spec.filenames`, generic reads, and count heuristics
      Approach: keep sidecar access semantic-only through `readPersistedDependsOn(spec)` while preserving existing path-confinement rules for allowed artifact files
      (Req: Spec artifact access is limited to expected artifact files)

- [x] 2.4 Preserve stable hash behavior with semantic dependency state
      `packages/core/src/infrastructure/fs/spec-repository.ts`: stable hash and persisted dependency handling — ensure unchanged semantic state yields the same hash and dependency-state changes yield a new hash
      Approach: keep sidecar state part of canonical persisted semantics without exposing it as a normal artifact
      (Req: persisted spec semantics and stable spec hash)

## 3. Context traversal and change seeding

- [x] 3.1 Remove local freshness recomputation from compile-context
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` and dependency traversal path — switch from `_isMetadataFresh()` to repository-provided `metadata.freshness`
      Approach: delete the private freshness helper, use fresh metadata for rendering, emit `stale-metadata` warnings for stale metadata, and keep persisted `metadata.dependsOn` ahead of extraction fallback
      (Req: Context spec collection, Req: dependsOn resolution order)

- [x] 3.2 Remove local freshness recomputation from project context
      `packages/core/src/application/use-cases/get-project-context.ts`: `GetProjectContext.execute()` — render content only from fresh metadata and keep stale metadata distinct from missing metadata
      Approach: stop calling `checkMetadataFreshness`, use `metadata.freshness`, warn on stale metadata, and retain extraction fallback only when canonical metadata projection is absent
      (Req: Supports dependsOn traversal when followDeps is true)

- [x] 3.3 Unify spec-context traversal with shared dependsOn traversal
      `packages/core/src/application/use-cases/get-spec-context.ts`: constructor, `execute()`, `_buildDependencyEntry()`, `_buildDependsOnFallback()` — switch to `traverseDependsOn` and add schema/parser/extractor/workspace-route dependencies
      Approach: build a workspace map from `ListWorkspaces`, feed shared fallback config into `traverseDependsOn`, then materialize dependency entries through canonical repository lookups using `metadata.freshness`
      (Req: Transitive dependency traversal, Req: Warnings for unresolvable dependencies)

- [x] 3.4 Seed edited changes from canonical semantic dependency state
      `packages/core/src/application/use-cases/edit-change.ts`: spec-addition seeding path — prefer `readPersistedDependsOn(spec)` and fall back to `metadata.json.dependsOn` only when semantic state is absent
      Approach: preserve existing in-change `specDependsOn` snapshots, seed new entries from semantic state first, and accept stale metadata as legacy fallback data when necessary
      (Req: Seed specDependsOn for added specs)

## 4. Validation and composition bootstrap

- [x] 4.1 Enforce canonical metadata consistency during spec validation
      `packages/core/src/application/use-cases/validate-specs.ts`: `_validateSpec()`, `_validateMetadataConsistency()`, `_extractDependsOn()` — fail stale metadata and dependency-projection drift
      Approach: after normal artifact validation, compare `metadata.freshness`, `metadata.dependsOn`, extracted `dependsOn`, and `readPersistedDependsOn(spec)`; only run extraction when the schema declares `metadataExtraction.dependsOn`
      (Req: Canonical metadata consistency validation)

- [x] 4.2 Preserve lock-scoped active-change reads in the filesystem repository
      `packages/core/src/infrastructure/fs/change-repository.ts`: `get()`, `_getInternal()`, `_manifestToChange()`, and `mutate()` — align active reads with `main` so manifest persistence happens only under `_withChangeLock`, `mutate()` reloads with `skipWrite: true`, and uninitialized repositories bypass drift/status derivation
      Approach: keep `_manifestToChange()` pure with respect to disk writes, return `hasChangesToPersist`, persist only after reloading inside the lock, and then reconcile branch-only `artifactReadOnly` / drift-reconciliation APIs explicitly instead of dropping them by assumption or preserving their old implementation shape unchanged
      (Req: get returns a Change or null, Req: mutate serializes persisted change updates, Req: Auto-invalidation on get when artifact files drift, Req: Artifact status derivation)

- [x] 4.3 Wire canonical dependencies into kernel composition
      `packages/core/src/composition/kernel.ts`: `createKernel()` and `Kernel` surface — merge `main`’s canonical bootstrap by passing schema provider, parser registry, extractor transforms, and workspace routes into `ValidateSpecs` and `GetSpecContext`
      Approach: keep `main`’s canonical constructor/bootstrap wiring for metadata and project-status flows, but preserve branch-only helper APIs and log-ring-backed logging while they still support API/client/desktop callers, adapting those helpers to the new bootstrap path when `main` has no nominal replacement for them
      (Req: Config-based factory preserves complete repository bootstrap, Req: No direct repository bootstrap in snapshot orchestration)

- [x] 4.4 Align config-based composition factories with canonical repository semantics
      `packages/core/src/composition/use-cases/get-status.ts`, `get-project-summary.ts`, `list-changes.ts`, `list-discarded.ts`, `list-drafts.ts`, `list-workspaces.ts`, `get-spec-context.ts` — ensure factory wiring matches kernel bootstrap semantics
      Approach: instantiate repositories and downstream use cases through shared composition helpers so artifact-state derivation, metadata-path semantics, and workspace repositories are identical to the kernel path
      (Req: Config-based summary wiring preserves complete repository bootstrap semantics, Req: Config-based factory preserves complete change repository bootstrap, Req: Config-based factory preserves canonical spec repository bootstrap, Req: list returns active changes in creation order)

- [x] 4.5 Keep SDK and CLI project status on host-context queries only
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts` and `packages/cli/src/commands/project/status.ts` — remove any alternate direct repository path and read summary/workspaces through `SdkHostContext`
      Approach: use host-context project queries and snapshot orchestration as the only repository-backed read path in adapter layers
      (Req: No direct repository bootstrap in snapshot orchestration, Req: No direct repository bootstrap in command handler)

- [x] 4.6 Reconcile `GetStatus` merge semantics with canonical config bootstrap
      `packages/core/src/application/use-cases/get-status.ts` and `packages/core/src/composition/use-cases/get-status.ts` — keep full schema-driven artifact-state derivation and drop branch-only short-circuit/status-surface divergence from the merge
      Approach: resolve conflicts by keeping the branch-local polling/status fields that active API/client/UI/desktop callers still use, while adopting `main`’s canonical repository/bootstrap path and ensuring config-based factory tests assert both behaviors together
      (Req: Config-based factory preserves complete repository bootstrap)

- [x] 4.7 Adapt branch-only artifact helper use cases to `main`'s newer internals
      `packages/core/src/application/use-cases/save-change-artifact.ts`, `get-read-only-change-artifact.ts`, `validate-change-batch.ts`, `outline-change-artifact.ts`, and their kernel wiring — keep the branch capabilities, but update them so they rely on the post-merge repository/bootstrap conventions instead of pre-merge branch assumptions
      Approach: for each helper, confirm there is no nominal replacement on `main`, then rewire it onto the merged `FsChangeRepository`, kernel, and status/bootstrap semantics without reintroducing write-on-read behavior or alternate repository bootstrap paths
      (Req: Config-based factory preserves complete repository bootstrap, Req: get returns a Change or null, Req: mutate serializes persisted change updates)

## 5. Tests and verification

- [x] 5.1 Add repository tests for sidecar hiding and stale metadata classification
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: new describe blocks — cover hidden `spec-lock.json`, stale metadata readability, and semantic dependency-state parity
      Approach: construct fixture specs with sidecars and mismatched metadata, then assert generic artifact APIs hide sidecars while semantic repository APIs remain authoritative
      (Req: Spec artifact access is limited to expected artifact files, Req: metadata returns parsed metadata or null, Req: persisted spec semantics and stable spec hash)

- [x] 5.2 Add repository tests for lock-scoped read semantics
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: new describe blocks — cover clean `get()` with no manifest write, `mutate()` skip-write reload, uninitialized artifact-type bypass, and lock-scoped drift invalidation persistence
      Approach: construct active changes with and without resolved artifact types, observe manifest mtimes/history before and after reads, assert drift-triggered writes only happen through the lock-scoped internal read path, and retain tests for branch-only `artifactReadOnly` / public drift reconciliation unless implementation resolution intentionally removes them
      (Req: get returns a Change or null, Req: mutate serializes persisted change updates, Req: Auto-invalidation on get when artifact files drift, Req: Artifact status derivation)

- [x] 5.3 Add use-case tests for context traversal and edit-change seeding
      `packages/core/test/application/use-cases/compile-context.spec.ts`, `get-project-context.spec.ts`, `get-spec-context.spec.ts`, `edit-change.spec.ts` — cover stale metadata warnings, metadata-first dependency projection, extraction fallback, cycles, and semantic seeding
      Approach: create focused fixtures per scenario and map each verify scenario to at least one targeted test instead of broad integration-only coverage
      (Req: Context spec collection, Req: dependsOn resolution order, Req: Supports dependsOn traversal when followDeps is true, Req: Transitive dependency traversal, Req: Warnings for unresolvable dependencies, Req: Seed specDependsOn for added specs)

- [x] 5.4 Add validation and bootstrap regression tests
      `packages/core/test/application/use-cases/validate-specs.spec.ts`, `get-status.spec.ts`, `get-project-summary.spec.ts`, `packages/core/test/composition/use-cases/*.spec.ts` — cover stale metadata failures and canonical factory bootstrap behavior
      Approach: assert failures for stale/drifted metadata and assert factory-created use cases expose the same repository semantics as the kernel path
      (Req: Canonical metadata consistency validation, Req: Config-based summary wiring preserves complete repository bootstrap semantics, Req: Config-based factory preserves complete change repository bootstrap, Req: Config-based factory preserves canonical spec repository bootstrap, Req: Config-based factory preserves complete repository bootstrap)

- [x] 5.5 Add SDK and CLI regression tests for project-status bootstrap
      `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts` and `packages/cli/test/commands/project/status.spec.ts` — verify adapter layers do not construct repositories directly
      Approach: spy on host-context project queries and snapshot orchestration inputs, then assert summary/workspace reads flow exclusively through `SdkHostContext`
      (Req: No direct repository bootstrap in snapshot orchestration, Req: No direct repository bootstrap in command handler)

- [x] 5.6 Run validation, targeted tests, and metadata regeneration smoke checks
      `specd-sdd/changes/20260703-160737-merge-main-user-interface`: change verification workflow — validate artifacts, run targeted core/sdk/cli suites, and confirm metadata regeneration clears stale failures
      Approach: execute the artifact validators, targeted package test commands, `project status --context`, and `generate-metadata --write`; include the new change-repository regression suite in the core run; if a user-visible command contract changes during implementation, update the relevant `docs/` page in the same step. During post-merge artifact review, also confirm any requirement/scenario now present on `main` is left as a `no-op` delta instead of duplicated locally.
      (Req: Canonical metadata consistency validation, Req: No direct repository bootstrap in command handler)
