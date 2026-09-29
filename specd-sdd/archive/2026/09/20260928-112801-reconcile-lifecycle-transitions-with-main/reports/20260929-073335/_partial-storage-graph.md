# Compliance audit — storage and graph batch

Change: `reconcile-lifecycle-transitions-with-main`  
Outer verification attempt: `verification-attempt-1` (delegated; this audit did not start or complete it)  
Specs: `core:fs-change-repository`, `core:change-repository-port`, `code-graph:indexer`, `code-graph:index-project-graph`

## Requirements Summary

### `core:fs-change-repository`

The merged spec contains 11 distinct requirements and 29 verification scenarios. It requires strict constructor configuration, factory registration, three bucket-specific `FsChangeIndexCache` instances, `updatedAt` compatibility, serialized and atomic cache mutation, mtime/invalidation freshness, write-path index maintenance, first persistence through `create`, post-mutation reconciliation, mutate-window-only byte writes, and Windows-safe path/move behavior.

### `core:change-repository-port`

The merged spec contains 29 distinct requirements and 78 verification scenarios. It defines the abstract repository surface: active/draft/discarded reads, serialized mutation returning `{ result, change }`, atomic reconciliation, hydration facts, list/count/reindex projections, first persistence, artifact concurrency and confinement, scaffolding, implementation-file access, and internal storage paths.

### `code-graph:indexer`

The merged spec contains 24 distinct requirements and 97 verification scenarios. It covers the complete atomic indexing pipeline: incremental/fingerprint behavior, deterministic spec coverage, discovery and portable identities, adapter-owned semantic extraction, bounded two-pass relation construction, progress/timing, error isolation, result diagnostics, reference facts, full-rebuild compatibility, indexed-input observations, and affected-closure incremental work.

### `code-graph:index-project-graph`

The merged spec contains 4 distinct requirements and 7 verification scenarios. It requires a thin use case that forwards prepared inputs to an already-open provider, forwards logical `force`, returns the provider result unchanged, owns no provider/storage/process lifecycle, and is constructed by a stateless factory.

## Implementation Status

### `core:fs-change-repository` — implemented

- `packages/core/src/infrastructure/fs/change-repository.ts` implements `ChangeRepository`, validates split runtime/config inputs, owns active/draft/discarded helpers, persists manifests atomically, serializes same-name mutations, reconciles after persist, confines artifact paths, and enforces the mutation window for `saveArtifact`.
- `packages/core/src/infrastructure/fs/fs-change-index-cache.ts` delegates list/count/reindex/invalidate/upsert/remove to the generic cache and supplies manifest projection, canonical bucket sorting, and mtime stamps.
- `packages/core/src/infrastructure/fs/fs-index-cache-base.ts` supplies the shared per-bucket lock, serialized mutation, atomic index/meta publication, invalidation, source-stamp freshness, and unchanged-row avoidance required by the specialized cache.
- `packages/core/src/composition/change-repository.ts` exposes the storage factory and forwards context/config separately.

No implementation mismatch was found in the inspected paths.

### `core:change-repository-port` — implemented

- `packages/core/src/application/ports/change-repository.ts:72` is the abstract port over `Repository`; its signatures and documentation cover the merged contract, including `MutateResult<T>`, read-only draft/discard views, list/count/reindex methods, first-time `create`, optimistic artifact writes, confinement-related operations, `implementationFile`, and `internalPaths`.
- `FsChangeRepository` provides the concrete implementation and its integration suite exercises the port semantics across persisted filesystem state.

No implementation mismatch was found.

### `code-graph:indexer` — implemented

- `packages/code-graph/src/application/use-cases/index-code-graph.ts:433` implements the multi-workspace indexing pipeline, including discovery, fingerprint comparison, atomic bulk sessions, semantic Pass 1/Pass 2, adapter-derived facts, spec/coverage projection, bounded affected-closure work, progress, phase metrics, and result diagnostics.
- Graph/store and adapter boundaries remain consistent with the direct dependency specs: the indexer consumes adapter payloads and the `GraphStore` atomic session rather than introducing language- or backend-specific ownership into the application use case.
- The current graph was verified fresh at commit `a5ecfed1`: 1,288 indexed files, 293 specs, `stale: false`, `fingerprintMismatch: false`, `contentFresh: true`, and `coverageComplete: true`.

No implementation mismatch was found.

### `code-graph:index-project-graph` — implemented

- `packages/code-graph/src/application/use-cases/index-project-graph.ts:11` accepts an open host port and prepared inputs.
- `IndexProjectGraph.execute()` at line 35 performs one `provider.index()` call, copies the workspace array, conditionally forwards `force`, `vcsRef`, `onProgress`, and `getSpecMetadata`, and returns the promise/result unchanged.
- It contains no open, close, clear, recreate, lock, subprocess, or recovery logic.
- `packages/code-graph/src/composition/use-cases/index-project-graph.ts:8` returns a new stateless instance.

The extra optional `getSpecMetadata` forwarding is compatible with, and required by, the merged indexer behavior; it does not contradict the prepared-input or lifecycle constraints.

## Discrepancies

No product-code/spec contradiction was identified. The discrepancies below are test-evidence gaps rather than observed implementation failures.

1. **MEDIUM — Windows move retry and drive-letter containment scenarios lack direct fault-injection coverage.**
   - Spec evidence: `core:fs-change-repository` requires case-insensitive drive containment, copy fallback for `EPERM`/`EXDEV`, bounded retry for `EPERM`/`EBUSY`/`EACCES`, and preservation of the original error.
   - Code evidence: the repository contains the cross-platform path and rename/copy paths, but searches of `change-repository.spec.ts` found no explicit `EPERM`, `EXDEV`, `EBUSY`, `EACCES`, or drive-letter assertions.
   - Interpretation: the implementation may be correct, but the spec's platform-specific behavior can regress without a mocked filesystem test or Windows CI assertion targeted at these branches.

2. **MEDIUM — index-pair failure atomicity is not explicitly fault-injected.**
   - Spec evidence: `core:fs-change-repository` requires temp cleanup, JSONL-before-meta publication, lock release on failure, and no half-published pair.
   - Test evidence: `fs-index-cache-base.spec.ts` covers upsert, remove, invalidation, mtime rebuild, fresh-cache reuse, concurrent mutation serialization, and identical-row avoidance; `fs-change-index-cache.spec.ts` covers rebuild/upsert/invalidate/remove. Neither suite injects a failure between JSONL and meta publication.
   - Interpretation: the shared implementation follows the required structure, but a fault-injection regression would not be caught directly.

3. **MEDIUM — the two explicit indexer error-isolation scenarios lack focused tests.**
   - Spec evidence: `code-graph:indexer` distinguishes a per-file parse failure (collect and continue) from a `GraphStore.upsertFile()`/infrastructure failure (abort the run).
   - Test evidence: the code-graph suites contain broad integration, adapter, store-contract, incremental, and recovery tests, but no test title or fixture directly exercises “one malformed source beside one valid source” and no focused injected store-connection failure during index persistence.
   - Interpretation: code inspection shows per-file collection and infrastructure propagation, but explicit scenario-level regression evidence is missing.

4. **LOW — prepared-input forwarding is asserted field-by-field only partially.**
   - Spec evidence: `code-graph:index-project-graph` says prepared project inputs are forwarded unchanged.
   - Test evidence: unit tests explicitly assert `force`, `onProgress`, `getSpecMetadata`, and both nullable/non-null `vcsRoot`; the base invocation exercises other fields but does not assert the complete object in one expectation.
   - Interpretation: the implementation is a direct object construction and is clear, so this is a test-strength issue rather than a likely defect.

## Test Coverage

Executed for this audit:

- `@specd/core` — `test/infrastructure/fs/change-repository.spec.ts`: **110/110 passed**.
- `@specd/code-graph` — `index-project-graph.spec.ts`, `index-project-graph-integration.spec.ts`, and `workspace-indexing.spec.ts`: **34/34 passed**.

Additional inspected coverage:

- `fs-index-cache-base.spec.ts`: cache mutation serialization, mtime freshness, invalidation, count maintenance, and no-op upsert.
- `fs-change-index-cache.spec.ts`: specialized manifest rebuild/upsert/invalidate/remove behavior.
- `repository-factories.spec.ts`: filesystem change-repository composition.
- `host-use-case-factories.spec.ts`: stateless `IndexProjectGraph` factory.
- `index-project-graph-integration.spec.ts`: forced logical rebuild without storage recreation, spec-lock-only coverage reprojection, multi-language reference facts, missing-target importer repair, bounded high-cardinality construction, one native bulk session, dirty-index resolution behavior, incompatible-store recovery boundary, and anchored coverage.
- `workspace-indexing.spec.ts`: resolution fingerprint stability, durable coverage outcomes, affected-closure incremental work, multi-workspace identities, document encodings, root-identity deduplication, spec-root exclusion, optimized descriptions, materialized metadata fingerprints, and unchanged-run zero-work metrics.
- Graph-store contract, SQLite, language-adapter, discovery, staleness, traversal, and symbol-resolution suites cover the indexer's direct dependency contracts.

## Missing Tests

Recommended additions, without implying a current implementation failure:

1. Mock rename/copy failures for every required Windows error code and assert retry count, fallback behavior, destination-byte handling, and original-error propagation.
2. Add a drive-letter case containment test independent of the host operating system.
3. Fault-inject failure after JSONL temp publication but before meta publication; assert live-pair consistency, temp cleanup, and subsequent lock acquisition.
4. Index one valid and one syntactically invalid source in the same run; assert the valid node persists and the invalid file is reported/counts correctly.
5. Inject a `GraphStore` infrastructure failure during the atomic session and assert the whole indexing run rejects and no generation becomes readable.
6. Strengthen `IndexProjectGraph`'s unit assertion to compare the full forwarded options object, including `projectRoot`, copied workspaces, `graphConfig`, `codeGraphVersion`, and optional omission semantics.

## Spec Dependency Chain

The merged change context was loaded with direct dependencies at depth 1 plus rules and constraints. No contradiction was found.

- `core:fs-change-repository` → `default:_global/architecture`, `core:composition`, `core:storage`, `core:change-list-entry`, `core:change-repository-port`.
- `core:change-repository-port` → `default:_global/architecture`, `core:repository-port`, `core:change`, `core:read-only-change-view`, `core:drafted-change-view`, `core:discarded-change-view`, `core:storage`, and related error/layout contracts surfaced by the compiled context.
- `code-graph:indexer` → `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:document-model`, `code-graph:sqlite-graph-store`, `core:spec-repository-port`, `core:get-spec-metadata`, and global architecture/conventions.
- `code-graph:index-project-graph` → `code-graph:composition`, `code-graph:indexer`, `code-graph:graph-store`, `core:config`.

Consistency conclusions:

- The core port remains application-layer and backend-neutral; filesystem concerns stay in infrastructure and construction stays in composition.
- Change list rows and bucket ordering agree with `core:change-list-entry` and `core:storage`.
- Index execution remains adapter/store neutral, uses atomic store sessions, and does not duplicate provider lifecycle ownership.
- Forced logical reindex is distinct from physical storage recreation, matching both `code-graph:graph-store` and `code-graph:composition`.

## Numeric Summary

| Metric                          | Count |
| ------------------------------- | ----: |
| Specs audited                   |     4 |
| Distinct requirements reviewed  |    68 |
| Verification scenarios reviewed |   211 |
| Focused tests executed          |   144 |
| Focused tests passed            |   144 |
| Product-code discrepancies      |     0 |
| Critical findings               |     0 |
| High findings                   |     0 |
| Medium test-evidence gaps       |     3 |
| Low test-evidence gaps          |     1 |
| Recommended missing tests       |     6 |

**Batch verdict:** PASS WITH TEST-GAP ADVISORIES. The four implementations conform to the merged specs and direct dependency contracts on inspected evidence; no lifecycle-blocking implementation or semantic-spec issue was found.
