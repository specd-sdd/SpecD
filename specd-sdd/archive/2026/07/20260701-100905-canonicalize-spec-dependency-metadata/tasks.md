# Tasks: canonicalize-spec-dependency-metadata

## 1. Repository boundary

- [x] 1.1 Filter `spec-lock.json` out of spec metadata listings
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `get()` / `list()` helpers — stop surfacing `spec-lock.json` in `Spec.filenames`
      Approach: keep schema artifacts as the normal filename set and treat sidecars as adapter-internal state only
      (Req: Sidecar is not a schema artifact, Spec artifact access is limited to expected artifact files)

- [x] 1.2 Reject `spec-lock.json` through the generic artifact API
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `artifact()` / `save()` — reject sidecar filenames even when they exist on disk
      Approach: extend the existing expected-artifact/path-confinement checks instead of adding a separate sidecar read path
      (Req: Sidecar is not a schema artifact, Spec artifact path confinement)

- [x] 1.3 Extend repository adapter tests for sidecar exclusion
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: repository artifact tests — assert `Spec.filenames` excludes `spec-lock.json` and semantic persisted reads still work
      Approach: add cases around `get()`, `list()`, `artifact()`, and `readPersistedDependsOn()`
      (Req: Spec artifact access is limited to expected artifact files, persisted spec semantics and stable spec hash)

## 2. Metadata generation

- [x] 2.1 Canonicalize generated `dependsOn` from persisted state
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `GenerateSpecMetadata.execute()` — merge extracted metadata with `readPersistedDependsOn(spec)`
      Approach: run extraction first, then compare extracted `dependsOn` against persisted state; persisted wins when present and mismatch fails explicitly
      (Req: Deterministic generation at archive time, dependsOn resolution, Assembled result)

- [x] 2.2 Preserve implementation projection while assembling canonical metadata
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `projectImplementationMetadata()` call site — keep implementation projection alongside canonical `dependsOn`
      Approach: assemble the final metadata object from extracted fields, canonical `dependsOn`, persisted implementation projection, hashes, and `generatedBy: 'core'`
      (Req: Assembled result, Implementation projection)

- [x] 2.3 Add metadata-generation tests for persisted/extracted dependency rules
      `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`: metadata generation scenarios — cover omitted extraction, persisted fallback, and mismatch failure
      Approach: create fixtures with extraction returning none/some deps and repository persisted deps returning same/different sets
      (Req: dependsOn resolution, Canonical metadata dependency projection works without extraction)

## 3. Change snapshot seeding

- [x] 3.1 Keep creation seeding on semantic persisted dependency loading
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChange.execute()` — ensure `loadPersistedSpecDependsOn()` remains the only seeding path
      Approach: do not add direct sidecar logic; preserve persisted-first, metadata-second behavior from the shared helper
      (Req: Initial specDependsOn seeding)

- [x] 3.2 Keep scope-edit seeding on semantic persisted dependency loading
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute()` — seed only newly added specs through the shared helper
      Approach: preserve existing snapshot entries and only set new ones after `updateSpecIds()` invalidates approvals
      (Req: Seed specDependsOn for added specs)

- [x] 3.3 Update create/edit change tests for semantic-first seeding
      `packages/core/test/application/use-cases/create-change.spec.ts`, `packages/core/test/application/use-cases/edit-change.spec.ts`: seeding scenarios — assert semantic persisted deps win and metadata remains the legacy fallback
      Approach: use fake repositories that expose both persisted deps and metadata to verify ordering
      (Req: Initial specDependsOn seeding, Seed specDependsOn for added specs)

## 4. Context traversal

- [x] 4.1 Canonicalize shared dependency traversal order
      `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`: `traverseDependsOn()` — prefer metadata `dependsOn`, fall back to extraction only when metadata is absent
      Approach: keep `missing-metadata` warnings, but do not re-extract when metadata already exists
      (Req: Context spec collection, dependsOn resolution order, Supports dependsOn traversal when followDeps is true, Transitive dependency traversal)

- [x] 4.2 Align `CompileContext` with canonical metadata traversal
      `packages/core/src/application/use-cases/compile-context.ts`: traversal and rendering flow — keep `change.specDependsOn` highest priority, metadata second, extraction only for absent metadata
      Approach: reuse the shared traversal helper and preserve current fingerprint/warning behavior around traversal source changes
      (Req: Context spec collection, dependsOn resolution order, Use by CompileContext)

- [x] 4.3 Align project and single-spec context flows with canonical metadata traversal
      `packages/core/src/application/use-cases/get-project-context.ts`, `packages/core/src/application/use-cases/get-spec-context.ts`: dependency traversal logic — remove any need for generic sidecar reads
      Approach: keep these readers metadata-first and extraction-fallback-only when metadata is absent and schema extraction exists
      (Req: Supports dependsOn traversal when followDeps is true, Transitive dependency traversal, Warnings for unresolvable dependencies)

- [x] 4.4 Add traversal tests for metadata-first behavior
      `packages/core/test/application/use-cases/compile-context.spec.ts`, `get-project-context.spec.ts`, `get-spec-context.spec.ts`, `_shared/depends-on-traversal.spec.ts`: dependency traversal scenarios — cover metadata without extraction, absent-metadata fallback extraction, and manifest override
      Approach: drive the same dependency graph through all three readers so they share the same ordering guarantees
      (Req: Canonical metadata dependency projection works without extraction, Manifest specDependsOn used as primary source for dependencies)

## 5. Metadata validation

- [x] 5.1 Add canonical metadata consistency checks to `ValidateSpecs`
      `packages/core/src/application/use-cases/validate-specs.ts`: `_validateSpec()` and helpers — validate stale `contentHashes`, metadata-vs-persisted `dependsOn`, and extraction-vs-persisted mismatch
      Approach: run this pass after structural and cross-artifact validation by loading metadata plus semantic persisted dependencies from the repository
      (Req: Canonical metadata consistency validation, Staleness detection)

- [x] 5.2 Add validation tests for stale and mismatched metadata
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: validation scenarios — cover stale hashes, metadata projection drift, extraction mismatch, and omitted-extraction success
      Approach: create per-spec fixtures where metadata and persisted semantic state intentionally diverge
      (Req: Canonical metadata consistency validation)

## 6. Archive regression coverage

- [x] 6.1 Confirm archive still enforces persisted dependency sealing
      `packages/core/test/application/use-cases/archive-change.spec.ts`: archive metadata/spec-lock scenarios — verify persisted deps still feed metadata and mismatch still blocks archive before publication
      Approach: reuse existing archive fixtures and extend them where `GenerateSpecMetadata` now compares extracted and persisted dependency sets
      (Req: Deterministic generation at archive time, Persistent dependencies)

## 7. Final verification

- [x] 7.1 Run targeted core tests for repository, metadata generation, traversal, seeding, validation, and archive behavior
      `packages/core/test/...`: affected suites — confirm all new scenarios pass
      Approach: run the focused test files first to catch contract regressions before full-suite validation
      (Req: Testing)

- [x] 7.2 Run lint and required repo-level verification, then manually preview representative deltas
      repository root and `specd` CLI preview commands — verify no style/regression issues and inspect merged spec/verify output for key specs
      Approach: run repo-required lint/test commands plus `changes spec-preview` for `core:spec-repository-port`, `core:generate-metadata`, and `core:spec-metadata`
      (Req: Testing)

## 8. Review follow-up: metadata freshness contract

- [x] 8.1 Expand the repository metadata read contract to return freshness
      `packages/core/src/application/ports/spec-repository.ts`, `packages/core/src/infrastructure/fs/spec-repository.ts`: `SpecRepository.metadata()` / `FsSpecRepository.metadata()` — distinguish `missing` from `stale` and keep `spec-lock.json` out of the generic artifact surface
      Approach: return `null` only when `metadata.json` is absent; otherwise return parsed metadata plus `originalHash` and `freshness: 'fresh' | 'stale'`, with staleness classification owned by the repository adapter rather than implicit regeneration
      (Req: metadata returns parsed metadata or null, Staleness detection, Spec artifact access is limited to expected artifact files)

- [x] 8.2 Add repository tests for missing-versus-stale metadata reads
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: metadata read scenarios — assert absent metadata returns `null`, stale metadata stays readable, and sidecar exclusion still holds
      Approach: create persisted metadata fixtures with matching and mismatching `contentHashes`, then assert `freshness` and `originalHash` behavior through the filesystem adapter
      (Req: metadata returns parsed metadata or null, Stale metadata remains readable)

- [x] 8.3 Make context consumers inspect freshness explicitly instead of treating stale as missing
      `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`, `compile-context.ts`, `get-project-context.ts`, `get-spec-context.ts`: traversal and rendering flow — keep persisted metadata readable when stale, warn, and only fall back to extraction where the consumer requires fresh fields
      Approach: preserve source order `change.specDependsOn` → metadata projection → extraction fallback, emit `stale-metadata` warnings, and avoid collapsing stale persisted metadata into absent metadata
      (Req: Context spec collection, dependsOn resolution order, Supports dependsOn traversal when followDeps is true, Transitive dependency traversal, Use by CompileContext)

- [x] 8.4 Keep seed-only metadata fallback compatible with stale persisted metadata
      `packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts`, `create-change.ts`, `edit-change.ts`: change snapshot seeding — continue using metadata as the legacy fallback when semantic persisted dependency state is absent, even if the metadata file is stale
      Approach: preserve persisted-state-first seeding, ignore freshness only on this compatibility path, and document that `change.specDependsOn` remains a baseline snapshot rather than live metadata
      (Req: Initial specDependsOn seeding, Seed specDependsOn for added specs)

- [x] 8.5 Allow SaveSpecMetadata to use stale persisted metadata only for write protection
      `packages/core/src/application/use-cases/save-spec-metadata.ts`: `SaveSpecMetadata.execute()` — consume the richer metadata read result without changing archive authority or sidecar ownership
      Approach: keep using stale persisted metadata for `originalHash` capture and `dependsOn` overwrite protection, but never regenerate metadata there and never mutate `spec-lock.json`
      (Req: Conflict detection via originalHash, dependsOn overwrite protection, Sidecar ownership boundary)

## 9. Review follow-up: validation and regression coverage

- [x] 9.1 Turn repository stale classification into explicit validation failures
      `packages/core/src/application/use-cases/validate-specs.ts`: canonical metadata consistency pass — treat `freshness: 'stale'`, metadata-vs-persisted drift, and extraction-vs-persisted mismatch as failures
      Approach: use the repository-provided freshness state as the first validation gate, then compare canonical `metadata.json.dependsOn` and extraction output against `readPersistedDependsOn(spec)`
      (Req: Canonical metadata consistency validation, Staleness detection)

- [x] 9.2 Add use-case tests for stale-metadata consumer behavior and SaveSpecMetadata write protection
      `packages/core/test/application/use-cases/compile-context.spec.ts`, `get-project-context.spec.ts`, `get-spec-context.spec.ts`, `create-change.spec.ts`, `edit-change.spec.ts`, `save-spec-metadata.spec.ts`, `validate-specs.spec.ts`: new stale-metadata scenarios — cover readable stale metadata, explicit warnings, stale legacy fallback seeding, and stale overwrite protection
      Approach: reuse persisted-metadata fixtures across readers so the same missing/fresh/stale states are exercised consistently in traversal, seeding, save protection, and validation
      (Req: Stale metadata remains usable for dependency traversal with warning, Stale metadata still seeds as legacy fallback, Existing stale metadata hash is still captured for conflict detection, Existing stale dependsOn would still be changed)

- [x] 9.3 Re-run focused core verification and preview the refreshed merged specs
      repository root and `specd` CLI preview commands — confirm the follow-up contract is reflected in merged spec/verify output before returning to implementing
      Approach: run the targeted repository and use-case suites above, then preview at least `core:spec-repository-port`, `core:spec-metadata`, and `core:save-spec-metadata` merged artifacts
      (Req: Testing)
