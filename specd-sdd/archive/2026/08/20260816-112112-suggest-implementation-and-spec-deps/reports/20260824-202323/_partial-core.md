# Core compliance audit

Change: `suggest-implementation-and-spec-deps`  
Scope: `core:fs-spec-repository`, `core:spec-repository-port`, `core:create-change`, `core:change-repository-port`, `core:fs-change-repository`  
Method: merged `changes spec-preview` artifacts, graph-first symbol discovery, implementation/test inspection, dependency consistency review, and the complete Core test suite. The code graph reported `stale: false` before inspection.

## Requirements Summary

### `core:fs-spec-repository`

Eight merged requirements and 33 scenarios cover constructor validation, storage-factory registration, the `FsSpecIndexCache` boundary and freshness model, full `SpecListEntry` cache materialization, metadata-only `get()` stamps, canonical persisted-state serialization, metadata snapshots, physical `*Meta` observations, and `specFingerprint`. The change specifically requires filesystem `SpecArtifactEntry` and `artifactMeta` observations to expose byte `size` from the same `stat` observation as `lastModified`, while retaining opt-in hashing.

### `core:spec-repository-port`

Nineteen merged requirements and 63 scenarios define workspace-bound repository identity; `get`, `list`, artifact access/confinement/debug logging, save/delete/path resolution, metadata snapshots, aggregate persisted state, search, count/reindex, and optional filesystem capability. The changed contract makes `SpecArtifactEntry.size` optional across adapter families but mandatory for filesystem-backed observations, and makes `ArtifactMeta.size` part of every present `artifactMeta` response while keeping `hash` conditional on `includeHash`.

### `core:create-change`

Thirteen merged requirements and 35 scenarios cover input/schema resolution, uniqueness, actor/history construction, dependency seeding, invalidation policy, persistence/scaffolding, composition dependencies, optional overlap detection, and optional initial exploration. The new requirement makes `explorationContent` semantic input: non-empty content is delegated to `ChangeRepository.create`; application code must perform no filesystem I/O; absent/undefined/empty content creates no exploration.

### `core:change-repository-port`

Twenty-nine merged requirements and 82 scenarios cover active/draft/discarded reads and lists, serialized mutation, drift invalidation, counts/reindex/projection, first create, artifact I/O/confinement/concurrency, storage paths, scaffolding, and the abstract surface. The added exploration contract comprises optional create data, metadata-only `Change.explorationMeta`, lazy `readExploration`, and semantic `writeExploration`, with no storage-layout exposure.

### `core:fs-change-repository`

Eleven merged requirements and 27 scenarios cover constructor/factory behavior, per-bucket index helpers and atomic mutation, freshness/index maintenance, revision compatibility, first persist, post-mutation reconcile, mutate-window artifact writes, and filesystem exploration persistence. The exploration file is the adapter-private `.specd-exploration.md`; initial persistence must clean up on failure, `get` may only stat it, reads are lazy, and writes are atomic.

## Implementation Status

### `core:fs-spec-repository` — substantially implemented, one structural discrepancy

- `SpecArtifactEntry.size?: number` is present in `packages/core/src/domain/entities/spec.ts:4-9`, correctly allowing non-filesystem adapters to omit it.
- `FsSpecRepository._buildSpec` performs one `fs.stat` per artifact and derives `filename`, `lastModified`, and `size` from that observation (`packages/core/src/infrastructure/fs/spec-repository.ts:1016-1024`).
- `artifactMeta` returns `{ lastModified, size }` without `includeHash` and adds `hash` only with `includeHash` (`packages/core/src/infrastructure/fs/spec-repository.ts:579-610`).
- Existing persisted-state, metadata-snapshot, index and fingerprint behavior is exercised by the broad repository suite and remained green.
- The implementation does not, however, visibly reuse a shared artifact stat/hash path; see discrepancy CORE-2.

### `core:spec-repository-port` — implemented

- The port-level `ArtifactMeta` shape requires `lastModified`, `size`, and optional `hash` (`packages/core/src/application/ports/spec-repository.ts:22-27`).
- `SpecArtifactEntry` exposes optional `size`, matching the merged cross-adapter rule.
- The abstract method roster still expresses semantic aggregate operations and does not reintroduce hash-only/field-wise methods.
- Direct and transitive consumers compiled and all Core tests passed.

### `core:create-change` — implemented

- `CreateChangeInput.explorationContent?: string` is public semantic input (`packages/core/src/application/use-cases/create-change.ts:26-43`).
- `execute` delegates non-empty content to `ChangeRepository.create(change, { explorationContent })`; otherwise it calls the one-argument form (`packages/core/src/application/use-cases/create-change.ts:149-154`).
- The application use case imports no filesystem module and never references `.specd-exploration.md`.
- The existing sequence (create, then scaffold, then optional best-effort overlap check) and all prior creation behavior remain intact.

### `core:change-repository-port` — implemented

- `CreateChangeStorageOptions`, `create(change, options?)`, `readExploration`, and `writeExploration` are declared on the port (`packages/core/src/application/ports/change-repository.ts:31-40,234-240`).
- `ChangeProps` and `Change` expose immutable metadata-only `explorationMeta`, returning a defensive copy (`packages/core/src/domain/entities/change.ts:214-223,273,317,353-356`).
- The port contains no filesystem filename or path knowledge.

### `core:fs-change-repository` — implemented

- The adapter alone owns `EXPLORATION_FILENAME = '.specd-exploration.md'` (`packages/core/src/infrastructure/fs/change-repository.ts:98`).
- `create` persists the manifest, writes non-empty exploration through `writeExploration`, and invokes repository deletion before rethrowing on exploration failure (`:661-675`).
- `readExploration` is lazy and returns `null` on ENOENT; `writeExploration` ignores empty content and uses `writeFileAtomic` (`:678-695`).
- `_manifestToChange` obtains exploration metadata through `_explorationMeta`; that helper only calls `fs.stat`, returns ISO mtime plus byte size, and returns `null` on ENOENT (`:1388,1507,1613-1630`).
- The filename remains absent from application/orchestration code in the audited Core scope.

## Discrepancies

### CORE-1 — MEDIUM — merged verification contradicts the merged `FsSpecRepository` requirement

Evidence:

- The merged `core:fs-spec-repository` requirement “SpecListEntry materialization in index” says the cached/public projection is `summary` plus Meta fields, that callers use `includeSummary` / `includeMeta`, and explicitly states: “`includeMetadataStatus` MUST NOT exist.”
- In the same merged spec's verification artifact, scenario “Index stores full CLI-usable SpecListEntry payload” still expects `metadataStatus`, and scenario “include flags project cached fields without extra reads” still invokes `list({ includeSummary: false, includeMetadataStatus: false })` and expects `metadataStatus` omission.
- Current code consistently uses `includeMeta` (`packages/core/src/application/ports/spec-repository.ts:65-66`; `packages/core/src/infrastructure/fs/spec-repository.ts:276,322`) and contains no production `includeMetadataStatus` surface.

Assessment: the implementation appears aligned with the normative requirement and newer dependency contracts; the verification artifact is stale spec drift. If `metadataStatus` was actually intended, then both the normative requirement and current implementation would need revision. As written, the two artifact sections cannot both be satisfied. This should be corrected in design before treating every merged scenario as passing.

### CORE-2 — MEDIUM — `artifactMeta` appears to implement a second stat/hash routine

Evidence:

- Both merged `core:fs-spec-repository` and `core:spec-repository-port` require `artifactMeta` to reuse the existing artifact stat/hash path and explicitly prohibit a second hashing implementation.
- `FsSpecRepository.artifactMeta` independently resolves the path, performs `fs.stat`, conditionally performs `fs.readFile`, and calls `sha256` inline (`packages/core/src/infrastructure/fs/spec-repository.ts:579-610`).
- `_buildSpec` separately performs `fs.stat` (`:1016-1024`), while normal artifact loading/hash consumers use other paths. No shared artifact observation helper is invoked by `artifactMeta`.
- Existing tests assert returned values but do not establish shared-path reuse.

Assessment: behavior is functionally correct, but the code structure conflicts with the explicit “reuse / not a second implementation” constraint. The likely implementation fix is one internal artifact observation primitive used by `_buildSpec`, `artifactMeta`, and hash-bearing access as appropriate. Alternatively, if behavioral equivalence rather than structural reuse is intended, the two specs should soften that wording.

### CORE-3 — LOW — tests do not prove the no-read/single-stat properties added for size stamps

Evidence:

- `packages/core/test/infrastructure/fs/spec-repository.spec.ts:193-198` checks the correct byte size from `get`, but the assertion/comment does not spy on file operations or prove that `lastModified` and `size` came from exactly one `stat` and no content read.
- `artifactMeta` tests validate shape/hash values (`:1243-1265`) but do not prove reuse of the same stat/hash path.

Assessment: source inspection shows `_buildSpec` currently satisfies the operational part, so this is a coverage weakness rather than a demonstrated runtime bug.

### CORE-4 — LOW — exploration tests incompletely prove laziness and atomic semantics

Evidence:

- `packages/core/test/infrastructure/fs/change-repository.spec.ts:140-169` verifies persisted content, metadata size, absence/empty behavior, and cleanup after a simulated write failure.
- The “lazily” test checks that the returned aggregate has no `explorationContent` property, but does not instrument `fs.readFile` to prove `get` never reads `.specd-exploration.md`.
- No direct test calls `writeExploration` and observes atomic replacement/failure behavior. Atomicity is inferred from its delegation to the already-used `writeFileAtomic` helper.
- `packages/core/test/application/use-cases/create-change.spec.ts:63-80` proves non-empty delegation, but does not explicitly exercise empty-string delegation behavior at the use-case boundary (ordinary no-exploration creation covers the absent case).

Assessment: implementation inspection supports compliance; targeted negative/instrumented tests would make the scenario evidence complete.

## Test Coverage

- Executed `pnpm --filter @specd/core test` during this audit: **195 test files passed, 2,374 tests passed**.
- `packages/core/test/application/use-cases/create-change.spec.ts` covers creation, schema identity, actor/history, uniqueness, seeding, overlap behavior, persistence/scaffolding, and the new non-empty exploration delegation.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` covers the broad active/draft/discarded repository behavior plus exploration persistence, absence/empty handling, metadata exposure, lazy explicit read, and first-create cleanup on failure.
- `packages/core/test/infrastructure/fs/spec-repository.spec.ts` covers constructor/factory, index/list/get, persisted state, metadata snapshots, `artifactMeta`, fingerprinting, and the newly exposed byte sizes.
- Composition tests cover `createCreateChange` dependency/config wiring; port behavior is additionally exercised through use-case stubs and filesystem integration tests.
- All historical Core requirements remained regression-green, but a green suite cannot resolve CORE-1 because the contradictory scenario uses an API intentionally absent from current code.

## Missing Tests

1. Instrument `FsSpecRepository.get` to assert one `stat` observation supplies both `lastModified` and `size`, and that no artifact content read occurs while building stamps.
2. Refactor to a shared artifact observation primitive, then test `artifactMeta` through that seam (or otherwise prove shared stat/hash-path reuse) to cover CORE-2.
3. Instrument `FsChangeRepository.get`/`_manifestToChange` to prove exploration content is not read while metadata is populated.
4. Add a direct `writeExploration` integration test for non-empty atomic replacement and empty-content no-op behavior.
5. Add an application-level `CreateChange.execute({ explorationContent: '' })` test verifying the repository receives no exploration option.
6. After resolving CORE-1, replace the stale `metadataStatus/includeMetadataStatus` verification cases with `includeMeta`/public Meta assertions and ensure cached projection performs no extra I/O or hashing.

## Spec Dependency Chain

- All five specs depend on `default:_global/architecture`. The new code respects the dependency direction: the application use case and abstract ports contain no filesystem I/O; `.specd-exploration.md`, `fs.stat`, `fs.readFile`, and atomic writes remain in the filesystem adapter.
- `core:fs-spec-repository` directly depends on `core:spec-repository-port`, `core:composition`, `core:storage`, `core:spec-lock`, `core:spec-metadata`, and `core:spec-optimization`. The changed size contract is consistent between the port (cross-adapter optional `SpecArtifactEntry.size`, required present `ArtifactMeta.size`) and FS adapter (always populated from `stat`). CORE-2 is the sole implementation-level inconsistency with this chain.
- `core:create-change` directly depends on `core:change-repository-port`, `core:change`, `core:get-active-schema`, `core:spec-overlap`, and `core:composition-resolver`. It delegates exploration semantics through the port and preserves existing schema/overlap/composition contracts.
- `core:fs-change-repository` directly depends on `core:change-repository-port`, `core:composition`, `core:storage`, and `core:change-list-entry`. Exploration metadata is not serialized into list rows or manifests, so existing storage/index/list-entry contracts remain isolated.
- `core:change-repository-port` depends on repository/change/view/storage/manifest/list-entry/logging contracts. The added APIs are semantic and storage-neutral; loaded content remains opt-in, consistent with the pre-existing artifact-loading model.
- Project-wide `_global/testing` expects application/domain unit tests with mocked ports and filesystem adapter integration tests with real temporary storage. Both forms exist; CORE-3/CORE-4 identify assertion-depth gaps rather than missing test layers.
- No direct dependency contradiction was found apart from the internal merged verification drift in CORE-1.

## Summary counts

- Specs audited: **5**
- Normative requirements inspected: **80**
- Verification scenarios inspected: **240**
- Fully/substantially implemented specs: **5**
- Findings: **4** total
  - Critical: **0**
  - High: **0**
  - Medium: **2**
  - Low: **2**
- Demonstrated implementation discrepancy: **1** (CORE-2)
- Artifact/spec discrepancy: **1** (CORE-1)
- Test-coverage gaps: **2** (CORE-3, CORE-4)
- Core test result: **195/195 files and 2,374/2,374 tests passed**
