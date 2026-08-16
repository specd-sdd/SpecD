# Specs compliance report — implementation-review-symbol-resolution

- Mode: change
- Timestamp: 20260802-143627
- Specs audited: 24
- Effective requirements reviewed: 128
- Fully conformant: 109
- Partial: 15
- Non-conformant: 4
- Concrete discrepancies: 10 (6 high, 4 medium)
- Overall result: NOT COMPLIANT — remediation required before verification

## Detailed Findings

# Code Graph compliance audit

Scope: `code-graph:resolve-symbol-reference`, `symbol-model`, `language-adapter`, `traversal`, `composition`, `graph-store`, `indexer`, `staleness-detection`, `sqlite-graph-store`, `ladybug-graph-store`, `get-graph-health`, `workspace-integration`, and `index-project-graph` from change `implementation-review-symbol-resolution`.

The graph was current at audit time (`state: current`, 1,067 files, 36,015 symbols, SQLite schema-compatible provider). Each change spec was loaded through `changes spec-preview`; graph search was used to locate the implementation before focused source/test inspection.

## Requirements Summary

| Area                     | Effective change requirements | Implemented | Partial | Missing |
| ------------------------ | ----------------------------: | ----------: | ------: | ------: |
| Resolve Symbol Reference |                             8 |           5 |       3 |       0 |
| Symbol Model             |                             5 |           5 |       0 |       0 |
| Language Adapter         |                             6 |           2 |       4 |       0 |
| Traversal                |                             2 |           2 |       0 |       0 |
| Composition              |                             2 |           2 |       0 |       0 |
| Graph Store              |                             5 |           5 |       0 |       0 |
| Indexer                  |                             4 |           3 |       1 |       0 |
| Staleness Detection      |                             5 |           3 |       2 |       0 |
| SQLite Graph Store       |                             1 |           1 |       0 |       0 |
| Ladybug Graph Store      |                             1 |           1 |       0 |       0 |
| Get Graph Health         |                             3 |           1 |       2 |       0 |
| Workspace Integration    |                             1 |           0 |       1 |       0 |
| Index Project Graph      |                             1 |           1 |       0 |       0 |
| **Total**                |                        **44** |      **31** |  **13** |   **0** |

“Partial” means a material part exists but at least one explicit SHALL/MUST is not met or not demonstrably covered. Inherited baseline requirements outside the change delta were also checked through the graph-store contract and existing traversal/adapter regression suites; no new contradiction with the global architecture or error-handling conventions was found beyond the discrepancies below.

## Per-spec Implementation Status

### `code-graph:resolve-symbol-reference` — PARTIAL (5/8 full)

- Structured input and delimiter-safe round-trip are implemented by `ResolveSymbolReferenceInput`, `createLogicalSymbol`, and `parseLogicalSymbol` in `src/domain/value-objects/symbol-reference.ts`. Matching preserves case and structured fields.
- Logical targets, multiple declarations, public/local binding identities, deterministic precedence, the four statuses (including fresh complete `missing`), bounded/cycle-safe provenance, and one-health-snapshot batch execution are implemented in `src/application/use-cases/resolve-symbol-reference.ts`.
- Exact declaration, public alias, local alias, hierarchy member, ambiguity, member-form, batch-health, dirty-file, partial-coverage, and fresh-absence behavior have direct unit/integration tests.
- Partial: freshness is assessed only for explicitly addressed `filePath` resources. The resolver does not collect and assess every declaration file contributing to public/local/hierarchy candidates before returning `resolved`/`ambiguous` (see discrepancy CG-1).
- Partial: language-defined member/hierarchy precedence is represented by generic ordered steps, but the resolver does not receive adapter precedence/build-context policy and therefore cannot itself enforce all language-specific alternatives described by the spec. Existing tests cover a simple hierarchy path, not competing inheritance/MRO/trait/promotion cases.
- Partial: candidate queries are batched, but provenance closure issues one store batch per depth (up to 32). This is bounded and cycle-safe, but backend parity is only indirectly covered by shared store contracts; there is no equivalent SQLite/Ladybug resolver-result parity test.

### `code-graph:symbol-model` — IMPLEMENTED (5/5)

- `LogicalSymbol`, declaration occurrences, public/local bindings, symbol spaces and member forms exist as additive vocabulary without changing location-based `SymbolNode.id`.
- `SymbolNode` persists complete half-open construct ranges and contained selection ranges and validates both in `src/domain/value-objects/symbol-node.ts`.
- File/spec/document/symbol identities remain workspace-qualified; `FileNode.content` supports persisted source search.
- Compact `FileAnalysisDraft`/`FileAnalysis`, parser/session state and indexed lookup structures are implemented in the index-session model. Built-in adapter tests demonstrate parser-authoritative ranges; graph-store contracts round-trip them.
- Coverage status/failure vocabulary is persisted rather than kept only in `IndexResult`.

### `code-graph:language-adapter` — PARTIAL (2/6 full)

- All four built-in adapters expose `AdapterCapabilities`, semantic facts, hierarchy/binding facts, and parser-authoritative construct/selection ranges. Each adapter has a direct range test. Capability declaration and complete ranges are implemented.
- TypeScript/JavaScript implements named/re-export-star/CommonJS/static/literal dynamic imports and basic declarations/hierarchy. Python implements aliases, relative/static/literal dynamic imports and basic hierarchy. Go implements import forms, receiver/embedding/basic method-set relations. PHP implements namespace/use aliases, PSR-4 and basic hierarchy.
- The four language-specific requirements are only partial. The source contains no implementation for several explicitly required inputs/semantics: TypeScript `tsconfig` inheritance/references/`baseUrl`/`paths` and package `exports`/`imports` condition selection; Python statically determinable `__all__`, namespace-package/MRO policy; Go `go.work`, `replace`, internal-package visibility/build-tag selection; PHP Composer classmap/files plus trait `insteadof`/alias adaptation. Corresponding tests are absent. TypeScript and Go nevertheless advertise `buildContext: true`, which overstates the proven capability (CG-2).

### `code-graph:traversal` — IMPLEMENTED (2/2 change requirements)

- Canonical/public-binding impact separation is implemented and tested in `analyze-files-impact.spec.ts` (“keeps exact public-binding and canonical impact separate”). Existing traversal supports static-type and hierarchy relations with bounded cycle-safe ordering.
- `FileImpactResult.coveringSpecs` is derived through two batched reverse coverage reads, preserves file-only coverage, deduplicates evidence, assigns minimum depths, and is tested for single/multi-file inputs and constant batch-read count.
- Baseline upstream/downstream/spec/file/change impact requirements remain covered by the traversal service suite and graph-store relation contract.

### `code-graph:composition` — IMPLEMENTED (2/2)

- `CodeGraphProviderImpl` exposes single/batch resolution, canonical/public-binding impact and authoritative unified multi-category `search`; lifecycle/availability checks remain provider-owned.
- `SearchCodeGraph` constructs the shared plan, orchestrates semantic/content lanes, locates occurrences, suppresses only returned selection-range overlaps, refills pages after suppression, ranks/groups deterministically and applies limits after suppression. Tests cover logical grouping, aliases, exact ranking, all categories, CamelCase/multiword expansion and page refill.
- Public package exports expose contracts/value objects while concrete store implementations remain composition/infrastructure details.

### `code-graph:graph-store` — IMPLEMENTED (5/5)

- The port includes indexed semantic-reference lookup/persistence, batch declarations/bindings/steps/coverage, deterministic reverse coverage, source-content candidates, indexed-input observations/latches and one `IndexWriteSession`.
- Shared contract tests cover guarded monotonic freshness, range round-trip, staged commit/rollback, relation deduplication, deterministic source-content paging/filtering and batched reverse coverage.
- Ordinary incompatible reads fail; indexing-specific provider repair recreates derived storage. The bulk session has a single commit boundary and failed sessions do not expose a partial generation.

### `code-graph:indexer` — PARTIAL (3/4 full)

- Reference facts, bindings/re-export routes, coverage outcomes, source content/ranges and logical `COVERS_SYMBOL` targets are emitted/persisted. Cross-file hierarchy/override derivation uses in-memory indexed maps rather than N+1 store traversals.
- Derivation/schema incompatibility repair and visible rebuild reasons are implemented and integration-tested.
- Successful indexing writes observations/spec inputs, freshness latches and semantic facts in one bulk session; failures do not clear evidence. A native-session integration test asserts one complete generation routes through one session.
- Partial: incremental runs hydrate unchanged compact facts, but any semantic refresh sets `replaceCodeGraph` and reconstructs the whole code/document semantic subgraph. This can be equivalent and avoids reparsing unchanged files, but it does not demonstrate the specified deterministic dependent closure. Progress exposes broad phases (“Resolving imports”, “Bulk loading”) rather than separate public result counts/timings for dependency facts, adapter relations, re-exports, hierarchy/overrides, persistence and search-index rebuild (CG-5).

### `code-graph:staleness-detection` — PARTIAL (3/5 full)

- Package version is part of project/workspace derivation fingerprints; backend schema versions remain separate.
- Workspace/global monotonic latches, tri-state precedence, transient unknown behavior, exact resource assessment, mtime/size fast path, hash-on-stamp-change, equal-content refresh and missing/different-content stale marking are implemented.
- VCS diff candidates are grouped by repository root, rebased safely and filtered through graph visibility; non-VCS workspaces use persisted observations/membership; hybrid mode exists.
- Partial: `GetGraphHealth` does not surface persisted coverage summaries/reasons and treats any indexed graph as coverage-complete (CG-3).
- Partial: the fingerprint contains code-graph version, code roots and effective graph visibility, but not the contents/fingerprints of package-resolution inputs such as `tsconfig`, `package.json` exports/imports, `go.mod/go.work`, `pyproject`, or Composer autoload mappings (CG-4).

### `code-graph:sqlite-graph-store` — IMPLEMENTED (1/1)

- SQLite schema 8 (intervening versions explain the delta from the spec’s conditional 5→6 wording) persists semantic facts, ranges, source trigram FTS, observations/latches and compact facts.
- Source queries filter before paging, short queries use bounded fallback, reverse coverage is set-based, large observation queries are batched below SQLite limits, and multi-row bounded inserts occur inside one transaction. Incompatible schema rejection and destructive indexing repair are integration-tested.

### `code-graph:ladybug-graph-store` — IMPLEMENTED (1/1)

- Ladybug remains supported and schema 12 persists the equivalent semantic/range/freshness vocabulary. The backend uses one bulk session, transaction and bounded CSV `COPY` batches; FTS is rebuilt after commit rather than per append.
- Tests cover semantic reference facts, schema/version storage, source-content short-query paging, FTS refresh and recreate generation. The shared graph-store contract supplies backend-neutral behavior checks.

### `code-graph:get-graph-health` — PARTIAL (1/3 full)

- Aggregate/workspace tri-state projection, monotonic latch short-circuit, repository-root grouping, excluded-only filtering, no-index mutation and non-absolute diagnostics are implemented. Tests cover latch short-circuit, one VCS query for shared roots, irrelevant repository dirt, fingerprint states, lifecycle and infrastructure error propagation.
- Partial: `coverageComplete` is assigned `true` whenever `lastIndexedAt` exists; excluded/unsupported/parse-failed/partial coverage summaries are not read or projected (CG-3).
- Partial: aggregate `state` is derived from detailed content freshness and can remain `current` while separate `reasonCodes` contains `VCS_REF_STALE` or `DERIVATION_MISMATCH`. The spec can reasonably be read to require those canonical dimensions to make aggregate health non-current; either the aggregation or the spec needs clarification (CG-6).

### `code-graph:workspace-integration` — PARTIAL (0/1 full)

- Workspace-prefixed paths, package surfaces and adapter-emitted package identities prevent global same-name fallback, and case is preserved.
- Changes to roots/visibility/version invalidate fingerprints, but package identities/project references/autoload mappings themselves do not participate in fingerprinting (CG-4).

### `code-graph:index-project-graph` — IMPLEMENTED (1/1)

- `openForIndexing` catches only incompatible-schema errors, recreates storage, rotates generation and returns stable `SCHEMA_INCOMPATIBLE`; normal `open` rejects instead. Force/fingerprint rebuild diagnostics are retained in `IndexResult`. Integration tests verify rejection-before-repair and successful indexing after recreate.

## Discrepancies

### CG-1 — HIGH — candidate declaration files are not freshness-gated

Spec: resolution must batch-assess the explicitly addressed file **and every declaration file whose evidence contributes to a candidate**; dirty/unknown required evidence must yield `unresolved`.

Code evidence: `ResolveSymbolReference.executeBatch` builds `exactResources` only from `request.filePath`; `outcomeFromCandidates` returns `resolved`/`ambiguous` without checking candidate declaration resource freshness. A public-surface/local/hierarchy target whose declaration changed after indexing can therefore be returned as proven.

Possibilities: this is an implementation bug if the conservative contract stands; alternatively the spec would need to explicitly limit targeted freshness to file-anchored absence, which would weaken its stated safety guarantee.

### CG-2 — HIGH — language capability requirements exceed implementation

Spec: TS/JS, Python, Go and PHP SHALL cover the listed package/build/hierarchy semantics; unsupported capabilities must be recorded rather than guessed.

Code evidence: focused source search finds no handlers for the required TS config/package-condition inputs, Python `__all__`/namespace/MRO policy, Go workspace/replace/internal/build tags, or PHP classmap/files/trait conflict adaptation. Tests cover the useful implemented subset but none of those cases. TS and Go return `buildContext: true` despite no build-context consumption in their resolution path.

Possibilities: implementation is incomplete against the approved breadth; or the spec should be narrowed and capability flags made granular enough to describe the actual subset.

### CG-3 — HIGH — health cannot report coverage completeness/reasons

Spec: health must expose partial-index state and queryable excluded/unsupported/parse-failed/partial coverage summaries/reasons.

Code evidence: `GetGraphHealth.execute` computes `coverageComplete = stats.lastIndexedAt === undefined ? null : true` and does not query index coverage facts. Thus a graph with persisted parse-failed/partial coverage is reported coverage-complete.

Possibilities: implementation must aggregate coverage facts; or the spec must move coverage trust entirely to targeted resolution and remove the global health promise.

### CG-4 — HIGH — resolution inputs are absent from derivation fingerprints

Spec: changes to package identities, project references, autoload mappings and other deterministic resolution inputs must invalidate derivation.

Code evidence: `computeGraphFingerprint` / `computeWorkspaceFingerprint` hash code-graph version, workspace name/codeRoot and graph include/exclude/gitignore configuration only. They do not hash package-resolution configuration/content.

Possibilities: implementation must add normalized resolution-input fingerprints/observations; or the spec must state that changing those inputs is detected through another persisted input mechanism (none was found).

### CG-5 — MEDIUM — dependent-closure/progress contract is not fully demonstrated

Spec: incremental indexing must re-analyze only the deterministic affected closure and report separate counts/timings for named relation phases.

Code evidence: unchanged compact analysis is hydrated, but `semanticRefreshRequired` drives `replaceCodeGraph`, rebuilding the code/document subgraph for semantic changes. Progress callbacks expose coarse phases and logs contain timings, but `IndexResult`/progress does not provide every specified phase count/timing.

Possibilities: the current rebuild-from-hydrated-facts strategy may be the correct performance design and the spec may overconstrain persistence shape; the missing observable progress detail is still an implementation/spec mismatch.

### CG-6 — MEDIUM — aggregate state does not compose every canonical health dimension

Spec: canonical health distinguishes VCS ref, content, derivation, schema/generation and coverage; aggregate state is current/stale/unknown.

Code evidence: `state` is selected from detailed content freshness, while VCS ref and derivation only add `reasonCodes`. A result may therefore be `state: current` with `VCS_REF_STALE` or `DERIVATION_MISMATCH`.

Possibilities: this is an aggregation bug; alternatively “state” intentionally means content-only, in which case the spec and field name should say so explicitly.

## Test Coverage

- Strong: symbol range validation and all four built-in parser ranges; graph-store contract across persistence, relations, freshness CAS/latches, source candidates, reverse coverage and session rollback; SQLite schema/FTS/repair/batching; Ladybug semantic facts/schema/FTS/short queries; unified search orchestration; file-impact covering specs; exact/public/local/simple-hierarchy resolution; missing-vs-unresolved; one-health batch; dirty-file integration; one native bulk session; incompatible-store repair.
- Backend parity: shared contract tests provide broad parity. There is no single test that executes the same resolution batch against SQLite and Ladybug and compares full ordered status/reason/candidates/provenance.
- Architecture/error handling: application services depend on the `GraphStore`/host/VCS ports; backend repair is provider-owned; ordinary reads do not recreate; `GRAPH_BUSY` and stale-generation errors propagate. This conforms to the global hexagonal architecture and error-handling specs.

## Missing Tests

1. Public/local/hierarchy resolution where a contributing declaration file changes after index; expect `unresolved` and one deduplicated freshness batch.
2. Full SQLite-versus-Ladybug resolver-result parity, including candidate/provenance ordering and cycles.
3. Graph health with persisted excluded, unsupported, parse-failed and partial coverage; assert summaries and aggregate completeness.
4. Non-VCS membership addition/deletion and transient stat/read failure without latch mutation; repository-observation revision match/change; mixed hybrid ignored-untracked input.
5. Fingerprint invalidation on `tsconfig` paths/references, package exports/imports, `go.mod/go.work/replace`, Python package layout metadata and Composer autoload/classmap/files changes.
6. TS package condition/build-context selection; Python `__all__`, namespace packages and competing MRO; Go build tags/internal/replace/promotion ambiguity; PHP group use, Composer classmap/files and trait `insteadof`/alias behavior.
7. Incremental changed-file closure asserting unchanged adapters are not invoked and every required progress phase reports a count and timing.
8. Aggregate health precedence when content is current but VCS ref or derivation fingerprint is non-current.

## Spec Dependency Chain

- Global `default:_global/architecture`: respected by domain/application/infrastructure separation and port-owned I/O. Concrete SQLite/Ladybug details do not leak into resolver/traversal.
- Global `default:_global/error-handling-conventions`: respected by propagation of provider busy/stale-generation errors and explicit indexing-only incompatible-store repair.
- `symbol-model` → `language-adapter`, `graph-store` → `resolve-symbol-reference` → `traversal` → `composition`: implemented structurally, but CG-1 and CG-2 weaken the resolver’s promised proof boundary.
- `graph-store` + `indexer` + `get-graph-health` → `staleness-detection`: observations/latches exist and are atomic; CG-3/CG-4 prevent the aggregate health/fingerprint layer from satisfying the whole contract.
- `composition` + `indexer` + `graph-store` → `index-project-graph`: indexing-only schema repair and generation rotation are consistent.

## Summary counts

- Effective change requirements reviewed: **44**
- Fully implemented: **31**
- Partially implemented: **13**
- Entirely missing: **0**
- Discrepancies: **6** (**4 high**, **2 medium**, **0 low**)
- Missing/insufficient test groups: **8**

Overall assessment: **not compliant yet**. The implemented storage/search/range/bulk/covering-spec foundation is substantial and well tested, but the four high-severity gaps affect the conservative-resolution safety promise and canonical freshness/derivation guarantees rather than only optional polish.

---

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
