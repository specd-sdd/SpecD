# Tasks: persist-spec-context-optimizations

## 1. Domain shapes

- [x] 1.1 Extend spec-lock domain schema with optimizations
      `packages/core/src/domain/services/parse-spec-lock.ts`: `SpecLockData`, `specLockSchema` — add optional `optimizations: PersistedSpecOptimizations` field, keep `schema`/`dependsOn`/`implementation`/`originalHash` backward compatible
      Approach: extend the Zod schema with an optional `optimizations` key parsed via the new `PersistedSpecOptimizations` schema; verify old locks without the field still parse to `optimizations: undefined`.
      (Req: core:spec-lock)
- [x] 1.2 Add persisted optimization domain types and schemas
      `packages/core/src/domain/services/parse-spec-lock.ts` (or new `packages/core/src/domain/services/spec-optimization.ts`): `PersistedArtifactStateEntry`, `PersistedArtifactState`, `PersistedSchemaIdentity`, `PersistedOptimizationField`, `PersistedSpecOptimizations` — define types plus their Zod schemas
      Approach: co-locate with `parse-spec-lock.ts` or a new imported module; enforce via construction helpers that an empty `optimizations` object is never persisted and that `artifactState` entries are ordered filename-ascending before serialization.
      (Req: core:spec-optimization)
- [x] 1.3 Remove adapter-owned unknown-schema fallback from domain parsing
      `packages/core/src/domain/services/parse-spec-lock.ts`: schema parsing — remove the `{ schema: { name: 'unknown', version: 0 } }` fallback wherever it leaks into parsed output
      Approach: make `schema` parsing return `undefined`/fail loudly rather than synthesizing a placeholder identity; downstream initialization becomes responsible for schema resolution.
      (Req: core:spec-lock)
- [x] 1.4 Add metadata provenance fields to SpecMetadata
      `packages/core/src/domain/services/parse-metadata.ts`: `SpecMetadata` — add `SpecMetadataProvenance` (`artifacts`, `persistedStateHash`, `schema`, `projectionVersion`, `projectionFingerprint`), remove the ad hoc `PersistedSpecMetadata` type
      Approach: keep `generatedBy: 'agent'` leniently readable for legacy parsing only, never emitted by writers; remove `originalHash`/`freshness` from `SpecMetadata` itself since they move to the port-level `MetadataSnapshot` wrapper (phase 2).
      (Req: core:spec-metadata)
- [x] 1.5 Demote metadata-owned optimization fields to read-through projections
      `packages/core/src/domain/services/parse-metadata.ts`: `optimizedDescription`, `optimizedContext` — keep as optional projection fields, not metadata-owned authoritative state
      Approach: type them as projections included only when fresh; the values themselves are computed by `MaterializeSpecMetadata`, never written directly by parsing.
      (Req: core:spec-metadata)
- [x] 1.6 Add pure applyPersistedSpecStatePatch domain service
      `packages/core/src/domain/services/apply-persisted-spec-state-patch.ts`: `applyPersistedSpecStatePatch()`, `PersistedSpecStateBase`, `PersistedSpecStatePatch`, `PersistedSpecState`, `PersistedSpecStateSnapshot`
      Approach: implement the `existing`/`initial` base union exactly as specified — reject schema replacement on an existing base, default `implementation` to `[]` and omit `optimizations` for an initial base, normalize optimization artifact-state ordering, strip an empty `optimizations` object; never perform I/O.
      (Req: core:spec-lock)
- [x] 1.7 Add PersistedSpecStateSchemaReplacementError
      `packages/core/src/domain/errors/persisted-spec-state-schema-replacement-error.ts`: `PersistedSpecStateSchemaReplacementError` — new `SpecdError` subclass thrown by `applyPersistedSpecStatePatch()` on illegal schema replacement
      Approach: follow the existing `code` getter convention used by `ArtifactConflictError`; message references `UpdatePersistedSpecSchema` as the correct path.
      (Req: core:spec-lock)
- [x] 1.8 Add pure assessMetadataFreshness domain service
      `packages/core/src/domain/services/assess-metadata-freshness.ts`: `assessMetadataFreshness()`, `MetadataFreshnessAssessment`, `SpecMetadataSourceState`
      Approach: compare persisted `SpecMetadata.provenance` against current `SpecMetadataSourceState` on exact artifact filename set/hashes, persisted-state hash (including null vs null), schema identity, projection version, and projection fingerprint; never compare `lastModified`; never perform I/O.
      (Req: core:spec-metadata)
- [x] 1.9 Add shared per-field optimization freshness classifier
      `packages/core/src/domain/services/spec-optimization-freshness.ts`: per-field freshness classification (`artifact-added` / `artifact-removed` / `artifact-changed` / `schema-changed` / `missing`)
      Approach: implement as the single shared pure function consumed by both `GetPersistedSpecOptimizations` and `MaterializeSpecMetadata` so the two paths never drift; equal hash with unequal `lastModified` must never count as a change.
      (Req: core:spec-optimization)
- [x] 1.10 Add remaining new domain errors
      `packages/core/src/domain/errors/spec-already-initialized-error.ts`, `spec-not-initialized-error.ts`, `persisted-schema-dependency-conflict-error.ts`, `implementation-file-not-found-error.ts`, `implementation-workspace-boundary-error.ts`: new `SpecdError` subclasses
      Approach: match the exact `code` getters and constructor messages specified in design (`SPEC_ALREADY_INITIALIZED`, `SPEC_NOT_INITIALIZED`, `PERSISTED_SCHEMA_DEPENDENCY_CONFLICT`, `IMPLEMENTATION_FILE_NOT_FOUND`, `IMPLEMENTATION_WORKSPACE_BOUNDARY`); add `SpecMetadataParseError` under `packages/core/src/domain/errors/` if it does not already exist.
      (Req: core:spec-optimization)
- [x] 1.11 Add domain unit tests for new pure functions
      `packages/core/test/domain/services/spec-optimization.spec.ts`, `apply-persisted-spec-state-patch.spec.ts`, `assess-metadata-freshness.spec.ts`, `spec-optimization-freshness.spec.ts`, and extended `parse-spec-lock.spec.ts`/`parse-metadata.spec.ts`
      Approach: exhaustively cover the pure functions first, since every later phase depends on their exact behavior — old locks without `optimizations`, empty-object stripping, filename-ascending ordering, schema-replacement rejection, and each freshness reason in isolation and combination.
      (Req: core:spec-optimization)

## 2. Repository port and FS adapter

- [x] 2.1 Add new abstract SpecRepository port methods
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` — add abstract `readPersistedState`, `writePersistedState`, `artifactMeta`, `readMetadataSnapshot`, `writeMetadataSnapshot`
      Approach: define `ArtifactMeta` and the `MetadataSnapshot` (`missing`/`invalid`/`present`) discriminated union in this file; document the `expectedRevision: null` creation-guard contract shared by both write methods.
      (Req: core:spec-repository-port)
- [x] 2.2 Remove superseded SpecRepository port methods
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` — remove `metadata`, `saveMetadata`, `readPersistedSchema`, `readPersistedDependsOn`, `readPersistedImplementation`, `updatePersistedSchema`, `updatePersistedDependsOn`, `updatePersistedImplementation`
      Approach: fold the three read/write triads into the new aggregate `readPersistedState`/`writePersistedState` pair; keep `persistedStateHash()` unchanged as a hash-only convenience.
      (Req: core:spec-repository-port)
- [x] 2.3 Update SpecPublication shape
      `packages/core/src/application/ports/spec-repository.ts`: `SpecPublication` — replace optional `persistedSchema`/`persistedDependsOn`/`persistedImplementation` with one required `persistedState: PersistedSpecState`
      Approach: ensure publishing can never drop optimizations or a future persisted-state addition by requiring one complete value at the type level.
      (Req: core:spec-repository-port)
- [x] 2.4 Rename PersistedImplementationLink at the port boundary
      `packages/core/src/application/ports/spec-repository.ts`: `PersistedImplementationLink` — introduce the port-level alias for the existing `SpecLockImplementationEntry` shape
      Approach: rename only at the port/application boundary for symmetry with `PersistedSpecOptimizations`/`PersistedSchemaIdentity`; the on-disk `spec-lock.json` field name and structure are unchanged.
      (Req: core:spec-repository-port)
- [x] 2.5 Delete SpecListEntry.metadataStatus and SpecListOptions.includeMetadataStatus
      `packages/core/src/application/ports/spec-repository.ts` (or wherever `SpecListEntry`/`SpecListOptions` are declared): `SpecListEntry.metadataStatus`, `SpecListOptions.includeMetadataStatus` — delete both
      Approach: public metadata freshness status is no longer projectable; remove alongside the other port changes so nothing type-checks against the deleted fields.
      (Req: core:list-specs)
- [x] 2.6 Implement readPersistedState/writePersistedState in FsSpecRepository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository.readPersistedState`, `FsSpecRepository.writePersistedState` — implement against `spec-lock.json`
      Approach: reuse one canonical serializer/writer shared with staged `publish()`; enforce the `expectedRevision: null` creation guard and raise `ArtifactConflictError` on revision mismatch; remove the `{ name: 'unknown', version: 0 }` fallback.
      (Req: core:fs-spec-repository)
- [x] 2.7 Implement artifactMeta in FsSpecRepository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository.artifactMeta` — return `{ hash, lastModified }` or `null`
      Approach: reuse the existing artifact stat/hash path that already populates `SpecArtifact.originalHash`; do not introduce a second hashing implementation.
      (Req: core:fs-spec-repository)
- [x] 2.8 Implement readMetadataSnapshot/writeMetadataSnapshot in FsSpecRepository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository.readMetadataSnapshot`, `FsSpecRepository.writeMetadataSnapshot` — implement against `.specd/metadata/<spec>.json` (or the configured `metadataPath`)
      Approach: use raw-byte SHA-256 of stable canonical JSON as `revision`; stop applying the read-only source-ownership guard to metadata cache writes, since metadata is cache state, not canonical source, even in a `readOnly` workspace.
      (Req: core:fs-spec-repository)
- [x] 2.9 Wire extended FsSpecRepository through composition
      `packages/core/src/composition/spec-repository.ts` (`createFsSpecStorageFactory`): constructor wiring — pass the same underlying hashing/stat/index helpers into the extended `FsSpecRepository` constructor
      Approach: introduce no new adapter-level dependencies; confirm the factory still satisfies the full `SpecRepository` abstract surface.
      (Req: core:fs-spec-repository)
- [x] 2.10 Update every test double implementing SpecRepository
      Test fixtures and in-memory `SpecRepository` implementations across `packages/core/test/**` (and any cross-package fixtures) — implement the five new abstract members, remove the eight deleted ones
      Approach: treat every stale implementer as a compile error and fix it in this same phase, so no later consumer phase begins against a broken test double.
      (Req: core:spec-repository-port)
- [x] 2.11 Extend FS repository tests for persisted state and metadata snapshot
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: test suite — extend for `readPersistedState`/`writePersistedState`, `artifactMeta`, and `readMetadataSnapshot`/`writeMetadataSnapshot`
      Approach: cover creation race via `expectedRevision: null`, revision-mismatch conflict, old-lock-without-optimizations parsing, a no-duplicate-hashing assertion (shared spy/count), and a `readOnly` workspace permitting metadata writes while rejecting artifact/lock writes.
      (Req: core:fs-spec-repository)

## 3. Generation and materialization

- [x] 3.1 Update GenerateSpecMetadata to read through readPersistedState
      `packages/core/src/application/use-cases/generate-spec-metadata.ts` (`GenerateSpecMetadata`): `execute()` — stop importing `readPersistedDependsOn`/`readPersistedImplementation` directly, switch to `SpecRepository.readPersistedState`
      Approach: replace the three separate persisted reads with one aggregate `readPersistedState` call.
      (Req: core:generate-metadata)
- [x] 3.2 Include only fresh lock-owned optimizations and return exact source state
      `packages/core/src/application/use-cases/generate-spec-metadata.ts` (`GenerateSpecMetadata`): return shape — include only fresh lock-owned `optimizations`, derive lock-less dependencies from current artifacts, return the exact source state used (artifact hashes, lock `originalHash`, schema identity) for materializer reuse
      Approach: apply the shared per-field freshness classifier from `spec-optimization-freshness.ts` before including any optimization value; never persist as a side effect of generation.
      (Req: core:generate-metadata)
- [x] 3.3 Add resolveInitialPersistedDependsOn shared service
      `packages/core/src/application/use-cases/resolve-initial-persisted-depends-on.ts`: `resolveInitialPersistedDependsOn()`
      Approach: explicit `explicitDependsOn` wins unconditionally; otherwise reuse `GenerateSpecMetadata`'s projection logic and `extractMetadataFromSpecArtifacts` directly against current canonical artifacts (no intermediate metadata cache write); fall back to `[]` when the schema cannot extract dependencies; never read a persisted metadata snapshot.
      (Req: core:initialize-persisted-spec-state)
- [x] 3.4 Add internal PersistSpecMetadata use case
      `packages/core/src/application/use-cases/persist-spec-metadata.ts`: `PersistSpecMetadata` — validate the generated projection then delegate the conditional write to `SpecRepository.writeMetadataSnapshot()`
      Approach: never read current artifact or lock state; trust the caller-supplied projection and revision; throw `SpecMetadataValidationError` before attempting any repository write, or surface `ArtifactConflictError` on revision mismatch; deliberately exclude this class from `public.ts`, the SDK, `Kernel`, and any CLI/MCP wiring.
      (Req: core:persist-spec-metadata)
- [x] 3.5 Add MaterializeSpecMetadata use case
      `packages/core/src/application/use-cases/materialize-spec-metadata.ts`: `MaterializeSpecMetadata` — the shared reuse-or-regenerate orchestration for `if-needed`/`force` policy
      Approach: on `if-needed`, read via `readMetadataSnapshot` + `assessMetadataFreshness`, regenerate through `GenerateSpecMetadata` and persist through `PersistSpecMetadata` only when stale, swallowing a cache-write failure into a `SpecMetadataGenerationWarning`; on `force`, always regenerate and treat a cache-write failure as a command failure.
      (Req: core:materialize-spec-metadata)
- [x] 3.6 Add GetSpecMetadata use case
      `packages/core/src/application/use-cases/get-spec-metadata.ts`: `GetSpecMetadata` — thin delegator to `MaterializeSpecMetadata` with `policy: 'if-needed'`
      Approach: `GetSpecMetadataResult` is exactly `MaterializeSpecMetadataResult`, never narrowed.
      (Req: core:get-spec-metadata)
- [x] 3.7 Add RegenerateSpecMetadata use case
      `packages/core/src/application/use-cases/regenerate-spec-metadata.ts`: `RegenerateSpecMetadata` — single-spec and batch forced rebuild via `MaterializeSpecMetadata` with `policy: 'force'`
      Approach: discover batch targets via `ListWorkspaces` + raw `SpecRepository.list()`, never `ListSpecs`, to avoid a use-case cycle through `MaterializeSpecMetadata`.
      (Req: core:regenerate-spec-metadata)
- [x] 3.8 Add composition modules for the four new use cases
      `packages/core/src/composition/use-cases/materialize-spec-metadata.ts`, `get-spec-metadata.ts`, `regenerate-spec-metadata.ts`: `resolveXDeps(resolver)` / `createX(deps)` / `createX(config, options?)`
      Approach: follow the existing pattern in `packages/core/src/composition/use-cases/generate-spec-metadata.ts`; have `MaterializeSpecMetadata`'s composition module construct `PersistSpecMetadata` internally, not as part of the public `Deps` shape.
      (Req: core:materialize-spec-metadata)
- [x] 3.9 Wire the four new use cases into Kernel, public.ts, and SDK
      `packages/core/src/composition/kernel.ts`, `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts`: `Kernel.specs.materializeMetadata`/`getMetadata`/`regenerateMetadata` — add construction and exports
      Approach: add the three new imports/constructions to `createKernel()` and the matching class/`Input`/`Result`/`Deps`/`create*` exports to `public.ts` and `core-reexports.ts`.
      (Req: core:kernel)
- [x] 3.10 Extend GenerateSpecMetadata tests for the new return shape
      `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`: test suite — extend before any dependent migrates to consume it
      Approach: cover only-fresh-optimizations inclusion, lock-less dependency derivation from current artifacts, and the exact source state returned for materializer reuse (no double-hashing).
      (Req: core:generate-metadata)
- [x] 3.11 Add tests for MaterializeSpecMetadata, PersistSpecMetadata, GetSpecMetadata, RegenerateSpecMetadata
      `packages/core/test/application/use-cases/materialize-spec-metadata.spec.ts`, `persist-spec-metadata.spec.ts`, `get-spec-metadata.spec.ts`, `regenerate-spec-metadata.spec.ts`
      Approach: cover the `if-needed` vs `force` warning/failure asymmetry, concurrent materializers racing on the same spec, deleted/malformed metadata caches, and batch discovery via `ListWorkspaces` + raw listing rather than `ListSpecs`.
      (Req: core:materialize-spec-metadata)
- [x] 3.12 Add composition tests for the new use-case modules
      `packages/core/test/composition/use-cases/materialize-spec-metadata.spec.ts`, `get-spec-metadata.spec.ts`, `regenerate-spec-metadata.spec.ts`
      Approach: verify both `createX(deps)` and `createX(config, options?)` forms produce equivalent wiring, per the existing `archive-change.spec.ts` composition-test pattern in that directory.
      (Req: core:materialize-spec-metadata)

## 4. Initialization and persisted-state mutations

- [x] 4.1 Add InitializePersistedSpecState use case
      `packages/core/src/application/use-cases/initialize-persisted-spec-state.ts`: `InitializePersistedSpecState`
      Approach: per-target algorithm — resolve schema once, discover raw spec identity without materializing metadata, `readPersistedState`, reject with `SpecAlreadyInitializedError` if state exists, parse schema-declared canonical artifacts, call `resolveInitialPersistedDependsOn()`, build via `applyPersistedSpecStatePatch({ kind: 'initial', schema, dependsOn }, {})`, then `writePersistedState(spec, state, { expectedRevision: null })`; support single-spec and `all`/batch targets identically.
      (Req: core:initialize-persisted-spec-state)
- [x] 4.2 Extract shared mutation helper from UpdateSpecDeps
      `packages/core/src/application/use-cases/update-spec-deps.ts` (`UpdateSpecDeps`): add/remove/set mutation semantics — extract into a reusable pure helper
      Approach: keep `UpdateSpecDeps`'s own behavior (mutating a change's draft `specDependsOn`) unchanged; the extracted helper becomes the shared implementation reused by `UpdatePersistedSpecDeps`.
      (Req: core:update-spec-deps)
- [x] 4.3 Add GetPersistedSpecDeps / UpdatePersistedSpecDeps use cases
      `packages/core/src/application/use-cases/get-persisted-spec-deps.ts`, `update-persisted-spec-deps.ts`: `GetPersistedSpecDeps`, `UpdatePersistedSpecDeps`
      Approach: reuse the extracted `UpdateSpecDeps` mutation helper; enforce `set`/`clear` mutual exclusivity with `add`/`remove`, apply `remove` before `add`, make `add` idempotent; create missing persisted state via an explicit list for `set`/`clear` or via `resolveInitialPersistedDependsOn()` for a non-empty `add`; leave `remove`/empty-net `add` against missing state as no-ops (`created: false`, no write).
      (Req: core:update-persisted-spec-deps)
- [x] 4.4 Extract shared mutation helper from UpdateImplementationTracking
      `packages/core/src/application/use-cases/update-implementation-tracking.ts` (`UpdateImplementationTracking`): add/enrich/remove link semantics — extract into a reusable pure helper
      Approach: keep `UpdateImplementationTracking`'s own behavior unchanged; the extracted helper becomes the shared implementation reused by `UpdatePersistedSpecImplementation`.
      (Req: core:update-implementation-tracking)
- [x] 4.5 Add GetPersistedSpecImplementation / UpdatePersistedSpecImplementation use cases
      `packages/core/src/application/use-cases/get-persisted-spec-implementation.ts`, `update-persisted-spec-implementation.ts`: `GetPersistedSpecImplementation`, `UpdatePersistedSpecImplementation`
      Approach: `action: 'add'` requires the target file to exist under the workspace `codeRoot`, normalizes it to canonical `workspace:path`, and merges `symbols` additively; `action: 'remove'` with `symbols` removes only those names, without `symbols` removes the whole entry; throw `ImplementationFileNotFoundError`/`ImplementationWorkspaceBoundaryError` as specified; create missing state via `resolveInitialPersistedDependsOn()` on add, no-op on remove against missing state.
      (Req: core:update-persisted-spec-implementation)
- [x] 4.6 Add GetPersistedSpecOptimizations / UpdatePersistedSpecOptimizations use cases
      `packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts`, `update-persisted-spec-optimizations.ts`: `GetPersistedSpecOptimizations`, `UpdatePersistedSpecOptimizations`
      Approach: classify per-field freshness via the shared `spec-optimization-freshness.ts` classifier; `set` captures a fresh baseline via `SpecRepository.artifactMeta()` per canonical filename (sorted), only for fields present in the call; clearing the last remaining field omits `optimizations` entirely; never validate `llmOptimizedContext` — that gate belongs to the calling skill/agent template.
      (Req: core:update-persisted-spec-optimizations)
- [x] 4.7 Add GetPersistedSpecSchema / UpdatePersistedSpecSchema use cases
      `packages/core/src/application/use-cases/get-persisted-spec-schema.ts`, `update-persisted-spec-schema.ts`: `GetPersistedSpecSchema`, `UpdatePersistedSpecSchema`
      Approach: `GetPersistedSpecSchema` throws `SpecNotInitializedError` when no persisted state exists; `UpdatePersistedSpecSchema` never creates a lock, has no effective-project-schema fallback, treats reassignment to the already-persisted schema as a no-op, preserves `implementation`/`optimizations` verbatim, throws `PersistedSchemaDependencyConflictError` on extraction disagreement, and constructs the resulting `PersistedSpecState` directly (bypassing `applyPersistedSpecStatePatch()`'s schema-replacement rejection) as the sole authorized schema-reassignment path.
      (Req: core:update-persisted-spec-schema)
- [x] 4.8 Add composition modules for all eight new use cases
      `packages/core/src/composition/use-cases/initialize-persisted-spec-state.ts`, `get-persisted-spec-deps.ts`, `update-persisted-spec-deps.ts`, `get-persisted-spec-implementation.ts`, `update-persisted-spec-implementation.ts`, `get-persisted-spec-optimizations.ts`, `update-persisted-spec-optimizations.ts`, `get-persisted-spec-schema.ts`, `update-persisted-spec-schema.ts`: `resolveXDeps(resolver)` / `createX(deps)` / `createX(config, options?)`
      Approach: follow the existing composition pattern for every module; the deps/implementation/optimizations mutation modules each depend on `InitializePersistedSpecState`'s `resolveInitialPersistedDependsOn` collaborator for incidental first-lock creation.
      (Req: core:initialize-persisted-spec-state)
- [x] 4.9 Wire the eight new use cases into Kernel, public.ts, and SDK
      `packages/core/src/composition/kernel.ts`, `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts`: `Kernel.specs.initializePersistedState`/`getPersistedDeps`/`updatePersistedDeps`/`getPersistedImplementation`/`updatePersistedImplementation`/`getPersistedOptimizations`/`updatePersistedOptimizations`/`getPersistedSchema`/`updatePersistedSchema`
      Approach: add the corresponding imports/constructions to `createKernel()` and the matching public exports, keeping `KernelBuilder.build()` delegating to `createKernel()` rather than maintaining a parallel use-case list.
      (Req: core:kernel)
- [x] 4.10 Add tests for InitializePersistedSpecState
      `packages/core/test/application/use-cases/initialize-persisted-spec-state.spec.ts`
      Approach: cover single-spec and batch targets, `SpecAlreadyInitializedError`, `SpecNotFoundError`, `ReadOnlyWorkspaceError`, schemas whose artifacts cannot express dependencies, and `existingSkipped` counting on a repeated `--all` run.
      (Req: core:initialize-persisted-spec-state)
- [x] 4.11 Add tests for persisted deps/implementation/optimizations/schema use cases
      `packages/core/test/application/use-cases/get-persisted-spec-deps.spec.ts`, `update-persisted-spec-deps.spec.ts`, `get-persisted-spec-implementation.spec.ts`, `update-persisted-spec-implementation.spec.ts`, `get-persisted-spec-optimizations.spec.ts`, `update-persisted-spec-optimizations.spec.ts`, `get-persisted-spec-schema.spec.ts`, `update-persisted-spec-schema.spec.ts`
      Approach: cover mutation-rule validation errors, incidental first-lock creation, concurrent-write `ArtifactConflictError`, `ReadOnlyWorkspaceError`, per-field freshness reasons, and schema reassignment both compatible and conflicting.
      (Req: core:update-persisted-spec-optimizations)
- [x] 4.12 Add composition tests for the eight new use-case modules
      `packages/core/test/composition/use-cases/initialize-persisted-spec-state.spec.ts`, `get-persisted-spec-deps.spec.ts`, `update-persisted-spec-deps.spec.ts`, `get-persisted-spec-implementation.spec.ts`, `update-persisted-spec-implementation.spec.ts`, `get-persisted-spec-optimizations.spec.ts`, `update-persisted-spec-optimizations.spec.ts`, `get-persisted-spec-schema.spec.ts`, `update-persisted-spec-schema.spec.ts`
      Approach: verify both `createX(deps)` and `createX(config, options?)` forms produce equivalent wiring for each module.
      (Req: core:initialize-persisted-spec-state)

## 5. Archive and consumers

- [x] 5.1 Update ArchiveChange to build persistedState via the shared patch helper
      `packages/core/src/application/use-cases/archive-change.ts` (`ArchiveChange`): persisted-state construction — read one aggregate `readPersistedState` snapshot, compute `PersistedSpecState` via `applyPersistedSpecStatePatch()`, using `resolveInitialPersistedDependsOn()` when no lock exists yet (honoring an explicit dependency value from the publication plan when present)
      Approach: pass the computed value through `SpecPublication.persistedState`; guard the observed persisted-state revision so a rolled-back archive never leaves a torn state.
      (Req: core:archive-change)
- [x] 5.2 Force-materialize metadata after archive commit
      `packages/core/src/application/use-cases/archive-change.ts` (`ArchiveChange`): post-commit step — call `MaterializeSpecMetadata` with `policy: 'force'` after artifacts and lock are committed
      Approach: sequence the force-materialization strictly after the atomic per-spec publication succeeds, never before.
      (Req: core:archive-change)
- [x] 5.3 Update ValidateSpecs to materialize before validating
      `packages/core/src/application/use-cases/validate-specs.ts` (`ValidateSpecs`): metadata acquisition — materialize via `MaterializeSpecMetadata`/`GetSpecMetadata` before validating the normalized projection
      Approach: keep an independent validation failure for stale persisted optimizations distinct from a materialization failure; do not change `ValidateSpecs`'s existing control flow beyond this integration point.
      (Req: core:validate-specs)
- [x] 5.4 Update CompileContext to obtain metadata through materialization
      `packages/core/src/application/use-cases/compile-context.ts` (`CompileContext`): metadata acquisition — replace the raw repository read with materialization
      Approach: minimal integration point only — one materialization call in place of the existing raw read; leave the rest of the aggregation flow untouched.
      (Req: core:compile-context)
- [x] 5.5 Update GetSpecContext for self-healing metadata and stale diagnostics
      `packages/core/src/application/use-cases/get-spec-context.ts` (`GetSpecContext`): metadata acquisition — self-healing metadata plus stale/missing optimization diagnostics
      Approach: surface `MaterializeSpecMetadataResult.warnings`/freshness information as user-facing diagnostics rather than swallowing them.
      (Req: core:get-spec-context)
- [x] 5.6 Update GetProjectContext to self-heal and fix the project-metadata dependency
      `packages/core/src/application/use-cases/get-project-context.ts` (`GetProjectContext`): metadata acquisition — self-heal required spec metadata during project-wide compilation; correct the malformed `core:core/project-metadata` dependency to `core:project-metadata`
      Approach: aggregate last, after leaf consumers, per the design's dependency-ordered rollout.
      (Req: core:get-project-context)
- [x] 5.7 Update ListSpecs and remove the metadataStatus projection
      `packages/core/src/application/use-cases/list-specs.ts` (`ListSpecs`): normalized titles/summaries — materialize metadata needed for listing; delete `metadataStatus` projection/filtering entirely
      Approach: remove all `SpecListEntry.metadataStatus`/`SpecListOptions.includeMetadataStatus` call-site logic, matching the port-level deletion from phase 2.
      (Req: core:list-specs)
- [x] 5.8 Update SearchSpecs to obtain normalized fields through materialization
      `packages/core/src/application/use-cases/search-specs.ts` (`SearchSpecs`): normalized fields — replace the raw repository cache read with materialization
      Approach: minimal integration point, consistent with `CompileContext`'s change.
      (Req: core:search-specs)
- [x] 5.9 Update GetProjectMetadata/UpdateProjectMetadata to use metadataFingerprint
      `packages/core/src/application/use-cases/get-project-metadata.ts`, `update-project-metadata.ts`: spec input derivation — use `metadataFingerprint` from materialized metadata rather than cache files or repository revisions
      Approach: derive fingerprints through `MaterializeSpecMetadata`/`GetSpecMetadata` instead of reading the on-disk cache directly.
      (Req: core:project-metadata)
- [x] 5.10 Extend ArchiveChange tests for persisted-state and force materialization
      `packages/core/test/application/use-cases/archive-change.spec.ts`, `archive-change-batch-restore.spec.ts`
      Approach: extend for `SpecPublication.persistedState` construction via the shared patch helper, the revision guard preventing overwrite of concurrent lock changes, forced materialization after commit, and optimization preservation across archive.
      (Req: core:archive-change)
- [x] 5.11 Extend ValidateSpecs and CompileContext tests
      `packages/core/test/application/use-cases/validate-specs.spec.ts`, `compile-context.spec.ts` (or equivalents)
      Approach: cover materialization-based metadata acquisition and independent stale-optimization validation failure.
      (Req: core:validate-specs)
- [x] 5.12 Extend GetSpecContext/GetProjectContext/ListSpecs/SearchSpecs/project-metadata tests
      `packages/core/test/application/use-cases/get-spec-context.spec.ts`, `get-project-context.spec.ts`, `list-specs.spec.ts`, `search-specs.spec.ts`, `get-project-metadata.spec.ts`, `update-project-metadata.spec.ts`
      Approach: cover self-healing behavior, removal of `metadataStatus`, and `metadataFingerprint`-based project-metadata input derivation.
      (Req: core:list-specs)

## 6. Remove legacy metadata editors

- [x] 6.1 Delete SaveSpecMetadata application and composition
      `packages/core/src/application/use-cases/save-spec-metadata.ts`, `packages/core/src/composition/use-cases/save-spec-metadata.ts`: `SaveSpecMetadata` — delete outright
      Approach: run this phase after phase 3 so nothing transiently depends on the deleted class during the transition; responsibility has already moved to internal `PersistSpecMetadata`.
      (Req: core:save-spec-metadata)
- [x] 6.2 Delete UpdateSpecMetadata application and composition
      `packages/core/src/application/use-cases/update-spec-metadata.ts`, `packages/core/src/composition/use-cases/update-spec-metadata.ts`: `UpdateSpecMetadata` — delete outright
      Approach: no compatibility alias, deprecation warning, or feature flag; this is a breaking public API removal called out in release notes.
      (Req: core:update-spec-metadata)
- [x] 6.3 Delete InvalidateSpecMetadata application and composition
      `packages/core/src/application/use-cases/invalidate-spec-metadata.ts`, `packages/core/src/composition/use-cases/invalidate-spec-metadata.ts`: `InvalidateSpecMetadata` — delete outright
      Approach: explicit invalidation is replaced by fingerprint-derived freshness; no compatibility alias.
      (Req: core:invalidate-spec-metadata)
- [x] 6.4 Remove the three editors from Kernel
      `packages/core/src/composition/kernel.ts`: `Kernel.specs.saveMetadata`, `Kernel.specs.updateMetadata`, `Kernel.specs.invalidateMetadata` — remove construction and exposure
      Approach: delete the corresponding imports/constructions from `createKernel()`; confirm `KernelBuilder.build()` no longer exposes them either, since it delegates to `createKernel()`.
      (Req: core:kernel)
- [x] 6.5 Remove the three editors from public.ts and SDK re-exports
      `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts`: `SaveSpecMetadata`/`InvalidateSpecMetadata`/`UpdateSpecMetadata` classes, `Input`/`Result` types, `Deps` types, and `create*` factories — remove all
      Approach: remove `SaveSpecMetadata`/`SaveSpecMetadataInput`/`SaveSpecMetadataResult`/`createSaveSpecMetadata`/`SaveSpecMetadataDeps`, `InvalidateSpecMetadata`/`InvalidateSpecMetadataInput`/`InvalidateSpecMetadataResult`/`createInvalidateSpecMetadata`/`InvalidateSpecMetadataDeps`, `UpdateSpecMetadata`/`UpdateSpecMetadataInput`/`UpdateSpecMetadataResult`/`createUpdateSpecMetadata` — a compile-time absence, not just a runtime 404.
      (Req: core:kernel)
- [x] 6.6 Add compile-time and runtime removal tests
      `packages/sdk` export tests, `packages/core/test/composition/kernel.spec.ts` (or equivalent)
      Approach: assert `Kernel.specs` exposes exactly the new surface and no longer exposes `saveMetadata`/`updateMetadata`/`invalidateMetadata`; assert `KernelBuilder.build()` parity for at least one custom-registry and one custom-repository-override scenario; add a static `import type` compile check plus a runtime key-set assertion against `public.ts` proving every removed export is absent and every new one is present.
      (Req: core:kernel)

## 7. CLI

- [x] 7.1 Add specs init CLI command
      `packages/cli/src/commands/spec/init.ts`: `specs init` — new command handler
      Approach: parse flags only, call `Kernel.specs.initializePersistedState`, format output, map `SpecAlreadyInitializedError`/`SpecNotFoundError`/`ReadOnlyWorkspaceError` to exit codes, following the shape of `packages/cli/src/commands/spec/generate-metadata.ts`.
      (Req: cli:spec-init)
- [x] 7.2 Add specs schema get|set CLI command
      `packages/cli/src/commands/spec/schema.ts`: `specs schema get|set` — new command handler
      Approach: `get` calls `Kernel.specs.getPersistedSchema`; `set` calls `Kernel.specs.updatePersistedSchema` with `schemaRef`, mapping `SpecNotInitializedError`/`PersistedSchemaDependencyConflictError` to exit codes and surfacing the stranded-optimization consequence explicitly in output.
      (Req: cli:spec-schema)
- [x] 7.3 Add specs deps list|add|remove|set|clear CLI command
      `packages/cli/src/commands/spec/deps.ts`: `specs deps list|add|remove|set|clear` — new command handler
      Approach: `list` calls `Kernel.specs.getPersistedDeps`; the four mutation subcommands call `Kernel.specs.updatePersistedDeps` with the corresponding input shape, mapping validation and conflict errors to exit codes.
      (Req: cli:spec-deps)
- [x] 7.4 Add specs implementation list|add|remove CLI command
      `packages/cli/src/commands/spec/implementation.ts`: `specs implementation list|add|remove` — new command handler
      Approach: `list` calls `Kernel.specs.getPersistedImplementation`; `add`/`remove` call `Kernel.specs.updatePersistedImplementation`, mapping `ImplementationFileNotFoundError`/`ImplementationWorkspaceBoundaryError` to exit codes.
      (Req: cli:spec-implementation)
- [x] 7.5 Add specs optimizations get|set|clear CLI command
      `packages/cli/src/commands/spec/optimizations.ts`: `specs optimizations get|set|clear` — new command handler
      Approach: `get` calls `Kernel.specs.getPersistedOptimizations` and prints freshness/reasons per field; `set`/`clear` call `Kernel.specs.updatePersistedOptimizations`, mapping validation errors to exit codes.
      (Req: cli:spec-optimizations)
- [x] 7.6 Update specs generate-metadata to delegate to RegenerateSpecMetadata
      `packages/cli/src/commands/spec/generate-metadata.ts`: command handler — delegate one-spec and unfiltered `--all` batch work directly to `Kernel.specs.regenerateMetadata`
      Approach: remove the old `--write`/`--status` selection flags; report per-spec `ok`/`failed` and treat any cache-write failure as a command failure (forced-policy semantics).
      (Req: cli:spec-generate-metadata)
- [x] 7.7 Update specs metadata to delegate to GetSpecMetadata
      `packages/cli/src/commands/spec/metadata.ts`: command handler — call `Kernel.specs.getMetadata`
      Approach: print the self-healed projection plus `source`/`regenerated`/`warnings` diagnostics.
      (Req: cli:spec-metadata)
- [x] 7.8 Update specs list to remove the metadata-status flag
      `packages/cli/src/commands/spec/list.ts`: command handler — remove `--metadata-status` flag and any client-side freshness/regeneration logic
      Approach: rely on the port-level removal of `SpecListEntry.metadataStatus`/`SpecListOptions.includeMetadataStatus`; provide no replacement flag.
      (Req: cli:spec-list)
- [x] 7.9 Delete update-metadata, write-metadata, invalidate-metadata CLI commands
      `packages/cli/src/commands/spec/update-metadata.ts`, `write-metadata.ts`, `invalidate-metadata.ts`: command files — delete outright
      Approach: no compatibility alias, deprecation warning, or feature flag; `--help` output and direct invocation must both fail with an unknown-command error.
      (Req: cli:spec-update-metadata)
- [x] 7.10 Update CLI command registration
      Wherever `spec/*.ts` command modules are wired into the `specs` command group (alongside existing registrations for `metadata.ts`/`generate-metadata.ts`/`list.ts`) — register the five new command files and drop the three deleted ones
      Approach: keep registration order/grouping consistent with the existing `specs` command group structure.
      (Req: cli:spec-init)
- [x] 7.11 Add tests for the five new CLI commands
      `packages/cli/test/commands/spec/init.spec.ts`, `schema.spec.ts`, `deps.spec.ts`, `implementation.spec.ts`, `optimizations.spec.ts`
      Approach: cover every documented subcommand, flag-parsing edge case, and error-to-exit-code mapping per the corresponding `cli:*` spec's verify scenarios.
      (Req: cli:spec-deps)
- [x] 7.12 Update tests for modified and deleted CLI commands
      `packages/cli/test/commands/spec/metadata.spec.ts`, `generate-metadata.spec.ts`, `list.spec.ts`
      Approach: assert removed flags (`--write`, `--status`, `--metadata-status`) are gone, new delegation targets (`Kernel.specs.getMetadata`, `Kernel.specs.regenerateMetadata`) are called, and `update-metadata`/`write-metadata`/`invalidate-metadata` no longer exist as commands (both `--help` output and direct invocation fail with an unknown-command error).
      (Req: cli:spec-generate-metadata)

## 8. Filesystem cache and project init

- [x] 8.1 Create metadata cache directory during project init
      `packages/core/src/infrastructure/fs/config-writer.ts` (`FsConfigWriter.initProject`): directory creation — after existing directory creation, `fs.mkdir` the resolved metadata cache directory (`.specd/metadata/` by default)
      Approach: reuse the existing directory-creation sequence pattern already used for other project-init directories.
      (Req: core:config-writer-port)
- [x] 8.2 Append rooted .gitignore entry for the metadata cache
      `packages/core/src/infrastructure/fs/config-writer.ts` (`FsConfigWriter.initProject`): `.gitignore` update — call the existing `appendGitignoreEntries(gitignorePath, [...])` helper with the rooted entry `/.specd/metadata/`
      Approach: reuse the helper already used for `specd.local.yaml`; use a root-`.gitignore` entry rather than the nested `tmp/.gitignore` pattern, since metadata is a top-level project concern; ensure a same-named nested directory elsewhere is unaffected and duplicate entries are never written on repeated `initProject`/force re-init.
      (Req: core:config-writer-port)
- [x] 8.3 Document the one-time Git untracking migration
      Implementation change release notes / migration documentation for the metadata cache — document (do not automate) `git rm -r --cached .specd/metadata && git commit`
      Approach: state explicitly that specd never runs `git rm --cached` automatically; this is a one-time manual step for repositories with previously committed `.specd/metadata/` content.
      (Req: core:config-writer-port)
- [x] 8.4 Add config-writer tests for idempotent metadata directory and gitignore entry
      `packages/core/src/infrastructure/fs/config-writer.ts` tests (co-located spec file)
      Approach: cover idempotent metadata-directory creation and `.gitignore` entry (no duplicate on repeated `initProject`/`force` re-init) and a rooted-entry assertion proving a same-named nested directory elsewhere is unaffected.
      (Req: core:config-writer-port)

## 9. Skills and templates

- [x] 9.1 Update specd-spec-context-optimizer agent template
      `packages/skills/templates/agents/specd-spec-context-optimizer/SPECD-AGENT.md.tpl`: optimization workflow instructions — gate all optimization work behind effective `llmOptimizedContext === true`, replace metadata-editing instructions with `specs optimizations set`/`get`/`clear`, remove any instruction to run metadata generation afterward
      Approach: preserve the existing agent name and prompt policy; only change which CLI surface it calls.
      (Req: skills:agents)
- [x] 9.2 Update specd-project-context-optimizer agent template
      `packages/skills/templates/agents/specd-project-context-optimizer/SPECD-AGENT.md.tpl`: optimization workflow instructions — same `llmOptimizedContext` gate
      Approach: mirror the spec-context optimizer template's gating and CLI-surface change.
      (Req: skills:agents)
- [x] 9.3 Update archive/commit/metadata-oriented workflow skill templates
      Archive, commit, and metadata-oriented workflow skill templates under `packages/skills/templates/skills/`: metadata-status scans and routine manual `generate-metadata` invocation instructions — remove
      Approach: normal consumers self-heal via `MaterializeSpecMetadata`; templates should no longer instruct agents to run `generate-metadata` as a routine step or scan `metadataStatus`.
      (Req: skills:skill-templates-source)
- [x] 9.4 Regenerate installed skill copies
      `.agents/skills/**`, `.codex/skills/**`: rendered skill directories — run the repository's existing agent-sync workflow
      Approach: regenerate from canonical templates; never hand-edit the generated copies.
      (Req: skills:skill-templates-source)
- [x] 9.5 Add/extend plugin and skill template tests
      Plugin/skill template test suites covering the two optimizer agent templates and the archive/commit workflow templates
      Approach: verify neither optimizer agent template performs a write when the effective `llmOptimizedContext` is `false`, and that archive/commit workflow templates no longer reference metadata-status scanning or manual `generate-metadata`.
      (Req: skills:agents)

## 10. Code graph indexer

- [x] 10.1 Switch code-graph indexer to materialized metadata
      `packages/code-graph` indexer (workspace `code-graph:indexer`): incremental spec re-indexing — materialize canonical spec metadata through `Kernel.specs.getMetadata` and use `metadataFingerprint` for change detection instead of reading a raw metadata snapshot directly
      Approach: replace the direct raw-snapshot read with a `Kernel.specs.getMetadata` call and compare `metadataFingerprint` values to decide whether to re-index.
      (Req: code-graph:indexer)
- [x] 10.2 Add/extend code-graph indexer tests for fingerprint-based re-indexing
      `packages/code-graph` test suite for the indexer's spec re-indexing path
      Approach: cover fingerprint-unchanged skip, fingerprint-changed re-index, and self-healing behavior when metadata was previously missing or stale.
      (Req: code-graph:indexer)

## 11. Documentation

- [x] 11.1 Update getting-started metadata and project-structure docs
      `docs/guide/_sections/getting-started/spec-metadata.md`, `docs/guide/_sections/getting-started/project-structure.md`
      Approach: describe the self-healing metadata cache, `.specd/metadata/` gitignore behavior, and the new `specs deps|implementation|optimizations|init|schema` command families in place of manual metadata editing guidance.
      (Req: default:\_global/docs)
- [x] 11.2 Update configuration and config-reference docs
      `docs/guide/configuration.md`, `docs/config/config-reference.md`
      Approach: document the metadata cache directory configuration and its `.gitignore` behavior.
      (Req: default:\_global/docs)
- [x] 11.3 Update config example docs
      `docs/config/examples/approvals-and-workflow-hooks.md`, `docs/config/examples/single-repo-minimal.md`
      Approach: update any example referencing the old metadata editing workflow to the new persisted-state command families.
      (Req: default:\_global/docs)
- [x] 11.4 Update workflow and schema-format docs
      `docs/guide/workflow.md`, `docs/schemas/schema-format.md`
      Approach: describe `specs init`/`specs schema` as the explicit schema-adoption and reassignment steps, replacing implicit metadata-generation-based adoption.
      (Req: default:\_global/docs)
- [x] 11.5 Update CLI reference and project-init docs
      `docs/cli/cli-reference.md`, `docs/cli/project-init.md`
      Approach: list the five new `specs` command families, the updated `generate-metadata`/`metadata`/`list` behavior, and the three removed commands; document the metadata cache directory created by `project init`.
      (Req: default:\_global/docs)
- [x] 11.6 Update core ports/use-cases/services/overview/errors docs
      `docs/core/ports.md`, `docs/core/use-cases.md`, `docs/core/services.md`, `docs/core/overview.md`, `docs/core/errors.md`
      Approach: document the revised `SpecRepository` port surface, every new use case, the new domain services (`applyPersistedSpecStatePatch`, `assessMetadataFreshness`), and the six new error types.
      (Req: default:\_global/docs)
- [x] 11.7 Update config-writer, core SDK, and SDK index docs
      `docs/core/config-writer.md`, `docs/core/sdk.md`, `docs/sdk/index.md`
      Approach: document `FsConfigWriter.initProject`'s new metadata-directory/gitignore behavior and the full set of newly re-exported public use cases alongside the three removed ones.
      (Req: default:\_global/docs)
- [x] 11.8 Add spec-init and spec-schema CLI doc pages
      `docs/cli/spec-init.md`, `docs/cli/spec-schema.md`: new pages
      Approach: document every subcommand, flag, and error mapping for `specs init` and `specs schema get|set`.
      (Req: cli:spec-init)
- [x] 11.9 Add spec-deps and spec-implementation CLI doc pages
      `docs/cli/spec-deps.md`, `docs/cli/spec-implementation.md`: new pages
      Approach: document every subcommand, flag, and error mapping for `specs deps` and `specs implementation`.
      (Req: cli:spec-deps)
- [x] 11.10 Add spec-optimizations CLI doc page
      `docs/cli/spec-optimizations.md`: new page
      Approach: document `get`/`set`/`clear`, freshness reporting, and that this command never invokes an LLM.
      (Req: cli:spec-optimizations)
- [x] 11.11 Add updated spec-metadata and spec-generate-metadata CLI doc pages
      `docs/cli/spec-metadata.md`, `docs/cli/spec-generate-metadata.md`: new/rewritten pages
      Approach: document the self-healing `specs metadata` output (`source`/`regenerated`/`warnings`) and the forced-rebuild `specs generate-metadata` behavior including `--all` batch reporting.
      (Req: cli:spec-metadata)
- [x] 11.12 Remove spec-update-metadata CLI doc page
      `docs/cli/spec-update-metadata.md`: page — delete outright
      Approach: no compatibility-alias page is kept, matching the CLI command's outright deletion.
      (Req: cli:spec-update-metadata)

## 12. Manual / E2E verification

- [x] 12.1 Verify fresh project init creates a gitignored metadata cache
      Manual verification — run `project init` on a fresh project
      Approach: confirm `.specd/metadata/` exists and `/.specd/metadata/` appears exactly once in the root `.gitignore`.
      (Req: core:config-writer-port)
- [x] 12.2 Verify deps/implementation/optimizations set persist without prior generation
      Manual verification — author a spec, run `specs deps set`, `specs implementation add`, and `specs optimizations set`
      Approach: confirm each persists into `spec-lock.json` and `specs metadata` reflects the fresh values without a preceding `generate-metadata` call.
      (Req: cli:spec-deps)
- [x] 12.3 Verify stale optimization detection and regeneration on artifact change
      Manual verification — modify an artifact referenced by a set optimization
      Approach: confirm `specs optimizations get` reports it `STALE` with `artifact-changed`, and `specs metadata` regenerates the corresponding field's normalized projection without serving the stale optimized string.
      (Req: cli:spec-optimizations)
- [x] 12.4 Verify compatible schema reassignment
      Manual verification — run `specs schema set` on an initialized spec to a compatible schema with matching extracted dependencies
      Approach: confirm `changed: true`, dependencies unchanged, implementation/optimization values preserved, and optimizations now reported stale due to `schema-changed`.
      (Req: cli:spec-schema)
- [x] 12.5 Verify conflicting schema reassignment fails closed
      Manual verification — attempt `specs schema set` to a schema whose extraction disagrees with current `dependsOn`
      Approach: confirm `PersistedSchemaDependencyConflictError` is raised and no persisted-state mutation occurs.
      (Req: cli:spec-schema)
- [x] 12.6 Verify batch initialization over lock-less legacy specs
      Manual verification — run `specs init --all` against a directory of lock-less legacy specs
      Approach: confirm per-spec `initialized`/`failed` reporting and the correct `existingSkipped` count on a second run.
      (Req: cli:spec-init)
- [x] 12.7 Verify self-healing on deleted metadata cache
      Manual verification — delete a spec's cached `metadata.json`
      Approach: confirm the next `specs metadata` call self-heals transparently.
      (Req: cli:spec-metadata)
- [x] 12.8 Verify optimization preservation and force materialization on archive
      Manual verification — archive a change touching a spec with existing optimizations
      Approach: confirm the optimization values and baselines survive publication unchanged and metadata is force-materialized immediately after.
      (Req: core:archive-change)
- [x] 12.9 Verify forced batch regeneration
      Manual verification — run `specs generate-metadata --all`
      Approach: confirm it forces regeneration for every spec regardless of freshness and reports any cache-write failure as a command failure.
      (Req: cli:spec-generate-metadata)
- [x] 12.10 Verify removed CLI commands are gone
      Manual verification — confirm `update-metadata`, `write-metadata`, and `invalidate-metadata` no longer exist as CLI commands
      Approach: confirm both `--help` output and direct invocation fail with an unknown-command error.
      (Req: cli:spec-update-metadata)

## 13. Cheap repository Meta and list stamps (incremental)

- [x] 13.1 Reshape SpecRepository Meta types and remove persistedStateHash
      `packages/core/src/application/ports/spec-repository.ts`
      Approach: `ArtifactMeta.lastModified` required + optional `hash`; add `PersistedStateMeta`, `GeneratedMetadataMeta`, `SpecListArtifactMeta`, `SpecMetaOptions`; add `persistedStateMeta`/`generatedMetadataMeta`; `artifactMeta(..., options?)`; delete `persistedStateHash`; extend `SpecListOptions.includeMeta` and `SpecListEntry` Meta fields (omit when flag off; `null` means absent when included).
      (Req: core:spec-repository-port)
- [x] 13.2 Implement Meta methods and list includeMeta projection on FsSpecRepository
      `packages/core/src/infrastructure/fs/spec-repository.ts`, `fs-spec-index-cache.ts`, `fs-index-cache-base.ts`
      Approach: implement Meta methods reusing existing stat/hash paths; project existing index `sourceFiles` into list Meta when `includeMeta` is set (never hash; no wire enrichment); delete `persistedStateHash` wrapper; fingerprint uses `persistedStateMeta({ includeHash: true })?.hash`.
      (Req: core:fs-spec-repository)
- [x] 13.3 Accept optional stamps on ValidationResultCache.lookup
      `packages/core/src/application/ports/validation-result-cache.ts`, `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`
      Approach: `lookup({ ..., stamps? })`; when stamps provided, hard-hit compares without `get()`; soft-hit/miss keep injected-repository I/O; upsert unchanged.
      (Req: core:validation-result-cache-port)
- [x] 13.4 ValidateSpecs discovers with includeMeta and passes stamps
      `packages/core/src/application/use-cases/validate-specs.ts`
      Approach: workspace/`--all` use `list(undefined, { includeMeta: true })`; map Meta → stamp bundle into `lookup`; single-spec may still `get()`; no inventing stamp algorithms in the use case.
      (Req: core:validate-specs)
- [x] 13.5 Migrate GenerateSpecMetadata and all persistedStateHash call sites
      `packages/core/src/application/use-cases/generate-spec-metadata.ts` and every remaining caller/stub/test double
      Approach: provenance lock hash via `persistedStateMeta({ includeHash: true })?.hash ?? null` or snapshot `originalHash`; grep/migrate all `persistedStateHash` references out of the tree.
      (Req: core:generate-metadata)
- [x] 13.6 Tests for Meta / list / validate hard-hit path
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`, `fs-validation-result-cache.spec.ts`, `packages/core/test/application/use-cases/validate-specs.spec.ts`, `generate-spec-metadata.spec.ts`
      Approach: cover optional hash, list Meta projection, hard-hit without N×get, and Meta-based provenance hash; update doubles that still declare `persistedStateHash`.
      (Req: core:spec-repository-port)
- [x] 13.7 Docs for Meta and includeMeta
      `docs/core/ports.md`, `docs/core/use-cases.md` (and related if needed)
      Approach: document Meta family, removed `persistedStateHash` method, list `includeMeta`, and ValidateSpecs stamp-passthrough for hard hits.
      (Req: default:\_global/docs)

## 14. Verification audit follow-up

- [x] 14.1 Fix clear-on-uninitialized for UpdatePersistedSpecOptimizations
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`
      Approach: if `current === null` and only `clear` is set, return `{ specId, created: false }` without writing; never call `resolveInitialPersistedDependsOn` for clear-only.
      (Req: core:update-persisted-spec-optimizations)
- [x] 14.2 Record persisted schema on set when lock already exists
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`
      Approach: for `set`, use `current.schema` when state exists; use active `schemaIdentity` only when creating initial state.
      (Req: core:update-persisted-spec-optimizations)
- [x] 14.3 Surface missing freshness in GetPersistedSpecOptimizations
      `packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts`
      Approach: when a field is absent (and not filtered out), return `freshness: 'missing'` via `classifyOptimizationFieldFreshness`; aggregate `fresh` is false when initialized with no optimization fields present.
      (Req: core:get-persisted-spec-optimizations)
- [x] 14.4 Defer CompileContext materialization until after display-mode classification
      `packages/core/src/application/use-cases/compile-context.ts` (+ get-project-context if same pattern)
      Approach: do not call `GetSpecMetadata` for list-mode-only entries; materialize only specs that need summary/full content.
      (Req: core:compile-context)
- [x] 14.5 Align CLI metadata / generate-metadata / project-init / optimizations output
      `packages/cli/src/commands/spec/metadata.ts`, `generate-metadata.ts`, `optimizations.ts`, `packages/cli/src/commands/project/init.ts` (and InitProjectResult if needed)
      Approach: structured text + JSON per verify; add `--force` to generate-metadata; emit `metadataCachePath`; report missing optimization fields.
      (Req: cli:spec-metadata, cli:spec-generate-metadata, cli:project-init, cli:spec-optimizations)
- [x] 14.6 Tests for audit follow-up scenarios
      Matching `packages/core/test/...` and `packages/cli/test/...` files
      Approach: cover clear no-op, persisted schema on set, missing freshness, list-mode materialize call-count, and CLI output contracts.
      (Req: core:update-persisted-spec-optimizations, core:get-persisted-spec-optimizations, core:compile-context)

## 15. Compliance notes follow-up (2026-07-25)

- [x] 15.1 Defer GetProjectContext materialization until after display-mode classification
      `packages/core/src/application/use-cases/get-project-context.ts`
      Approach: mirror CompileContext — classify `contextMode` first; never call `GetSpecMetadata` for list-mode entries; materialize only summary/full.
      (Req: core:get-project-context)
- [x] 15.2 Strengthen CLI contract tests for force, batch JSON, metadata text, project-init text
      Matching `packages/cli/test/...` files (`generate-metadata`, `metadata`, `project-init`, regenerate path)
      Approach: assert `--force: true` / `allowDependsOnOverwrite`, batch JSON `total`/`succeeded`/`failed`, full metadata text sections, and `metadata cache:` text line; no handler behaviour change expected.
      (Req: cli:spec-generate-metadata, cli:spec-metadata, cli:project-init)
- [x] 15.3 Tests for GetProjectContext list-mode skip
      `packages/core/test/application/use-cases/get-project-context.spec.ts` (or matching)
      Approach: with `contextMode: "list"`, assert `GetSpecMetadata` is not invoked for included specs.
      (Req: core:get-project-context)

## 16. Close remaining compliance notes (2026-07-25)

- [x] 16.1 Assert CLI metadata JSON full arrays and no top-level fresh/contentHashes
      `packages/cli/test/commands/spec-metadata.spec.ts`
      Approach: JSON includes full `metadata.rules`/`constraints`/`scenarios` arrays; top-level has neither `fresh` nor `contentHashes`; text omits empty dependsOn/warnings and shows exact counts.
      (Req: cli:spec-metadata)
- [x] 16.2 Assert generate-metadata batch JSON all-ok path
      `packages/cli/test/commands/spec-generate-metadata.spec.ts`
      Approach: `--all --format json` with all successes emits `result: "ok"`, `failed: 0`.
      (Req: cli:spec-generate-metadata)
