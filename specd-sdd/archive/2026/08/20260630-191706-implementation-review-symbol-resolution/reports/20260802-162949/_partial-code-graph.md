# Fresh Code Graph compliance audit

Scope: the 13 requested `code-graph` specs in change `implementation-review-symbol-resolution`. All specs were freshly loaded through `node packages/cli/dist/index.js changes spec-preview`; graph-first searches located the current resolver, health and indexing implementations. Focused verification ran the Code Graph test wrapper successfully: **45 files / 568 tests passed**, including resolver, health, fingerprints, workspace indexing, SQLite, integration and adapter suites.

## Requirements Summary

| Spec                       | Effective requirements | Implemented | Partial | Missing |
| -------------------------- | ---------------------: | ----------: | ------: | ------: |
| `resolve-symbol-reference` |                      8 |           7 |       1 |       0 |
| `symbol-model`             |                      5 |           5 |       0 |       0 |
| `language-adapter`         |                      6 |           5 |       1 |       0 |
| `traversal`                |                      2 |           2 |       0 |       0 |
| `composition`              |                      2 |           2 |       0 |       0 |
| `graph-store`              |                      5 |           5 |       0 |       0 |
| `indexer`                  |                      4 |           3 |       1 |       0 |
| `staleness-detection`      |                      5 |           5 |       0 |       0 |
| `sqlite-graph-store`       |                      1 |           1 |       0 |       0 |
| `ladybug-graph-store`      |                      1 |           1 |       0 |       0 |
| `get-graph-health`         |                      3 |           3 |       0 |       0 |
| `workspace-integration`    |                      1 |           1 |       0 |       0 |
| `index-project-graph`      |                      1 |           0 |       1 |       0 |
| **Total**                  |                 **44** |      **40** |   **4** |   **0** |

## Per-spec Implementation Status

### `code-graph:resolve-symbol-reference` — PARTIAL (7/8)

- Structured, delimiter-safe canonical references; language-sensitive case; logical targets/declaration occurrences; independent public/local bindings; exact/public/local/hierarchy precedence; deterministic outcomes; `missing` only for current complete addressed evidence; and cycle-safe batch resolution are implemented.
- **CG-1 is fixed.** `executeBatch` now unions explicitly addressed files with every candidate declaration file, deduplicates them into one `AssessIndexedResourceFreshness` call, loads their coverage in one batch, and `candidateEvidenceIssue` converts stale/unknown/incomplete evidence to `unresolved`. The new test verifies two requests share one freshness batch and a dirty contributing declaration yields `CONTENT_HASH_CHANGED`.
- Remaining partial: `ResolveSymbolReferenceInput.buildContext` is never consumed, and candidate coverage checks only `status === indexed`, not whether the declaration coverage capabilities can prove the supplied build-context/member/public-binding constraint. A request carrying unsupported build context can still resolve from ordinary indexed facts (R1).
- Backend-neutral queries and deterministic sorting are present. Full SQLite/Ladybug resolver-result parity is not directly tested (test gap T1), although the shared store contract lowers implementation risk.

### `code-graph:symbol-model` — IMPLEMENTED (5/5)

- Logical symbols, declarations, binding identities, symbol spaces/member forms, terminal coverage vocabulary, compact runtime analysis and run-scoped lookups are present.
- Construct/selection ranges use validated half-open coordinates, preserve the location-based ID, round-trip through stores and are parser-authoritative in every built-in adapter test.

### `code-graph:language-adapter` — PARTIAL (5/6)

- The spec now accurately narrows each built-in language to implemented syntax and explicitly classifies advanced TS config/package conditions, Python `__all__`/namespace/MRO, Go workspace/replace/build tags, and PHP classmap/trait conflict semantics as unsupported.
- **Old CG-2 breadth mismatch is fixed at the spec/flag level.** TypeScript and Go now advertise `buildContext: false`; Python/PHP already do. Adapter tests assert these values and the supported binding/import/hierarchy/range subset.
- Remaining partial: capability absence is persisted as a list of enabled capability names on an otherwise `indexed` coverage fact. The resolver does not compare a request's constraints/build context with that capability list. Thus “unsupported coverage rather than guessed” is not enforced at the final proof boundary (R1).

### `code-graph:traversal` — IMPLEMENTED (2/2)

- Canonical/public-binding impact views remain separated and deterministic.
- File/multi-file impact batches reverse `COVERS_FILE`/`COVERS_SYMBOL`, preserves file-only evidence, assigns shallowest depth, deduplicates and sorts covering specs. Tests verify constant batch-read count and overlapping multi-file inputs.

### `code-graph:composition` — IMPLEMENTED (2/2)

- Provider owns single/batch resolution, canonical/binding impact, unified multi-category search and lifecycle/availability enforcement.
- Code Graph, not CLI, owns query expansion, semantic/content lanes, exact occurrences, selection-range suppression, page refill, logical grouping/ranking and final limits. Public types are curated; concrete resolver/store internals remain private.

### `code-graph:graph-store` — IMPLEMENTED (5/5)

- Semantic references, declarations/bindings/provenance/coverage, deterministic indexed lookups, batched reverse coverage, source-content candidates, input observations/latches and one atomic bulk session are implemented.
- Contract tests cover range/reference/freshness persistence, compare-and-set mutations, rollback, relation deduplication, bounded candidate paging and reverse coverage.
- Incompatible ordinary reads reject; indexing repair recreates derived state and rotates generation.

### `code-graph:indexer` — PARTIAL (3/4)

- Reference facts, terminal coverage outcomes, persisted source content/ranges, observations and logical `COVERS_SYMBOL` relations are produced atomically.
- Coverage-backed diff is implemented: `existingArtifactHashes` includes persisted coverage-only targets, and deletion candidates union Files, Documents and coverage paths. Non-text unsupported targets therefore participate in new/changed/deleted diff even without a node. A direct modified-binary regression test is still missing (T2).
- mtime/size fast path is implemented for observed File/Document resources. Matching stamps reuse the persisted indexed hash; changed stamps hash content. The unchanged test changes only mtime, proves equal content is skipped, semantic phase counts remain zero and FTS rebuild is not called.
- Fully unchanged generations set `rebuildSearchIndexes: false`; SQLite, Ladybug and compatibility sessions honor it. No files are analyzed and no dependency/adapter relations are built. Reference facts are written only for an initial/semantic-refresh generation, so a no-op does not replace them with the empty hydrated snapshot. The regression test compares public bindings before/after the no-op, and the real E2E retained canonical logical-symbol ranking. This satisfies the new unchanged-generation and reference-fact preservation requirements.
- Phase metric fields now exist for all required phases and integration tests assert them, but persistence/search-index timings are not accurately separated: staging time is recorded as `persistence`, while the entire transactional `commit` (cleanup, inserts, observations, relations, metadata and optional FTS) is recorded as `searchIndexRebuild`. When rebuild is disabled, commit time is still assigned to that metric (R3).
- **Old CG-5 remains materially open:** after any new/changed/deleted input on a previously covered graph, `semanticRefreshRequired` makes `filesToProcess = allDiscoveredPaths` and `replaceCodeGraph = true`. This reparses every visible source/document instead of only the changed files plus deterministic dependent closure (R2).

### `code-graph:staleness-detection` — IMPLEMENTED (5/5)

- **CG-3 is fixed.** Health reads all persisted coverage, exposes deterministic totals/status/reasons and makes only `parse-failed`/`partial` aggregate-incomplete.
- Terminal coverage semantics are correct: `excluded` and `unsupported` remain visible but do not alone make aggregate health non-current; targeted resolution still treats them as inconclusive for absence.
- Monotonic workspace/global latches, tri-state precedence, batch resource freshness, mtime/size fast path, hash refresh, VCS grouping/visibility filtering, non-VCS membership and hybrid assessment are implemented.
- **CG-4 is fixed.** derivation fingerprints now hash normalized project-relative package/build inputs (`package.json`, ts/js configs, Python manifests, `go.mod/go.work`, Composer), and parameterized tests prove manifest changes invalidate workspace fingerprints.
- Code Graph version remains an independent derivation input.

### `code-graph:sqlite-graph-store` — IMPLEMENTED (1/1)

- Schema 8 persists all semantic/range/freshness facts, trigram source FTS, bounded short-query fallback and set-based reverse coverage.
- One transaction uses bounded multi-row inserts, guarded relation endpoints and at most one conditional FTS rebuild. Large freshness batches stay below SQLite expression limits; incompatible schema repair is tested.

### `code-graph:ladybug-graph-store` — IMPLEMENTED (1/1)

- Schema 12 implements equivalent semantic/range/freshness/source-search surfaces, one session/transaction, bounded CSV `COPY`, conditional one-time FTS rebuild and generation rotation.
- Shared store contracts plus focused Ladybug schema/reference/source-query tests cover the backend contract. Resolver-level parity remains a missing explicit test (T1).

### `code-graph:get-graph-health` — IMPLEMENTED (3/3)

- Coverage summary is now persisted-fact-backed, with stable by-status counts/reasons and correct terminal/incomplete semantics.
- **CG-6 is fixed.** `aggregateCanonicalHealth` composes content, VCS ref, fingerprint, coverage, schema and generation using stale-over-unknown precedence. Tests assert derivation mismatch yields aggregate `stale` and incomplete coverage never yields current.
- Aggregate latch short-circuit, repository grouping, excluded-only VCS filtering, non-absolute workspace projections and semantic-cache-only mutations remain compliant.

### `code-graph:workspace-integration` — IMPLEMENTED (1/1)

- Structured workspace/package/public-surface identity and no global same-name fallback remain in place.
- Package/build resolution inputs now participate in fingerprints using non-absolute normalized paths and content hashes, closing CG-4.

### `code-graph:index-project-graph` — PARTIAL (0/1)

- Indexing-only incompatible-store repair, destructive recreate, storage-generation rotation, readiness after commit/FTS, and stable reasons are implemented and integration-tested.
- The direct Code Graph `IndexResult` reports `fullRebuildReason` but has no `fullRebuild: boolean`, despite the requirement that the result report **whether** a full rebuild occurred. SDK reconstructs the boolean from repair/force, but `IndexProjectGraph.execute` itself returns the incomplete Code Graph shape; derivation mismatch also has only a reason string (R4).

## Discrepancies

### R1 — HIGH — unsupported capabilities/build context are not gated at resolution

Evidence: adapters correctly return `buildContext: false`; index coverage persists only enabled capability names; `candidateEvidenceIssue` checks freshness and terminal coverage status but not `coverage.capabilities`; `buildContext` is present in input but unused. A build-context-constrained request can therefore resolve from facts whose adapter explicitly cannot prove that context.

Spec-vs-code possibilities: implementation should map request constraints to required capabilities and return an unsupported-coverage reason, or the specs must explicitly state that callers—not `ResolveSymbolReference`—gate capability constraints. The current specs place that duty on the resolver/index coverage boundary.

### R2 — HIGH — one semantic edit reparses the whole visible project

Evidence: with existing coverage and any new/changed/deleted path, `semanticRefreshRequired` becomes true and `filesToProcess` is assigned `allDiscoveredPaths`; the store then replaces the entire code/document subgraph. This violates the explicit MUST NOT turn every content edit into whole-project semantic re-analysis.

Spec-vs-code possibilities: implement the declared affected closure and patch derived relations, or revise the spec to permit full re-analysis. Given the reported usability/performance motivation, the code is the likely defect.

### R3 — MEDIUM — phase timing labels do not measure their named phases

Evidence: `persistence.durationMs` stops before `writeSession.commit`; `searchIndexRebuild.durationMs` measures all of commit, which performs cleanup, every insert, metadata/latches and optional FTS. A no-rebuild commit still accumulates search-index duration.

Spec-vs-code possibilities: expose backend commit phase callbacks/timings or split persistence vs FTS in the store result; alternatively rename the metrics to staging/commit, but that would not satisfy the current spec.

### R4 — MEDIUM — direct Code Graph index result lacks the rebuild boolean

Evidence: `IndexResult` contains `fullRebuildReason` only. `IndexProjectGraph.execute` returns it unchanged. `RunIndexProjectGraphResult` in SDK adds a boolean, but the audited Code Graph requirement is on `IndexProjectGraph`.

Spec-vs-code possibilities: add `fullRebuild` to `IndexResult`, or amend the Code Graph spec so only the SDK orchestration result owns the boolean.

## Old Finding Recheck

| Old finding                            | Status                 | Evidence                                                                                    |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| CG-1 declaration-file freshness        | **Resolved**           | one deduplicated candidate/addressed-file batch plus candidate gate/test                    |
| CG-2 language breadth/capability flags | **Partially resolved** | spec narrowed and flags corrected; final capability gate remains R1                         |
| CG-3 health coverage                   | **Resolved**           | persisted summary, terminal semantics, incomplete-state tests                               |
| CG-4 resolution-input fingerprint      | **Resolved**           | manifest discovery/content hashes and parameterized invalidation tests                      |
| CG-5 incremental closure/progress      | **Partially resolved** | unchanged fast path and fields added; global reanalysis R2 and inaccurate timings R3 remain |
| CG-6 aggregate canonical state         | **Resolved**           | canonical aggregation across VCS/fingerprint/coverage/content                               |

## Test Coverage

Strong direct coverage exists for candidate freshness batching, all four statuses, structured canonical references, adapter ranges/capabilities, search orchestration/suppression/page refill, covering specs, terminal coverage health, fingerprint manifests, unchanged no-FTS behavior plus semantic-reference preservation, phase metric presence, SQLite bulk/schema/FTS, Ladybug schema/reference/source candidates and incompatible-store repair.

The focused/current suite passed 568 tests. Architecture remains port-driven and ordinary read errors/rebuild ownership remain consistent with global architecture and error-handling conventions.

## Missing Tests

- **T1:** Run the same non-trivial resolution batch (public/local/hierarchy, cycle, ambiguity, dirty candidate) against SQLite and Ladybug and compare complete ordered status/reasons/candidates/provenance.
- **T2:** Modify and delete a coverage-only non-text unsupported file between runs and assert changed/deleted diff behavior without a File/Document node.
- **T3:** Supply `buildContext` to an adapter advertising `buildContext: false`; assert `unresolved` with stable unsupported-capability reason.
- **T4:** Change one source in a large fixture and assert adapter analysis is invoked only for the changed file plus proven dependent closure, never all visible files.
- **T5:** Assert backend-reported persistence and FTS timings independently, including exactly zero FTS count/duration when rebuild is disabled.
- **T6:** Assert direct `IndexProjectGraph` results expose `fullRebuild` for force, schema incompatibility, derivation mismatch and ordinary incremental runs.

## Spec Dependency Chain

- Global architecture/error handling: respected—domain/application depend on ports, infrastructure owns storage, provider owns lifecycle/repair, and busy/stale-generation failures propagate.
- `symbol-model` → `language-adapter`/`graph-store` → `resolve-symbol-reference`: structurally complete, but R1 leaves unsupported capability proof unsafe.
- `resolve-symbol-reference` → `traversal` → `composition`: deterministic provider/traversal/search orchestration is intact.
- `graph-store` + `indexer` + `get-graph-health` → `staleness-detection`: terminal coverage, latches, targeted freshness and fingerprints now align; R2/R3 are index performance/observability defects, not health defects.
- `composition` + `indexer` + `graph-store` → `index-project-graph`: repair execution works, but R4 leaves the direct result contract incomplete.

## Summary

- Requirements reviewed: **44**
- Fully implemented: **40**
- Partial: **4**
- Missing: **0**
- Discrepancies: **4** — **2 high**, **2 medium**, **0 low**
- Missing targeted test groups: **6**

## Conclusion

**NOT COMPLIANT.** The major freshness, coverage-health, terminal-coverage, fingerprint and unchanged-index regressions were successfully remediated, but two high-severity contract violations remain: unsupported build-context/capability requests can still be proven, and any semantic edit still triggers whole-project re-analysis. The phase metrics and direct rebuild-result shape also remain incomplete.
