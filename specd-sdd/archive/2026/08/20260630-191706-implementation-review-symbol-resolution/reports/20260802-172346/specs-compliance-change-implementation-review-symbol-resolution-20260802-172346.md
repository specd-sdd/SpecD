# Specs compliance — implementation-review-symbol-resolution

- Audit date: 2026-08-14
- Change: `implementation-review-symbol-resolution`
- Overall conclusion: **COMPLIANT**
- Material discrepancies: **0 high, 0 medium, 0 low**
- Code Graph assigned requirements: **44/44 implemented**
- CLI/SDK/Core VCS assigned requirements: **84/84 conformant**
- Verification structure: **266 requirements, 772 scenarios, 0 uncovered requirements**

The final sequential matrix passed lint, typecheck, build, and tests for Core, Code Graph, SDK, and CLI. Code Graph emitted only the known post-pass worker IPC shutdown diagnostic while its wrapper exited successfully. The three independent audit partials are reproduced verbatim below.

## Detailed findings — \_partial-codegraph.md

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

## Detailed findings — \_partial-hosts-vcs.md

# Partial compliance review — CLI/SDK hosts and Core VCS

## Scope and result

Reviewed the implementation against the current projected requirements for these 11 specs:

- `cli:change-implementation`
- `cli:graph-impact`
- `cli:graph-search`
- `cli:change-status`
- `cli:graph-index`
- `cli:graph-stats`
- `sdk:build-implementation-review`
- `sdk:composition`
- `sdk:run-index-project-graph`
- `core:vcs-adapter-port`
- `core:vcs-implementation-detector`

The review used `project status --context --graph`, graph-first symbol inspection, `changes spec-preview` for every assigned spec, direct implementation/test inspection, and focused Vitest execution.

**Strict result: FULLY COMPLIANT.** All **84 projected requirements conform**; there are **0 partial** and **0 non-conformant** requirements. A focused re-audit of graph-index host composition against the merged projection resolved the sole earlier finding.

| Spec                               | Requirements | Conformant | Partial | Non-conformant |
| ---------------------------------- | -----------: | ---------: | ------: | -------------: |
| `cli:change-implementation`        |            9 |          9 |       0 |              0 |
| `cli:graph-impact`                 |            9 |          9 |       0 |              0 |
| `cli:graph-search`                 |            7 |          7 |       0 |              0 |
| `cli:change-status`                |           13 |         13 |       0 |              0 |
| `cli:graph-index`                  |            6 |          6 |       0 |              0 |
| `cli:graph-stats`                  |            6 |          6 |       0 |              0 |
| `sdk:build-implementation-review`  |            5 |          5 |       0 |              0 |
| `sdk:composition`                  |            7 |          7 |       0 |              0 |
| `sdk:run-index-project-graph`      |            5 |          5 |       0 |              0 |
| `core:vcs-adapter-port`            |           12 |         12 |       0 |              0 |
| `core:vcs-implementation-detector` |            5 |          5 |       0 |              0 |
| **Total**                          |       **84** |     **84** |   **0** |          **0** |

## Re-audit of graph-index host composition

The merged `cli:graph-index` projection requires the worker/bypass path to obtain an `SdkHostContext` through the shared SDK composition boundary while preserving already-resolved CLI state. Specifically, configured mode must reuse the exact resolved kernel without reloading configuration or creating a parallel kernel, and bootstrap mode must create the equivalent SDK context from the explicit resolved bootstrap config.

The implementation conforms:

1. `resolveGraphCliContext` produces the single resolved `{ config, kernel }` state.
2. `index-graph.ts:99` passes those exact values to `resolveSdkHostContext(config, kernel)` before calling `runIndexProjectGraph`.
3. In configured mode, `resolveSdkHostContext` returns the same kernel reference and a provider factory closed over the same config (`packages/cli/src/helpers/sdk-host.ts:21-25`). It neither reloads config nor constructs another kernel.
4. In bootstrap mode, where the resolved kernel is `null`, it calls `createSdkContext` with the already-resolved bootstrap config (`packages/cli/src/helpers/sdk-host.ts:27`). This preserves explicit `--path`/fallback bootstrap semantics rather than rediscovering a different configured project.

The merged verification scenarios are covered by command tests asserting `resolveSdkHostContext(config, kernel)` in configured mode and `resolveSdkHostContext(config, null)` for explicit bootstrap mode. The focused graph-index suite passes all 9 tests. Requiring the helper name `openSpecdHost` here would contradict the resolved-state reuse obligation because that bootstrap API loads configuration and builds a new kernel; the contract is the `SdkHostContext` boundary and state identity, not a specific bootstrap helper.

## Confirmed implementation coverage

### CLI implementation review and status

- `change implementation list`, mutation commands, and `change status` share the SDK-owned reviewed implementation projection rather than reconstructing divergent CLI views.
- The integration suite confirms list, review, and status return the same immutable reviewed projection after mutations.
- Structured formats preserve the authoritative projection and text output renders its state consistently.

### Graph search and impact

- The CLI builds one search request and delegates search planning, ranking, file-result suppression, and result limits to Code Graph; it does not reproduce orchestration policy in the command layer.
- Symbol, file, document, and spec result modes and their formatting remain covered.
- Impact commands preserve symbol/file resolution, dependency direction, depth, workspace qualification, and structured output behavior.

### Graph index

- The normal parent path acquires the shared index lock and spawns a child using the current Node executable and CLI argv.
- Worker environment markers prevent recursive spawning and identify the already-held lock.
- Standard I/O is inherited, signals are forwarded, signal exits are mapped, child exit status is propagated, and the lock is released.
- Worker bypass and worker execution delegate indexing to `runIndexProjectGraph` and preserve phase metrics and full-rebuild reporting.
- Configured execution reuses the exact resolved config and kernel, while bootstrap execution creates its SDK context from the explicit resolved bootstrap config without implicit rediscovery.

### Graph stats and freshness presentation

- Stats uses one provider lifecycle and one health evaluation.
- Text output exposes health state, global/workspace latch state, content/coverage/schema/generation dimensions, and reason codes.
- JSON/TOON output preserves additional stats fields rather than narrowing the SDK/provider result.
- Downstream Code Graph coverage confirms the global stale latch, VCS candidate evaluation, and filesystem `mtime`/size/hash fallback used for non-VCS workspaces.

### SDK composition and indexing

- `runIndexProjectGraph` now uses the shared `withOpenGraphProvider` lifecycle with the specialized `openForIndexing` operation.
- `withOpenGraphProvider` supports a typed alternate open operation while retaining before-open, after-close, close-on-failure, and caller-owned-provider semantics.
- Repair/full-rebuild information is combined with the provider result and explicit force input without discarding phase metrics.
- SDK composition/barrel exports include the required host and orchestration entry points.

### Core VCS port and detector

- Git, Mercurial, Subversion, and null adapters implement the port semantics for repository-relative changed paths and stable-reference discovery without embedding graph-specific policy.
- The implementation detector uses `refAt` when available, falls back through adapter stable-reference behavior, and retains rebase/generic exclusion policy at the Core boundary.
- Graph relevance filtering, including configured `excludePaths`, remains downstream of the VCS adapter; an excluded manifest returned by VCS therefore does not by itself make graph health stale.

## Focused verification

All focused suites passed:

| Area                                             | Test files |   Tests | Result   |
| ------------------------------------------------ | ---------: | ------: | -------- |
| SDK orchestration/composition/barrel             |          4 |      35 | Pass     |
| CLI assigned command behavior                    |          7 |      94 | Pass     |
| Core VCS composition/adapters/detector/barrel    |          5 |      32 | Pass     |
| Code Graph health/search/index/lock dependencies |          4 |      28 | Pass     |
| **Total**                                        |     **20** | **189** | **Pass** |

Commands were executed with Vitest against the focused source suites. The CLI run emitted only the existing schema-name warning (`@specd/schema-std@1` versus `schema-std@1`); it did not fail any test.

The graph-index suite was rerun after the merged spec/verify projection changed: **1 file, 9 tests, all passed**. This is a focused confirmation within the already-counted CLI suite, so it does not increase the unique 20-file/189-test totals above.

## Test gaps and residual risk

These are coverage gaps, not additional demonstrated compliance failures:

- The graph-index parent test proves successful worker execution and shared-lock ownership, but lacks isolated assertions for non-zero child exit propagation, SIGINT/SIGTERM forwarding and mapped exits, busy-lock exit/message behavior, spawn errors, exact-once release, and worker-mode prevention of nested spawn.
- The command suite verifies configured/bootstrap argument identity at the host-context boundary; the small `resolveSdkHostContext` helper itself has no separate focused unit suite, so its two branches are currently supported by code inspection and broader command behavior rather than direct branch-isolated tests.
- Cross-backend parity for all graph health/search behaviors is not exhaustively exercised by the focused suites; the reviewed abstractions preserve the intended boundary, but backend-wide confidence still depends on the broader repository suite.

## Conclusion

The assigned CLI, SDK, and Core VCS surface is fully compliant with the merged projected requirements: **84 of 84 conform**, and all focused tests are green. No material discrepancy remains. The listed test-hardening opportunities are residual coverage improvements, not observed requirement failures.

## Detailed findings — \_partial-crosscutting.md

# Cross-Cutting Compliance Audit

## Conclusion

**COMPLIANT.** Fresh read-only audit found no HIGH, MEDIUM, or LOW cross-cutting compliance finding. All 24 merged verification artifacts are structurally covered, proposal/design/tasks remain aligned with final spec vocabulary and ownership, implementation tracking has no open or unclassified file, global constraints are satisfied by current structure and the clean package matrix, and both previously identified artifact gaps are closed.

## Scope and counts

- Change: `implementation-review-symbol-resolution`
- Change state: `implementing`; artifact DAG complete and drift-free
- Artifact validation: 51/51 passed; 0 failed
- Verify artifacts: 24
- Verify requirements: 266
- Verify scenarios: 772
- Requirements without a scenario: 0
- Tasks: 168/171 checked; 3 unchecked lifecycle/completion tasks
- Implementation tracking: 136 files total; 120 resolved, 16 ignored, 0 open/removed/unclassified
- Implementation links: 127
- Symbol resolutions: 77 total; 71 resolved, 6 ambiguous, 0 unresolved, 0 missing
- Out-of-scope spec IDs: 0
- Graph: 1,067 indexed files, 263 documents, 36,358 symbols, 267 specs; current, content-fresh, coverage-complete, schema-compatible, generation-current; 0 parse failures and 0 partial files

## Findings

No HIGH, MEDIUM, or LOW findings.

### INFO-1 — Concurrent Core audit interference did not reproduce

Evidence: a Core test run launched concurrently with the other package suites produced one failure in `FsChangeRepository mutate unrelated changes do not block`, with an `ENOTEMPTY` cleanup/timing symptom. Immediate isolated rerun passed 195/195 files and 2,370/2,370 tests in 11.76 seconds. The canonical sequential run recorded immediately before this audit also passed 195 files and 2,370 tests. This is audit-induced concurrent temporary-directory interference, not a reproducible implementation failure.

Disposition: no implementation gap. Use the isolated/sequential result as final matrix evidence; retain the concurrent event in audit history.

### INFO-2 — Six explicitly ambiguous symbol links are conservative diagnostics

Evidence: six symbol links report `AMBIGUOUS_MULTIPLE_TARGETS`: `SymbolSpace`, `MemberForm`, and `IndexCoverageStatus`, each appearing twice. Each name has both value-space and type-space exports. The change contract requires ambiguity to be surfaced rather than guessing a candidate. All containing files are classified, no tracking link is open, and no affected spec is out of scope.

Disposition: compliant. Optional future traceability refinement could add symbol-space qualification, but current ambiguity is expected behavior, not incomplete implementation tracking.

### INFO-3 — Three unchecked tasks are lifecycle sequencing, not implementation omissions

Unchecked tasks are 20.7 (run verification/compliance), 20.8 (discard absorbed changes after successful verification), and 21.15 (rerun full matrix/compliance until clean). Implementation and remediation tasks preceding them are checked. This audit is evidence for 20.7/21.15; 20.8 is deliberately gated on successful lifecycle verification.

Disposition: no requirement or code gap. Do not treat the change as archive-ready until lifecycle owner completes these tasks and required transitions.

## Verification artifact coverage

| Spec                                  | Requirements | Scenarios |
| ------------------------------------- | -----------: | --------: |
| `cli:change-implementation`           |            9 |        20 |
| `code-graph:resolve-symbol-reference` |            8 |        16 |
| `sdk:build-implementation-review`     |            5 |         7 |
| `code-graph:symbol-model`             |           21 |        55 |
| `code-graph:language-adapter`         |           25 |        91 |
| `code-graph:traversal`                |           11 |        39 |
| `code-graph:composition`              |            9 |        24 |
| `cli:graph-impact`                    |            9 |        33 |
| `code-graph:graph-store`              |           18 |        68 |
| `cli:graph-search`                    |            7 |        68 |
| `code-graph:indexer`                  |           21 |        68 |
| `code-graph:staleness-detection`      |           16 |        34 |
| `code-graph:sqlite-graph-store`       |           14 |        38 |
| `code-graph:ladybug-graph-store`      |           14 |        38 |
| `cli:change-status`                   |           13 |        31 |
| `sdk:composition`                     |            7 |        14 |
| `code-graph:get-graph-health`         |            9 |        16 |
| `code-graph:workspace-integration`    |           11 |        24 |
| `cli:graph-index`                     |            6 |        15 |
| `sdk:run-index-project-graph`         |            5 |         8 |
| `code-graph:index-project-graph`      |            5 |         8 |
| `cli:graph-stats`                     |            6 |        20 |
| `core:vcs-adapter-port`               |           12 |        27 |
| `core:vcs-implementation-detector`    |            5 |        10 |
| **Total**                             |      **266** |   **772** |

Scenario coverage gaps: none detected. Every merged verify requirement has at least one scenario, and `changes validate --all` accepted every artifact. The final package and focused suites provide implementation evidence for the covered behavior; this structural audit does not assert that every prose clause maps one-to-one to a uniquely named test.

An additional scripted spec-versus-verify heading comparison and dependency dump was attempted, but execution approval was denied because the approval service had reached its usage limit. No workaround was attempted. This does not invalidate the completed CLI `--all` validation, the per-artifact `spec-preview` inventory, or the scenario counts above.

## Proposal, design, tasks, and prior-gap consistency

- Ownership is consistent throughout: Core persists graph-agnostic implementation tracking; Code Graph owns semantic identity, bindings, resolution, traversal, persistence, indexing, health, and search; SDK owns host orchestration; CLI owns selectors and presentation.
- Reference vocabulary is consistent: link outcomes are exactly `resolved | ambiguous | unresolved | missing`; `stale` remains a graph/input freshness state, not a fifth resolution outcome.
- Conservative evidence contract is consistent: incomplete, unsupported, dirty, stale, or unknown inputs cannot produce false `missing` or unsafe resolved/ambiguous outcomes.
- Public-binding versus canonical-symbol impact, covering-spec evidence, unified search, complete source ranges, VCS-aware freshness, build-context gates, and single-session bulk indexing appear coherently across proposal, design, tasks, specs, and verify artifacts.
- Compatibility/documentation tasks cover ADR 0024 plus CLI, SDK, and Code Graph documentation, named exports, public APIs, result shapes, failure behavior, and non-mutation.

Prior gaps are closed:

1. Tasks 5.2 and 9.2 now use `resolved`, `ambiguous`, `unresolved`, and `missing`; obsolete link-status `stale` wording is gone. Task 17.19 reinforces the same boundary.
2. `code-graph:indexer` verification now explicitly requires unchanged no-op indexing to invoke no reference-fact write or replacement, process zero files, report zero relation-phase counts, avoid semantic/source search rebuilds, and preserve declaration/binding facts byte-for-byte. The merged spec carries the same no-op contract.

## Dependency and global-spec consistency

Graph health is current and complete, with no fingerprint mismatch, parse failure, or partial coverage. Artifact validation reports no dependency or merge error. Cross-package ownership follows the allowed dependency direction:

`CLI -> SDK -> Core + Code Graph`, while Core remains independent of Code Graph and composition roots own concrete infrastructure selection.

No circular ownership or alternate CLI-level Core-plus-Code-Graph orchestration was identified in the reviewed artifacts or tracked implementation. The implementation review is routed through SDK orchestration, while Code Graph policies stay in Code Graph.

Global constraints are satisfied:

- Architecture: domain remains I/O-free; application behavior uses ports; composition owns infrastructure; delivery consumes SDK/application APIs.
- Conventions: strict TypeScript/ESM, named exports, explicit public types, immutable/read-only contracts, and typed errors are reinforced by clean lint/typecheck/build results.
- Documentation: ADR 0024 uses the required decision format and spec linkage; CLI, SDK, and Code Graph documentation are included in completed tasks.
- Error handling: stable uppercase reason/error codes and infrastructure-error propagation are specified and exercised; infrastructure failures are not disguised as per-link outcomes.
- ESLint: all four affected packages pass lint, covering layer restrictions, JSDoc/export conventions, and prohibited unsafe typing/default-export patterns.
- Testing: Vitest suites, contract/integration coverage, real temporary storage fixtures, and cleanup expectations are present; final isolated suites pass.

No global-spec contradiction was found. The documentation global mentions standard top-level documentation areas and separately authorizes `docs/code-graph` and `docs/sdk`; the change's use of both is consistent with the authoritative documentation requirements.

## Implementation tracking completeness

Tracking is complete at file level: all 136 files are classified as resolved or intentionally ignored. There are no open, removed, or unclassified file states, and review reports no out-of-scope spec IDs. Graph hint and canonical health are fresh/current.

The six ambiguous symbol resolutions are transparent, safe results under the resolver contract. They do not conceal missing files or guessed targets. No symbol link is unresolved or missing. Therefore implementation tracking contains no cross-cutting completion gap.

## Final verification matrix

| Package    | Lint | Typecheck | Build | Tests                                                                                 |
| ---------- | ---- | --------- | ----- | ------------------------------------------------------------------------------------- |
| Core       | PASS | PASS      | PASS  | PASS — 195 files, 2,370 tests                                                         |
| Code Graph | PASS | PASS      | PASS  | PASS — wrapper exit 0; all partitions, including focused SQLite 110 and integration 6 |
| SDK        | PASS | PASS      | PASS  | PASS — 9 files, 63 tests                                                              |
| CLI        | PASS | PASS      | PASS  | PASS — 79 files, 855 tests                                                            |

Code Graph focused confirmation:

- `sqlite-graph-store.spec.ts`: 1 file, 110 tests passed.
- `index-project-graph-integration.spec.ts`: 1 file, 6 tests passed.
- Full package wrapper exited 0 after the visible test files passed. Only the known wrapper-tolerated post-pass `ERR_IPC_CHANNEL_CLOSED`/`Channel closed` worker-IPC artifact appeared; no failed assertion or failed test file accompanied it.

## Evidence commands

- `node packages/cli/dist/index.js config show --format toon`
- `node packages/cli/dist/index.js project context --format toon`
- `node packages/cli/dist/index.js graph stats --format json`
- `node packages/cli/dist/index.js changes status implementation-review-symbol-resolution --implementation --format json`
- `node packages/cli/dist/index.js changes validate implementation-review-symbol-resolution --all --format json`
- `node packages/cli/dist/index.js changes implementation review implementation-review-symbol-resolution --format json`
- `node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution --spec <spec-id> --artifact verify`
- `node packages/cli/dist/index.js specs context <global-spec-id> --no-optimized`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli lint`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli typecheck`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli build`
- `pnpm --filter @specd/core test`
- `pnpm --filter @specd/sdk test`
- `pnpm --filter @specd/cli test`
- `pnpm --filter @specd/code-graph test`
- `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
- `pnpm --filter @specd/code-graph exec vitest run test/application/use-cases/index-project-graph-integration.spec.ts`
