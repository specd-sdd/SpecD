# Code Graph compliance audit — current remediation

Scope: the 13 requested Code Graph specs in change `implementation-review-symbol-resolution`. All 13 effective specs were freshly loaded through `changes spec-preview`; graph-first searches located the current resolver, affected-closure, health, store and index-result implementations before focused source/test inspection.

Focused verification completed with exit code 0: **45 test files / 571 tests passed** across resolver, adapters, traversal, health, freshness, fingerprints, workspace indexing, provider, SQLite and index integration. The wrapper still emitted the known post-run `ERR_IPC_CHANNEL_CLOSED` diagnostic after all reported suites passed; it did not report a failed assertion.

## Requirements Summary

| Spec                       | Effective requirements | Implemented | Partial | Missing |
| -------------------------- | ---------------------: | ----------: | ------: | ------: |
| `resolve-symbol-reference` |                      8 |           8 |       0 |       0 |
| `symbol-model`             |                      5 |           5 |       0 |       0 |
| `language-adapter`         |                      6 |           6 |       0 |       0 |
| `traversal`                |                      2 |           2 |       0 |       0 |
| `composition`              |                      2 |           2 |       0 |       0 |
| `graph-store`              |                      5 |           5 |       0 |       0 |
| `indexer`                  |                      4 |           4 |       0 |       0 |
| `staleness-detection`      |                      5 |           5 |       0 |       0 |
| `sqlite-graph-store`       |                      1 |           1 |       0 |       0 |
| `ladybug-graph-store`      |                      1 |           1 |       0 |       0 |
| `get-graph-health`         |                      3 |           3 |       0 |       0 |
| `workspace-integration`    |                      1 |           1 |       0 |       0 |
| `index-project-graph`      |                      1 |           1 |       0 |       0 |
| **Total**                  |                 **44** |      **44** |   **0** |   **0** |

## Implementation Status

### `code-graph:resolve-symbol-reference` — IMPLEMENTED (8/8)

- Structured workspace/text/file/surface/space/kind/owner/member/build-context inputs are preserved; canonical logical IDs use length-prefixed fields and round-trip without ad hoc syntax splitting.
- Logical declarations, overload/merge grouping, public and lexical bindings, deterministic declaration→public→local→hierarchy precedence, stable candidate ordering and bounded cycle-safe evidence paths are implemented.
- The four statuses are conservative. Fresh complete file absence yields `missing`; stale, unknown or incomplete evidence yields `unresolved` with stable reasons.
- Candidate freshness batching is complete: addressed files and all candidate declaration files form one deduplicated `AssessIndexedResourceFreshness` request; candidate selection checks freshness and coverage before resolved/ambiguous output.
- **Build-context gate is remediated.** If a request supplies `buildContext` and any candidate/addressed coverage lacks `buildContext`, resolution returns `BUILD_CONTEXT_UNSUPPORTED`. Unit tests cover both candidate and absence paths.
- Batch execution shares one health snapshot and batched store lookups. The implementation is backend-neutral and deterministic; direct resolver-result parity between SQLite and Ladybug remains a useful missing test, not a demonstrated implementation discrepancy.

### `code-graph:symbol-model` — IMPLEMENTED (5/5)

- Logical symbols, declaration occurrences, structured identities, symbol spaces, member forms, bindings/provenance and terminal coverage facts are first-class immutable vocabulary.
- Complete construct and exact selection ranges are validated half-open ranges, preserve location-based symbol IDs and round-trip through storage/search.
- Compact file-analysis/session state and indexed lookup structures avoid retaining parser trees and support in-memory relation construction.

### `code-graph:language-adapter` — IMPLEMENTED (6/6)

- Each built-in adapter declares only the semantic subset it proves. TS and Go now correctly advertise `buildContext: false`; Python/PHP remain false.
- Specs accurately delimit the implemented TS/JS, Python, Go and PHP syntax/package/hierarchy subset and explicitly classify advanced project/build semantics as unsupported.
- Every built-in adapter emits parser-authoritative construct/selection ranges and common reference facts. Tests cover capability declarations, bindings/imports, directly provable hierarchy and ranges.
- Unsupported build-context facts are no longer guessed because the resolver consumes persisted capability coverage.

### `code-graph:traversal` — IMPLEMENTED (2/2)

- Canonical-target and exact-public-binding impact remain separate, deterministic and cycle-safe.
- File/multi-file impact performs two batched reverse coverage lookups, preserves file-only coverage, deduplicates all evidence and assigns deterministic minimum depths.

### `code-graph:composition` — IMPLEMENTED (2/2)

- Provider owns resolution, impact and authoritative unified multi-category search under lifecycle/availability checks.
- Code Graph owns expansion, semantic/content lanes, occurrence verification, symbol-range suppression, logical grouping/ranking, page refill and final limits; CLI does not reproduce orchestration.
- Public contracts/value objects are curated while concrete resolver/backend implementation remains internal.

### `code-graph:graph-store` — IMPLEMENTED (5/5)

- Reference facts, declaration/binding/provenance/coverage lookups, source-content candidates, observations/latches and atomic bulk sessions are present.
- `getAllReferenceFacts` supports compact incremental hydration. `findDirectlyAffectedFiles(filePaths)` is a batch port operation; SQLite uses one set-based query and Ladybug a bounded fixed relation-family query set, avoiding per-symbol N+1 traversal.
- Shared contracts cover deterministic reference snapshots, affected lookup, reverse coverage, freshness CAS, source paging, single search-index step, commit and rollback.
- Ordinary incompatible reads reject; indexing-specific recreate rotates generation.

### `code-graph:indexer` — IMPLEMENTED (4/4)

- Reference/coverage/content/range indexing, incompatible rebuild, atomic observation capture and one bulk-session persistence are implemented.
- **Content freshness caches are remediated.** Source diff uses persisted mtime/size to reuse hashes; changed/no stamp hashes authoritative content. Coverage-only unsupported targets contribute stored hashes and deletion membership. Equal content remains unchanged.
- **No-op behavior is remediated.** A fully unchanged run analyzes no files, builds no dependency/adapter relations, passes `rebuildSearchIndexes: false`, reports zero search metric, and does not call `writeReferenceFacts`; public bindings remain byte-for-byte equivalent after no-op.
- **Changed-file affected closure is remediated.** Persisted compact reference facts hydrate unchanged declarations/bindings. `collectAffectedFileClosure` expands changed/deleted seeds transitively using one batch `findDirectlyAffectedFiles` per frontier plus reverse public/local provenance. The regression proves only target+importer are re-extracted while an unrelated file/node/symbol remains persisted.
- **D1 is resolved.** Newly added targets participate in closure seeds. Because native stores correctly reject relations to absent endpoints, a run containing `newFiles` additionally uses existing code files as conservative candidates; this fallback is addition-only. Changed/deleted/no-op runs retain the precise persisted-edge closure. Existing candidate files are re-extracted for semantic correctness but remain counted as skipped/unchanged content, while only genuinely new/changed inputs increment `filesIndexed`.
- The updated indexer spec and verify artifact explicitly describe this native-store constraint and addition-only fallback. A native SQLite integration regression indexes an importer while its target is absent, adds the target, reports `filesIndexed: 1` / `filesSkipped: 2`, and proves the importer relation exists afterward. Together with the in-memory extraction-spy regression, this covers both scope and native correctness.
- Retained reference facts outside replaced paths are hydrated and merged with re-extracted facts; changed-file coverage relations are preserved. Store replacement is scoped to explicit full rebuilds rather than ordinary semantic refreshes.
- **Phase metrics are remediated.** Backend `search-indexes` callback marks the exact boundary; persistence includes staging and non-search commit, FTS duration covers only the search step, and no-rebuild reports `{count: 0, durationMs: 0}`.
- `IndexResult.fullRebuild` is now direct and accompanies the stable reason for force/fingerprint/schema flows.

### `code-graph:staleness-detection` — IMPLEMENTED (5/5)

- Canonical health composes VCS ref, content, derivation, schema/generation and persisted coverage with stale-over-unknown precedence.
- Excluded/unsupported are visible terminal outcomes but do not alone make aggregate coverage incomplete; parse-failed/partial do. Targeted absence still treats unsupported/excluded as inconclusive.
- Batch resource freshness uses persisted observations: equal stamps avoid reads, stamp changes hash, equal hashes refresh cache, different/missing content sets guarded monotonic stale flags/latches, and transient failures remain unknown.
- VCS scopes share normalized modified-path evaluation and graph visibility; non-VCS membership and hybrid behavior are implemented. Package/build manifests and Code Graph version participate in non-absolute derivation fingerprints.

### `code-graph:sqlite-graph-store` — IMPLEMENTED (1/1)

- Schema 8 persists all required reference/range/freshness/compact facts, trigram source FTS and coverage.
- Reference/affected/reverse-coverage lookups are set-based; large observation requests are batched; inserts are bounded multi-row operations inside one transaction; FTS rebuild is conditional and occurs once.
- Incompatible schema read rejection and indexing repair are covered.

### `code-graph:ladybug-graph-store` — IMPLEMENTED (1/1)

- Schema 12 provides equivalent semantic/range/freshness/source-search surfaces, full reference snapshots and batch affected lookup.
- One bulk session/transaction uses bounded CSV COPY and at most one conditional FTS rebuild. Generation recreation and schema/reference/source candidate behavior are tested.

### `code-graph:get-graph-health` — IMPLEMENTED (3/3)

- Aggregate/workspace tri-state projection, monotonic latch short-circuit, repository grouping, visibility filtering and semantic-cache-only mutation are implemented.
- Persisted coverage produces deterministic by-status/reason summaries with correct terminal/incomplete semantics.
- Aggregate state now composes VCS, content, fingerprint, coverage, schema and generation; derivation/coverage failures cannot coexist with `current`.

### `code-graph:workspace-integration` — IMPLEMENTED (1/1)

- Structured workspace/module/package/public-surface identity avoids global same-name inference and preserves language case/visibility.
- Resolution manifests/configuration are hashed by normalized project-relative locator and content, so deterministic package/project/autoload changes invalidate derivation without exposing absolute roots.

### `code-graph:index-project-graph` — IMPLEMENTED (1/1)

- Indexing-only schema repair recreates incompatible storage, rotates generation and delays readiness until committed indexes are ready; normal reads do not repair.
- `IndexResult` now exposes direct `fullRebuild: boolean` and `fullRebuildReason`. Force integration asserts both; SDK/CLI can forward rather than reconstruct truth.

## Discrepancies

No high, medium or low implementation discrepancies remain in the audited scope.

### Resolved finding traceability: D1

The earlier D1 correctly observed that SQLite/Ladybug cannot retain `IMPORTS` edges to absent File endpoints, so merely adding `newFiles` as persisted-edge closure seeds was insufficient. The final implementation addresses that exact native-store premise without weakening precise common-case incrementality:

- if `newFiles.length > 0`, existing code files are added as conservative affected candidates because an addition may satisfy previously unresolved imports or routes;
- if the run contains only changed/deleted files, closure remains the precise transitive persisted importer/relation/hierarchy/public-route closure;
- if the run is a no-op, no fallback, extraction, relation construction, reference-fact write or FTS rebuild occurs;
- conservative candidate extraction does not classify unchanged content as newly indexed.

The indexer spec and verify scenario now state this addition-only fallback explicitly. The native SQLite integration test reproduces the former failure mode and proves the final relation plus accurate counts. Therefore D1 is resolved rather than waived.

## Test Coverage

Strong coverage exists for all prior remediation points: candidate declaration freshness batching; build-context rejection; statuses/precedence; adapter capability/ranges; unified search; covering specs; coverage health; fingerprint manifests; mtime/hash cache; no-op zero semantic/FTS/reference writes; changed-file transitive closure; addition-only native fallback; batch affected lookup; exact phase boundary; direct full rebuild; SQLite schema/bulk/FTS; Ladybug schema/reference/source behavior.

The current wrapper reported 571 passing tests. The final focused re-audit ran workspace indexing plus native SQLite integration: **2 files / 24 tests passed**. The native regression confirms missing-target addition repair, while the in-memory regression verifies extraction scope.

### Missing or insufficient tests

1. Add a target that changes same-name ambiguity or package/public-binding selection without an existing resolved edge.
2. Execute the same non-trivial resolver batch against SQLite and Ladybug and compare full ordered status/reasons/candidates/provenance.
3. Exercise repository-revision observations and a genuine non-VCS/hybrid workspace end-to-end; current focused freshness tests emphasize filesystem files and VCS grouping.
4. Assert phase persistence/FTS separation on Ladybug as an explicit integration, supplementing the shared callback/result contract and SQLite path.

## Dependency and Global Consistency

- Global architecture: respected. Domain/application code consumes store/host/VCS ports; persistence and FTS remain infrastructure; provider owns lifecycle/repair.
- Global error handling: respected. Busy/stale-generation errors propagate; normal reads reject incompatibility; transient freshness failures remain unknown rather than destructive.
- `symbol-model` → `language-adapter`/`graph-store` → `resolve-symbol-reference`: consistent after build-context gating and candidate freshness remediation.
- `resolve-symbol-reference` → `traversal` → `composition`: deterministic conservative results and authoritative search/impact orchestration align.
- `graph-store` + `indexer` + `get-graph-health` → `staleness-detection`: cache/latch/coverage/fingerprint and incremental-equivalence contracts align after the addition-only native fallback.
- `composition` + `indexer` + `graph-store` → `index-project-graph`: repair/generation/result contracts now align.

## Counts and Conclusion

- Requirements reviewed: **44**
- Fully implemented: **44**
- Partially implemented: **0**
- Missing: **0**
- Discrepancies: **0 high**, **0 medium**, **0 low**
- Non-blocking additional test opportunities: **4**

**COMPLIANT.** All 44 effective requirements are implemented in the audited Code Graph scope. The prior D1 native-backend gap is closed by the spec-aligned addition-only conservative fallback and a passing SQLite integration regression; changed/deleted/no-op runs retain their precise optimized behavior.
