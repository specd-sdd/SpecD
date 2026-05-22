# Tasks: fix-archive-preflight-atomicity

## 1. Archive preflight refactor

- [x] 1.1 Introduce preflighted publication state in `archive-change.ts`
      `packages/core/src/application/use-cases/archive-change.ts`: `PreparedArchivePlan`, `PreparedArchivePublication`, and new `PreparedArchivePreflightSpec` — extend the archive plan model so publication consumes already-validated per-spec state instead of recomputing checks inside the publish loop
      Approach: add a dedicated in-memory preflight type carrying `extractionArtifacts`, `existingSpecLock`, `finalDependsOn`, `publicationSpecLock`, and `sidecarActive`, keeping the constructor and public `execute()` signature unchanged
      (Req: Prepare archive plan before permanent writes)

- [x] 1.2 Add a full-batch preflight helper before any canonical publication
      `packages/core/src/application/use-cases/archive-change.ts`: `_prepareArchivePreflight()` — execute all archive-time checks that can still fail, across the full archive batch, before the first `specRepo.publish()` call
      Approach: iterate over `PreparedArchivePublication[]`, call a per-spec helper, collect the fully prepared publication state into an array, and abort with `step: 'prepare'` / `commitStarted: false` on any failure
      (Req: Prepare archive plan before permanent writes, Staged archive commit and failed-attempt visibility)

- [x] 1.3 Extract per-spec preflight computation out of the publish loop
      `packages/core/src/application/use-cases/archive-change.ts`: new `_prepareSpecPublicationPreflight()` plus `execute()` — compute extraction artifacts, sidecar eligibility, final `dependsOn`, mismatch checks, and `publicationSpecLock` before publish time
      Approach: move the current work around `_buildFinalSpecArtifactsForExtraction()`, `extractMetadataFromSpecArtifacts()`, `_resolvePersistedDependsOn()`, `_isStructurallyCompatiblePreparedArtifacts()`, and `_buildPublicationSpecLock()` into a helper that returns `PreparedArchivePreflightSpec`
      (Req: Deterministic generation at archive time, spec-lock sidecar persistence)

- [x] 1.4 Change `execute()` to publish only preflighted units
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange.execute()` — replace the current mixed validate-and-publish loop with a strict sequence of raw plan build, full-batch preflight, and then staged publication
      Approach: keep existing guards and pre-hooks intact, then loop over `PreparedArchivePreflightSpec[]` and call `specRepo.publish()` using only already-prepared writes and `publicationSpecLock`, with no remaining archive-rejecting checks in the publish loop
      (Req: Staged archive commit and failed-attempt visibility, Deterministic generation at archive time)

## 2. Metadata and composition boundaries

- [x] 2.1 Preserve metadata post-publication behavior while moving metadata checks into preflight
      `packages/core/src/application/use-cases/archive-change.ts`: metadata generation block after publish — keep `GenerateSpecMetadata` / `SaveSpecMetadata` behavior non-blocking for post-publication metadata failures
      Approach: leave the `staleMetadataSpecPaths` flow intact, but ensure the only metadata-related failures that abort archive are the ones evaluated during full-batch preflight
      (Req: Deterministic generation at archive time)

- [x] 2.2 Confirm composition remains compatible with the internal refactor
      `packages/core/src/composition/use-cases/archive-change.ts`: `createArchiveChange()` — verify no public wiring change is needed and keep constructor dependencies aligned with the refactored helper structure
      Approach: preserve the current `ArchiveChange` constructor signature unless implementation proves otherwise; if new private helper types are introduced, keep them internal to `archive-change.ts`
      (Req: Ports and constructor)

- [x] 2.3 Preserve documentation and JSDoc quality on new helper symbols
      `packages/core/src/application/use-cases/archive-change.ts`: new interfaces and helper methods — add concise JSDoc and keep naming/type style aligned with global architecture, conventions, and docs specs
      Approach: document responsibility and parameters on `PreparedArchivePreflightSpec`, `_prepareArchivePreflight()`, and `_prepareSpecPublicationPreflight()` without introducing domain-layer I/O or loose typing
      (Req: Ports and constructor, Prepare archive plan before permanent writes)

## 3. Regression tests and verification

- [x] 3.1 Add a regression where a later spec failure prevents earlier publication
      `packages/core/test/application/use-cases/archive-change.spec.ts`: `ArchiveChange` multi-spec regression — verify that when spec B fails metadata mismatch or another archive-time preflight check, spec A is not published first
      Approach: build a multi-spec archive fixture with spyable repositories, force a failure in the second spec's preflight path, and assert `publish()` was never called for the first spec
      (Req: Prepare archive plan before permanent writes, Deterministic generation at archive time)

- [x] 3.2 Add an ordering test proving batch preflight completes before first publish
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new ordering-focused test — assert every archive-time check is evaluated before the first staged publication unit begins
      Approach: instrument repository and extraction mocks so the test can observe the sequence `prepare -> preflight all specs -> first publish`, and fail if any publish happens before the batch preflight completes
      (Req: Staged archive commit and failed-attempt visibility)

- [x] 3.3 Update mismatch coverage to the new batch-level guarantee
      `packages/core/test/application/use-cases/archive-change.spec.ts`: existing metadata mismatch tests — tighten assertions so mismatch failures are recorded as prepare-phase failures and leave canonical publication untouched for the full batch
      Approach: reuse current mismatch scenarios but assert `commitStarted: false` semantics indirectly through zero `publish()` calls and unchanged canonical state
      (Req: Deterministic generation at archive time, spec-lock sidecar persistence)

- [x] 3.4 Extend shared test helpers only if the new regressions need them
      `packages/core/test/application/use-cases/helpers.ts`: repository and fixture helpers — add only the support needed to observe multi-spec publish order or per-spec metadata extraction outcomes
      Approach: keep helper changes minimal and test-focused; prefer extending existing stubs over introducing a parallel fixture stack
      (Req: Prepare archive plan before permanent writes)

- [x] 3.5 Run targeted and broader core verification
      `packages/core/test/application/use-cases/archive-change.spec.ts` and core test runner — confirm the new regressions pass and existing archive behavior outside the new guarantee remains intact
      Approach: run `pnpm --filter @specd/core test -- archive-change.spec.ts`, then `pnpm --filter @specd/core test`; manually confirm that a multi-spec archive with a later preflight failure leaves earlier canonical specs untouched
      (Req: Prepare archive plan before permanent writes, Staged archive commit and failed-attempt visibility, Deterministic generation at archive time)
