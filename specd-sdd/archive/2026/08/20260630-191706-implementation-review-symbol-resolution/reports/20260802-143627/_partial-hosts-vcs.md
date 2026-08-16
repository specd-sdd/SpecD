# Compliance Audit — CLI, SDK, and Core VCS Hosts

## Requirements Summary

This audit reviewed the merged `spec.md` and `verify.md` projections produced by `changes spec-preview` for all 11 assigned specs, then traced their implementations graph-first through the CLI, SDK orchestration, Core VCS port/adapters, direct dependencies, and tests.

| Spec                               | Requirements | Conformant | Partial | Non-conformant |
| ---------------------------------- | -----------: | ---------: | ------: | -------------: |
| `cli:change-implementation`        |            9 |          7 |       0 |              2 |
| `sdk:build-implementation-review`  |            5 |          5 |       0 |              0 |
| `cli:graph-impact`                 |            9 |          9 |       0 |              0 |
| `cli:graph-search`                 |            7 |          7 |       0 |              0 |
| `cli:change-status`                |           13 |         13 |       0 |              0 |
| `sdk:composition`                  |            7 |          7 |       0 |              0 |
| `cli:graph-index`                  |            6 |          6 |       0 |              0 |
| `sdk:run-index-project-graph`      |            5 |          5 |       0 |              0 |
| `cli:graph-stats`                  |            6 |          4 |       2 |              0 |
| `core:vcs-adapter-port`            |           12 |         12 |       0 |              0 |
| `core:vcs-implementation-detector` |            5 |          3 |       0 |              2 |
| **Total**                          |       **84** |     **78** |   **2** |          **4** |

## Per-spec Implementation Status

### `cli:change-implementation` — non-conformant (7/9)

- **Command signature — conformant.** `registerChangeImplementation` exposes `list`, `review`, `add`, `remove`, `ignore`, `resolve`, and `unresolve` under the implementation group.
- **List — conformant.** Both structured and text rendering preserve the four tracked-file states, grouped spec/file links, symbols, complete SDK resolution objects, candidates, targets, and provenance. Resolution policy is obtained through `enrichImplementationTracking` -> `buildImplementationReview`; the CLI does not implement matching fallbacks.
- **Add — conformant.** The CLI preserves raw normalized paths and delegates existence/state/link invariants to Core.
- **Resolve — non-conformant.** Multi-file input is expanded and executed one file at a time (`implementation.ts:271-284`). If a later file is missing or invalid, earlier calls have already mutated the manifest, contrary to the requirement to validate **every** file and abort the operation.
- **Unresolve — non-conformant.** It uses the same sequential mutation loop, so the same all-files-before-mutation guarantee is absent.
- **Ignore — implementation follows the stated per-file rules, but shares the partial-update risk.** The merged requirement is less explicit about atomic abort than resolve/unresolve; this is therefore recorded as test debt rather than an additional failed requirement.
- **Remove — conformant.** The command delegates symbol-only versus whole-link removal to Core and does not rewrite links itself.
- **Review — conformant.** `list` and `review` share `renderImplementationState`; change status uses the same SDK enrichment. The integration test confirms one immutable projection across all three hosts.
- **Shared path semantics — conformant.** CLI forwards raw project-relative paths; canonical workspace normalization is not introduced here.

### `sdk:build-implementation-review` — conformant (5/5)

- **Delivery-neutral orchestration:** Core performs the authoritative review read; `withOpenGraphProvider` owns lifecycle; the provider supplies health and resolver behavior.
- **Stable projection:** Stored `specId`, `file`, and symbol strings are copied without rewriting, file-only links bypass symbol resolution, and structured resolver outcomes are retained.
- **One health snapshot and batch resolution:** one `getGraphHealth()` call and one `resolveSymbolReferences(...)` batch occur under a single provider lifecycle.
- **Graph availability:** non-current evidence remains a resolver outcome; lifecycle/provider failures propagate. Cardinality mismatches fail explicitly instead of fabricating missing links.
- **Shared host behavior:** CLI implementation list/review and status call the same SDK operation.

### `cli:graph-impact` — conformant (9/9)

- Signature/selector validation, direction normalization, file/symbol/spec/export delegation, provider-owned availability, structured/text formats, standard errors, public-binding impact, and covering-spec presentation are implemented in `commands/graph/impact.ts`.
- The CLI delegates traversal/aggregation and coverage to provider methods. Direct and blast-radius coverage groups and complete structured evidence are exercised by tests.

### `cli:graph-search` — conformant (7/7)

- The command accepts all four combinable categories, preserves `--files` versus `--file`, creates one `SearchCodeGraphInput`, and calls `provider.search(...)` exactly once.
- Ranking, query expansion, grouping, suppression, deduplication, and limits remain Code Graph responsibilities.
- Text/JSON/TOON retain category order, symbol construct/selection ranges, source match ranges/kinds, optional snippets, filters, and empty-result behavior.
- Busy/stale/open failures remain provider/CLI infrastructure errors.

### `cli:change-status` — conformant (13/13)

- The baseline read-only drafted/active status, schema warning, DAG/task/display rendering, blockers, lifecycle data, basic information, dependencies, and not-found behavior remain in place.
- `--implementation` is opt-in and obtains the same SDK review projection as implementation list/review, including structured graph diagnostics, without local fallback policy or state mutation.

### `sdk:composition` — conformant (7/7)

- Package layering and host context remain SDK orchestration over public Core/Code Graph APIs.
- Public barrels export host bootstrap/lifecycle helpers, `buildImplementationReview`, `runIndexProjectGraph`, associated result/input contracts, and curated host-facing Code Graph types; concrete infrastructure stores/adapters are not exposed.
- Version constants and subpath policies are covered by barrel tests.

### `cli:graph-index` — conformant (6/6)

- Signature, force/exclude options, configured/bootstrap resolution, result schemas, errors, documentation block, and provider-owned repair diagnostics are present.
- The CLI delegates indexing to `runIndexProjectGraph`, passes progress only for text presentation, and does not own schema repair.

### `sdk:run-index-project-graph` — conformant (5/5)

- It lists/filter workspaces, builds effective graph config, obtains VCS revision/root, and delegates to provider indexing.
- Lock acquisition is absent, progress and results are passed through, existing-provider lifecycle is respected, and transient-provider open/repair/close diagnostics are retained.
- Invalid combinations of an existing provider with lifecycle hooks fail through `InvalidProviderLifecycleError`.

### `cli:graph-stats` — partial (4 conformant, 2 partial)

- **Command signature — conformant.** Config/path exclusivity and bootstrap modes are present.
- **Statistics retrieval — partial.** It correctly uses `openSpecdHost`, `withOpenGraphProvider`, and `provider.getGraphHealth()`, but the command never calls/passes `kernel.project.listWorkspaces`; the merged requirement explicitly says configured hosts MUST pass `ListWorkspaces` results. Composition may already bind configured workspaces, but that is not the behavior stated by this requirement.
- **Concurrent indexing guard — conformant.** There is no host-managed pre-open lock probe.
- **Output format — partial/spec drift.** Structured output preserves `stale`, `currentRef`, and `fingerprintMismatch`; text now renders orthogonal health booleans and stable reason codes (`stats.ts:94-101`). The same merged requirement still mandates exact legacy warning prose such as `⚠ Graph is stale (...)` and a fingerprint warning on stderr. Current tests assert `VCS_REF_STALE`/`DERIVATION_MISMATCH` in stdout instead. This is a concrete spec-versus-current-design inconsistency; either the old prose must be restored or the requirement updated to the accepted reason-code model.
- **Error cases — conformant.** Provider/open failures propagate through standard infrastructure handling.
- **Content freshness and coverage diagnostics — conformant.** Text renders independent freshness/coverage/schema/generation values and reason codes; structured output carries the complete health object.

### `core:vcs-adapter-port` — conformant (12/12)

- `VcsAdapter` remains an abstract runtime-exported port with protected cwd construction and technology-neutral `rootDir`, `branch`, `isClean`, stable `ref`, `refAt`, `show`, `modifiedFiles`, and `identity` contracts.
- Git/Hg/SVN implementations enumerate repository-root-relative changes, normalize rename/deletion/untracked states, and reject backend failures. Null behavior and public export are implemented.
- No graph exclusion policy or backend-specific fingerprint was added to the adapter port.

### `core:vcs-implementation-detector` — non-conformant (3/5)

- **Implements detector port — conformant.** The class implements `ImplementationDetector`.
- **Uses VCS adapter — conformant.** All VCS enumeration is delegated to `VcsAdapter`; no backend-specific commands leak into the detector.
- **Historical baseline — conformant.** It uses the first implementing timestamp, `refAt`, fallback `ref`, then `modifiedFiles`.
- **Modified-file candidate mapping — non-conformant.** Root rebasing, outside-project rejection, slash normalization, deduplication, sorting, and preservation of missing/rename candidates are correct. However, `detectModifiedFiles` filters `options.excludePaths` at `vcs-implementation-detector.ts:70-74`, contrary to “MUST NOT perform Code Graph visibility filtering.”
- **No workspace normalization — non-conformant.** It correctly avoids `workspace:path`, but the requirement explicitly assigns `graph.excludePaths` filtering to later materialization. Current implementation and tests deliberately perform exclusion inside detection (`vcs-implementation-detector.spec.ts:200-250`). This is not an uncovered edge: code and tests encode the opposite policy.

## Discrepancies

### HIGH — Multi-file resolve/unresolve can partially mutate before validation failure

- **Spec evidence:** `cli:change-implementation` requires validating every supplied file and aborting when any file is missing for both resolve and unresolve.
- **Code evidence:** `mutateImplementationTracking` splits the list and awaits one mutating Core operation per file in a loop (`packages/cli/src/commands/change/implementation.ts:271-284`). There is no preflight or batch transaction.
- **Test evidence:** the comma-list test explicitly expects two calls. The missing-file ignore test configures a successful first mutation followed by a rejected second call (`change-implementation.spec.ts:145-176`) but asserts only the error text, not unchanged state.
- **Impact:** a command that reports failure can leave an earlier file resolved/unresolved/ignored.

### HIGH — VCS implementation detector applies a policy the merged spec forbids

- **Spec evidence:** `core:vcs-implementation-detector` says the detector must use the complete adapter result, must not perform Code Graph visibility filtering, and assigns `graph.excludePaths` filtering to archive-time materialization.
- **Code evidence:** `detectModifiedFiles` filters candidates using `options.excludePaths` (`vcs-implementation-detector.ts:70-74`) and reports excluded counts.
- **Test evidence:** three tests under “VcsImplementationDetector exclusion filtering” require this filtering (`vcs-implementation-detector.spec.ts:200-250`).
- **Interpretation:** either implementation/tests retained the previous implementation-tracking exclusion policy and the merged spec overreached, or code/tests must remove/move the filtering. The artifacts are not mutually compliant as written.

### MEDIUM — Graph stats requirement and current reason-code presentation diverge

- **Spec evidence:** the merged output-format requirement retains exact legacy VCS/fingerprint warning prose and stderr placement.
- **Code evidence:** `stats.ts:94-101` emits boolean health dimensions and `Health reasons:` codes in stdout, with no exact legacy warning line.
- **Test evidence:** tests named for the old warning now assert `VCS_REF_STALE` and `DERIVATION_MISMATCH`, confirming the implementation intentionally follows the newer orthogonal-health model.
- **Interpretation:** likely stale prose in the merged spec, not a runtime health defect, but compliance cannot be claimed until reconciled.

### MEDIUM — Graph stats does not explicitly supply `ListWorkspaces` results

- **Spec evidence:** configured hosts MUST pass `ListWorkspaces` results.
- **Code evidence:** `registerGraphStats` bootstraps the host and directly calls `provider.getGraphHealth()` (`stats.ts:51-59`); it never calls `host.kernel.project.listWorkspaces`.
- **Interpretation:** SDK composition may already bind equivalent config workspaces, so observed behavior may be correct, but the explicit orchestration requirement is not implemented or tested.

## Test Coverage

Focused verification executed during this audit:

- SDK: 3 files, **24/24 tests passed** (`build-implementation-review`, `run-index-project-graph`, barrel).
- CLI: 7 files, **93/93 tests passed** (implementation review/status, graph impact/search/index/stats).
- Core: 5 files, **34/34 tests passed** (Git/Hg/SVN VCS adapters, detector, public barrel).
- Total focused: **151/151 tests passed**.

Coverage is strong for shared SDK projection/lifecycle, unchanged-value projection, proven missing versus unresolved, unified search delegation, covering specs, CLI formatting/error routing, index repair passthrough, VCS changed-state enumeration, nested-project rebasing, backend failure propagation, and public-barrel boundaries.

## Missing Tests

1. Multi-file `resolve` where the second file is missing/invalid and the first file is proven unchanged.
2. Equivalent atomicity test for multi-file `unresolve`; a transactional/batch behavior test for `ignore` is also advisable.
3. A detector test asserting that Code Graph exclusions are **not** applied during VCS implementation detection (current tests assert the inverse, so this requires first resolving the spec policy conflict).
4. A graph-stats test for the exact merged warning prose/stderr contract, or removal of that stale contract in favor of reason codes.
5. A configured graph-stats integration test proving `ListWorkspaces` participation rather than only equivalent provider configuration.
6. Direct backend tests for several baseline VCS scenarios (`refAt` history/no-history, `show` missing revision/path, clean/dirty, detached branch) are sparse in the audited adapter suites; current change-focused tests primarily cover the newly strengthened `ref`/`modifiedFiles` semantics.

## Spec Dependency Chain

- `cli:change-implementation` and `cli:change-status` -> `sdk:build-implementation-review` -> `core:get-implementation-review` + `code-graph:get-graph-health` + `code-graph:resolve-symbol-reference` -> graph store/index coverage/freshness.
- `cli:graph-impact` -> SDK provider lifecycle -> Code Graph traversal, workspace selector resolution, logical-symbol/public-binding resolution, and indexed `COVERS_FILE`/`COVERS_SYMBOL` evidence.
- `cli:graph-search` -> SDK provider lifecycle -> unified Code Graph search -> semantic candidate lane + persisted source/spec/document indexes.
- `cli:graph-index` -> `sdk:run-index-project-graph` -> Core config/workspaces/VCS composition + Code Graph provider/indexer/storage repair.
- `cli:graph-stats` -> SDK host bootstrap/lifecycle -> Code Graph health -> store index session/coverage + VCS/content/derivation/schema-generation diagnostics.
- `core:vcs-implementation-detector` -> `core:implementation-detector-port` + `core:vcs-adapter-port` -> Git/Hg/SVN/Null adapters -> refresh implementation tracking. Its graph visibility/materialization boundary is the principal architecture conflict found.
- Global dependencies reviewed: `_global/architecture`, `_global/conventions`, `_global/error-handling-conventions`, `_global/eslint`, `_global/logging`, and `_global/testing`. The implementation generally respects ports/adapters layering, public API imports, standardized CLI infrastructure errors, logger use at infrastructure boundaries, and unit/integration test placement.

## Summary Counts

- Specs audited: **11**
- Merged requirements assessed: **84**
- Conformant: **78**
- Partial/spec drift: **2**
- Non-conformant: **4**
- Concrete discrepancies: **4** (2 high, 2 medium)
- Focused tests executed: **151 passed, 0 failed**

The shared SDK/CLI resolution architecture, unified graph search, impact coverage, indexing lifecycle, and VCS enumeration improvements are well implemented. Compliance is not complete because multi-file implementation mutations lack all-or-nothing validation, detector exclusion filtering directly contradicts its merged specification, and two graph-stats clauses have not been reconciled with the newer health model/composition.
