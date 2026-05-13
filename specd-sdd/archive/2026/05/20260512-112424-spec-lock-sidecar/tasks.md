# Tasks: spec-lock-sidecar

## 1. Sidecar parsing and repository contract

- [x] 1.1 Add spec-lock parsing support
      `packages/core/src/domain/services/parse-spec-lock.ts`: `parseSpecLock`, `specLockSchema`, `SpecLockData` — define the canonical `spec-lock.json` shape and validation rules used by archive and seeding.
      Approach: mirror the existing metadata parsing pattern with a strict schema for `{ schema: { name, version }, dependsOn }` plus optional `originalHash` on read.
      (Req: spec-lock sidecar persistence)

- [x] 1.2 Extend the `SpecRepository` port with dedicated sidecar methods
      `packages/core/src/application/ports/spec-repository.ts`: `readSpecLock()`, `saveSpecLock()` — expose sidecar persistence as an explicit cross-storage contract.
      Approach: keep `spec-lock` out of the normal artifact API and give archive/create/edit a dedicated repository surface.
      (Req: Sidecar separation, spec-lock sidecar persistence)

- [x] 1.3 Implement sidecar reads and writes in `FsSpecRepository`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `readSpecLock()`, `saveSpecLock()` — persist the sidecar alongside canonical spec artifacts while preserving read-only and conflict semantics.
      Approach: reuse the existing spec directory resolution and hashing/conflict utilities, but do not widen `artifact()` / `save()` to accept arbitrary sidecar filenames.
      (Req: Sidecar separation, spec-lock sidecar persistence)

- [x] 1.4 Add fs coverage for explicit sidecar methods
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: new describe block — verify `readSpecLock()` returns `null` when absent, `saveSpecLock()` persists the file, conflict detection works, and the normal artifact API still rejects unexpected extra files.
      Approach: exercise the real fs adapter rather than mocks so confinement and repository-boundary semantics are covered.
      (Req: Sidecar separation, spec-lock sidecar persistence)

## 2. Seed persisted dependencies when specs enter a change

- [x] 2.1 Add shared persisted-dependency loader
      `packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts`: `loadPersistedSpecDependsOn()` — load the current baseline using `spec-lock.json -> metadata.json.dependsOn -> []`.
      Approach: keep the helper read-only, take `ReadonlyMap<string, SpecRepository>` plus `specId`, and reuse `readSpecLock()` plus `SpecRepository.metadata()`.
      (Req: Initial specDependsOn seeding, Seed specDependsOn for added specs)

- [x] 2.2 Seed `specDependsOn` during change creation
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChange.execute()` — build the initial `Change` with seeded dependency entries for existing specs.
      Approach: resolve seeding before `ChangeRepository.save()`, seed only specs that already exist, and leave brand-new specs without forced entries.
      (Req: Initial specDependsOn seeding, Manifest structure)

- [x] 2.3 Seed `specDependsOn` when editing change scope
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute()` — detect newly added spec IDs and seed them without overwriting existing in-change entries.
      Approach: compute the added subset inside the mutate flow, preserve prior `change.specDependsOn` state, and continue using `updateSpecIds()` for approval invalidation.
      (Req: Seed specDependsOn for added specs, Manifest structure)

- [x] 2.4 Fix composition wiring for create/edit
      `packages/core/src/composition/use-cases/create-change.ts`, `packages/core/src/composition/use-cases/edit-change.ts`, `packages/core/src/composition/kernel.ts`: create and pass real `specRepos` instead of `new Map()`.
      Approach: follow the archive/kernel repository-map pattern so application use cases stay port-driven and multi-workspace aware.
      (Req: Dependencies, Initial specDependsOn seeding, Seed specDependsOn for added specs)

- [x] 2.5 Add unit coverage for seeded manifests
      `packages/core/test/application/use-cases/create-change.spec.ts`, `packages/core/test/application/use-cases/edit-change.spec.ts`, `packages/core/test/infrastructure/fs/change-repository.spec.ts`: verify seeding from sidecar, metadata fallback, empty fallback, and manifest round-trip.
      Approach: keep create/edit tests focused on side effects in `change.specDependsOn`, and use fs repository tests to prove serialization stability.
      (Req: Initial specDependsOn seeding, Seed specDependsOn for added specs, Manifest structure)

## 3. Archive-time sidecar and metadata reconciliation

- [x] 3.1 Implement archive-side dependency reconciliation
      `packages/core/src/application/use-cases/archive-change.ts`: sidecar loading, final dependency resolution, mismatch checks, and sidecar persistence.
      Approach: keep sidecar logic private to archive, use explicit `SpecRepository.readSpecLock()` / `saveSpecLock()`, preserve original `schema` while replacing `dependsOn` on re-archive, and treat first-time sidecar creation as the same persisted-state sealing point for mismatch enforcement.
      (Req: spec-lock sidecar persistence, Opportunistic sidecar backfill)

- [x] 3.2 Require actor identity for archive
      `packages/core/src/application/use-cases/archive-change.ts` and related tests: fail archive when `ActorResolver.identity()` cannot provide an actor.
      Approach: resolve actor before final archive persistence and remove the anonymous fallback path from archive-time behavior.
      (Req: Archive repository call)

- [x] 3.3 Implement per-spec staged publication semantics
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/src/infrastructure/fs/spec-repository.ts`, and any needed helper: publish each spec atomically from staging when possible and preserve staging on publication failure.
      Approach: prepare outputs first, stage merged spec artifacts plus `spec-lock.json` as one publication unit, swap per spec, avoid partial canonical writes for the affected spec, and surface manual-recovery guidance instead of cleaning staging eagerly.
      (Req: Staged archive commit and failed-attempt visibility)

- [x] 3.4 Validate persisted dependencies before publication and refresh metadata after publication
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` — before permanent spec writes, derive final persisted `dependsOn`, compare extracted values from prepared merged content, and stage `spec-lock.json`; after publication, regenerate and write `metadata.json`.
      Approach: keep `GenerateSpecMetadata` deterministic and post-publication, use `extractMetadata(...)` for the pre-publication consistency check, fail archive whenever archive is sealing persisted dependency state and extracted `dependsOn` disagrees, and continue reporting non-consistency metadata failures through `staleMetadataSpecPaths`.
      (Req: Spec metadata generation, spec-lock sidecar persistence)

- [x] 3.5 Add opportunistic backfill gate
      `packages/core/src/application/use-cases/archive-change.ts` and any needed shared validation helper — only create a first sidecar when the canonical spec is structurally compatible with the current schema.
      Approach: reuse existing validation semantics where possible, skip implicit sidecar creation for incompatible legacy specs, and keep migration command work out of scope.
      (Req: Opportunistic sidecar backfill)

- [x] 3.6 Preserve validation and metadata ownership boundaries
      `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/core/src/application/use-cases/save-spec-metadata.ts`, `packages/core/src/application/use-cases/generate-spec-metadata.ts`: keep `ValidateArtifacts` as the in-progress updater and `SaveSpecMetadata` as metadata-only persistence.
      Approach: minimize production changes; prefer targeted assertions and helper extraction over rewriting existing hot-path algorithms.
      (Req: In-change dependsOn persistence, Sidecar ownership boundary, Deterministic generation at archive time)

- [x] 3.7 Add archive and validation regression coverage
      `packages/core/test/application/use-cases/archive-change.spec.ts`, `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`, `packages/core/test/application/use-cases/save-spec-metadata.spec.ts`, `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: cover actor-required archive, first-write sidecar, re-archive refresh, mismatch failure, omitted extraction fallback, legacy extraction fallback, opportunistic backfill, and per-spec staged publication failure handling.
      Approach: map each new verify scenario to a dedicated test case and keep archive assertions around pre-publication mismatch enforcement, staged sidecar publication, post-publication metadata writes, and both metadata and sidecar outputs.
      (Req: Archive repository call, Staged archive commit and failed-attempt visibility, Spec metadata generation, spec-lock sidecar persistence, Opportunistic sidecar backfill, In-change dependsOn persistence, Sidecar ownership boundary)

## 4. Docs and verification follow-through

- [x] 4.1 Normalize metadata documentation
      `docs/guide/_sections/getting-started/spec-metadata.md`: user-facing docs — document `metadata.json` terminology consistently and explain `spec-lock.json` as the durable archive authority once present.
      Approach: keep the docs delta narrow; only update text that is inaccurate after sidecar introduction and the JSON normalization.
      (Req: Sidecar separation, Deterministic generation at archive time)

- [x] 4.2 Run end-to-end verification of seeded scope and archive outputs
      `packages/core/test/...` plus manual CLI flow — confirm a change seeds `specDependsOn`, validation updates it, archive writes aligned `metadata.json` and `spec-lock.json`, actor resolution is required, and publication failure preserves staging.
      Approach: use the manual/E2E sequence from `design.md` after automated tests pass so the final workflow is verified at the same lifecycle boundaries the feature changes.
      (Req: Manifest structure, Archive repository call, Staged archive commit and failed-attempt visibility, In-change dependsOn persistence, Spec metadata generation, spec-lock sidecar persistence, Opportunistic sidecar backfill)
