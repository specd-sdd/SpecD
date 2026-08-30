# Tasks: prevent-orphan-spec-locks

## 1. Input Validation and Self-Healing

- [x] 1.1 Validate specId at link addition in UpdateImplementationTracking
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `_validateMutation` — check if `input.specId` is in `change.specIds` or in `_specRepositories`, throw `SpecNotFoundError` if missing
      Approach: In `_validateMutation`, check if `!change.specIds.includes(input.specId)`; if not, look up in `_specRepositories.get(workspace).get(specPath)`. Throw `SpecNotFoundError(input.specId)` if absent.
      (Req: Requirement: Add mutation creates or enriches implementation links)
- [x] 1.2 Wire specRepositories into UpdateImplementationTracking composition factory
      `packages/core/src/composition/use-cases/update-implementation-tracking.ts`: `resolveUpdateImplementationTrackingDeps` — pass `specRepositories` from resolver
      Approach: Resolve `specRepositories` from `resolver.specRepositories()` and pass into `UpdateImplementationTrackingDeps`.
      (Req: Requirement: Config-based factory delegates through resolveUpdateImplementationTrackingDeps)
- [x] 1.3 Add spec sweep to RefreshImplementationTracking
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `_specSweep` — prune dangling implementation links referencing nonexistent specs
      Approach: Iterate over `freshChange.implementationLinks`. If `specId` is not in `freshChange.specIds` and not found in `_specRepositories`, prune it from `freshChange.implementationLinks`.
      (Req: Requirement: Spec sweep prunes dangling implementation links)
- [x] 1.4 Wire specRepositories into RefreshImplementationTracking composition factory
      `packages/core/src/composition/use-cases/refresh-implementation-tracking.ts`: `resolveRefreshImplementationTrackingDeps` — pass `specRepositories` from resolver
      Approach: Resolve `specRepositories` from `resolver.specRepositories()` and pass into `RefreshImplementationTrackingDeps`.
      (Req: Requirement: Config-based factory delegates through resolveRefreshImplementationTrackingDeps)

## 2. Orchestration and Archive Safety

- [x] 2.1 Trigger refresh in EditChange when spec scope changes
      `packages/core/src/application/use-cases/edit-change.ts`: `execute` — call `_refresh.execute({ name })` when `invalidated` is true
      Approach: Accept optional `refreshImplementationTracking` dependency. On `persisted.invalidated === true`, execute refresh.
      (Req: Requirement: Implementation tracking refresh on spec change)
- [x] 2.2 Wire refreshImplementationTracking into EditChange composition factory
      `packages/core/src/composition/use-cases/edit-change.ts`: `resolveEditChangeDeps` — pass `refreshImplementationTracking` from resolver
      Approach: Resolve `refreshImplementationTracking` from resolver and forward to `EditChangeDeps`.
      (Req: Requirement: Config-based factory delegates through resolveEditChangeDeps)
- [x] 2.3 Safely discard nonexistent spec candidates in ArchiveChange
      `packages/core/src/application/use-cases/archive-change.ts`: `_prepareArchivePlan` — discard nonexistent spec candidates from publication plan
      Approach: When iterating `implementationBySpecId`, verify if the spec exists in canonical repository or is being created. If missing, delete from `implementationBySpecId` and skip adding to publication candidates.
      (Req: Requirement: Implementation materialization into spec-lock)
- [x] 2.4 Guard FsSpecRepository against publishing empty spec directories
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `publish` — throw `SpecPublicationError` when `!specDirExists && publication.artifacts.length === 0`
      Approach: Check if directory exists; if not and artifacts array is empty, throw `SpecPublicationError`.
      (Req: Requirement: Reject publication of empty spec directories)

## 3. Automated Tests & Verification

- [x] 3.1 Add regression tests for UpdateImplementationTracking specId validation
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`: test suite — assert `SpecNotFoundError` on invalid specId
      Approach: Add test cases verifying link addition with nonexistent specId fails with `SpecNotFoundError`.
      (Req: Requirement: Add mutation creates or enriches implementation links)
- [x] 3.2 Add regression tests for RefreshImplementationTracking spec sweep
      `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts`: test suite — assert dangling links are pruned
      Approach: Add test cases verifying that `_specSweep` removes links to specs absent from both change and repository.
      (Req: Requirement: Spec sweep prunes dangling implementation links)
- [x] 3.3 Add regression tests for EditChange auto-refresh
      `packages/core/test/application/use-cases/edit-change.spec.ts`: test suite — assert refresh is called on spec removal
      Approach: Add test case verifying `refreshImplementationTracking.execute` is invoked when removing specIds.
      (Req: Requirement: Implementation tracking refresh on spec change)
- [x] 3.4 Add regression tests for ArchiveChange nonexistent spec discard
      `packages/core/test/application/use-cases/archive-change.spec.ts`: test suite — assert nonexistent spec link does not publish orphan lock
      Approach: Add test case where change has an implementation link for a missing spec, asserting archive succeeds without publishing that spec.
      (Req: Requirement: Implementation materialization into spec-lock)
- [x] 3.5 Add regression tests for FsSpecRepository empty publish rejection
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: test suite — assert `SpecPublicationError` when publishing empty spec
      Approach: Add test case asserting `publish` throws `SpecPublicationError` when `artifacts` is empty and directory does not exist.
      (Req: Requirement: Reject publication of empty spec directories)
- [x] 3.6 Run full test suite for @specd/core
      `packages/core`: full test run — verify 2,401 tests pass across 195 test files
      Approach: Execute `pnpm --filter @specd/core test` and verify clean execution with 0 errors.
