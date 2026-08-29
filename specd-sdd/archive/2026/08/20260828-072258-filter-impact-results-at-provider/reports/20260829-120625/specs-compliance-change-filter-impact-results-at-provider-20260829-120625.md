# Specs Compliance Report — filter-impact-results-at-provider

The change is broadly aligned with its global and dependency contracts, and its provider/SQLite filtering architecture is substantially implemented. The audit found five discrepancies: three HIGH user-visible projection/rendering gaps and two MEDIUM internal query-contract or category-execution issues. Full verification should not be considered clean until the findings are reviewed and an explicit next action is selected.

## Detailed Findings

# Compliance Audit Partial — `filter-impact-results-at-provider`

Audit scope: the merged change specs `cli:graph-impact`, `code-graph:traversal`, `code-graph:graph-store`, `code-graph:composition`, and `code-graph:sqlite-graph-store`, plus relevant project-wide directives and their direct dependencies at depth 1.

Evidence basis:

- Merged artifacts were read with `changes spec-preview` for all five specs.
- The code graph was current at audit discovery (`stale: false`, 1,118 files, 39,386 symbols, 279 specs).
- Code navigation began with `graph search` for the public filter, frontier query, traversal services, provider operations, and coverage helper, followed by targeted source inspection.
- Existing verification evidence supplied to the audit: full `@specd/code-graph` suite passed (59 files / 728 tests); CLI graph-impact suite passed (38/38); `SpecRepository --type specs` JSON E2E returned 31 sorted specs with empty file/symbol arrays; workspace exclusion returned empty/LOW; multi-file specs returned 26 aggregate and per-file `[26,21]`; public-export canonical impact returned 8 specs; invalid type/kind exited 1 with the exact message.
- The audit attempted fresh text E2E checks, but the currently selected on-disk database reported schema 5 versus expected schema 10. This does not invalidate the supplied schema-10 E2E evidence, but it prevented an additional live text-mode run during this audit. The text-mode findings below are established directly from the formatter call graph.

## Requirements Summary

### `cli:graph-impact` — Provider-owned impact result filters

The merged requirement adds `--type`, `--kind`, repeatable `--workspace`, and repeatable `--exclude-workspace` to every target family; constrains types to `files | symbols | specs`; reuses the shared symbol-kind vocabulary; makes incompatible explicit type/kind combinations a pre-provider usage error; delegates one normalized request; forbids CLI membership filtering; and requires symbol/public-binding `--type specs` to render provider-owned `affectedSpecs`.

Implementation status: **partially compliant**. Parsing, validation, stable deduplication, delegation, exclusion precedence, provider-owned membership, and structured JSON/TOON preservation are implemented. Text rendering for symbol and public-binding spec-only results is incomplete (D-1).

### `code-graph:traversal` — Filtered impact results

The merged requirement adds an optional typed filter to symbol, file, multi-file, spec, and public-binding operations; requires canonical workspace/kind admission before result construction and aggregate calculation; separates traversal evidence from category materialization; requires `affectedSpecs` on every result; derives specs through `COVERS_SYMBOL` and `COVERS_FILE`; requires specs-only traversal; and requires backend filtering before any final limit.

Implementation status: **partially compliant**. Symbol and public-binding traversal correctly derives specs from admitted roots/symbols/files, required arrays are stable, aggregates are computed from admitted relations, and omitted filters preserve the new unfiltered contract. Two cross-category projections are incomplete: filtered spec-to-file projection drops `COVERS_SYMBOL`-derived files (D-2), and specs-only file/multi-file projection drops coverage attached only to call-affected symbols (D-3).

### `code-graph:graph-store` — Filtered impact query contract

The merged requirement adds a backend-neutral impact query carrying result types, symbol kinds, workspace inclusion/exclusion, target, direction, and depth. Physical adapters must apply predicates before rows cross the boundary, preserve filters across workers, and expose no SQLite details.

Implementation status: **substantially compliant with a contract-definition discrepancy**. `GraphStore.queryImpactFrontier`, its deterministic result, the in-memory contract implementation, SQLite adapter, and worker transport exist and apply predicate admission. However, `resource` is documented as the frontier identity kind while every implementation treats it as the neighboring/candidate kind, and coverage calls use depth zero. The executable behavior is consistent across implementations/tests, but the declared contract is not (D-4).

### `code-graph:composition` — Filtered-impact provider surface

The merged requirement adds the filter to all five provider impact operations, preserves one availability validation and exact delegation, exposes `affectedSpecs` for all families, forwards predicates to traversal/store, and exports only curated host-facing filter/result vocabulary.

Implementation status: **compliant at the facade boundary**. `CodeGraphProviderImpl` validates once per top-level call and delegates the same filter object to domain services; symbol/public-binding provider results expose coverage-derived specs; `IMPACT_RESULT_TYPES`, `ImpactResultType`, and `ImpactResultFilter` are publicly exported; SQLite and worker internals remain outside the curated public barrel. Downstream projection defects D-2/D-3 propagate through this facade but are located in traversal services rather than facade synthesis.

### `code-graph:sqlite-graph-store` — Query-time filtered impact reads

The merged requirement calls for parameterized SQL predicates, canonical workspace columns/joins, exclusion precedence, category-aware hydration, lossless worker transport, bounded deterministic reads, omitted clauses for empty lists, duplicate normalization, and no unrestricted TypeScript post-filtering.

Implementation status: **mostly compliant**. SQL binds frontier IDs, relation types, kinds, and workspace values; joins symbol ownership through files; applies simultaneous `IN`/`NOT IN`; deduplicates/sorts; chunks within the parameter budget; hydrates only the selected resource collection; transports the request through one typed worker operation; and adds schema-10 indexes. The spec-impact service nevertheless dispatches a symbol coverage frontier even when symbols are not requested and then ignores it (D-5), so the end-to-end category predicate scenario is not fully satisfied despite the database method itself avoiding symbol hydration.

## Implementation Status

| Area                                      | Status                                    | Principal evidence                                                                                                                          |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Public filter/result model                | Implemented                               | `impact-result.ts` defines the closed type vocabulary, immutable filter, and required base `affectedSpecs`.                                 |
| CLI normalization                         | Implemented                               | `normalizeImpactResultFilter` validates types/kinds before graph context, trims/deduplicates, and returns `undefined` with no filter flags. |
| CLI delegation                            | Implemented                               | File, multi-file, symbol, spec, and export handlers append the filter to the existing provider operation.                                   |
| CLI structured rendering                  | Implemented                               | JSON/TOON spread provider results and only project canonical paths for display.                                                             |
| CLI text rendering of symbol/export specs | Incomplete                                | Generic `formatImpact` has no `affectedSpecs`; only `formatSpecImpact` prints it.                                                           |
| Store port and test backend               | Implemented with semantic-doc mismatch    | Abstract frontier contract and in-memory behavior exist, but `resource` means neighbor kind in executable code.                             |
| Filtered symbol/public-binding traversal  | Implemented                               | Store-admitted BFS, aggregate/risk calculation, exact node hydration after admission, and coverage-derived specs.                           |
| Filtered file/multi-file traversal        | Incomplete for specs-only symbol evidence | The result of each nested symbol analysis contains affected spec IDs but those IDs/evidence are not folded when symbols are unmaterialized. |
| Filtered spec traversal                   | Incomplete for files-only symbol coverage | `COVERS_SYMBOL` nodes are processed only when `symbols` is selected, so their owning files disappear from a files-only result.              |
| Provider facade                           | Implemented                               | One availability validation and unchanged filter delegation per operation.                                                                  |
| SQLite query path                         | Implemented                               | Bound SQL, canonical joins, precedence, deterministic ordering, worker map/dispatcher/store request, schema 10 and supporting indexes.      |
| Category query suppression                | Incomplete in spec service                | Both file and symbol coverage frontiers execute unconditionally.                                                                            |

## Discrepancies

### D-1 — HIGH — Text mode hides `affectedSpecs` for symbol and public-binding targets

**Spec interpretation:** `cli:graph-impact` states that `--type specs` is valid for symbol and public-binding targets and SHALL render the provider's `affectedSpecs` collection. It also states that text, JSON, and TOON consume the provider-filtered result. A human selecting specs in text mode must therefore see the returned identifiers, not merely zero files and aggregate counts.

**Code interpretation:** `FormattedImpactResult` and `formatImpact()` contain only risk, counts, files, and symbols (`packages/cli/src/commands/graph/impact.ts:122-219`). Symbol output and both public-binding views call this generic formatter (`:517-520`, `:796`). Only the spec-target-specific `formatSpecImpact()` adds an affected-spec count/list (`:230-246`). JSON/TOON are correct because they serialize the provider result as-is.

**Impact:** `graph impact --symbol SpecRepository --type specs --format text` and the corresponding public-export command can successfully obtain non-empty specs while displaying none of them. This is a direct user-visible failure of the new option in one supported format.

**Alternative assessment:** If “render” were intended to mean only structured formats, the code could be accepted, but that reading conflicts with the explicit all-format language and the command's default text format. The spec is clearer than the code here.

### D-2 — HIGH — Files-only filtered spec impact omits files reached through `COVERS_SYMBOL`

**Spec interpretation:** The merged base spec requires spec impact to surface files reached through `COVERS_FILE` and symbols reached through `COVERS_SYMBOL`; the new filter requirement says result-type selection controls materialized collections while admitted symbol reachability may still be used to compute requested files. Therefore `--spec X --type files` must include the owning file of an admitted symbol covered by X even though `affectedSymbols` remains empty.

**Code interpretation:** `analyzeFilteredSpecImpact()` always queries both coverage frontiers, but it iterates `symbolCoverage.symbols` only inside `if (materializesImpactType(filter, 'symbols'))` (`packages/code-graph/src/domain/services/analyze-spec-impact.ts:173-214`). With `types: ['files']`, SQLite intentionally returns no hydrated symbols, and the service never obtains their owning files. `affectedFiles` consequently contains only direct `COVERS_FILE` rows (`:195-197`).

**Impact:** A files-only spec impact understates the blast radius whenever coverage exists only at symbol granularity. Counts/risk for spec dependencies remain intact, but the selected file category is incomplete.

**Alternative assessment:** The code would be correct only if `COVERS_SYMBOL` were defined to contribute exclusively to the symbol category. That interpretation contradicts the existing merged spec-impact requirement and the new allowance to use hidden symbol evidence to derive requested categories.

### D-3 — HIGH — Specs-only file and multi-file impact lose coverage attached only to call-affected symbols

**Spec interpretation:** File and multi-file `affectedSpecs`/`coveringSpecs` must be derived from direct target evidence and admitted blast-radius symbols/files. A specs-only filter may keep `affectedFiles` and `affectedSymbols` empty, but it must still traverse and retain hidden evidence needed to discover spec coverage.

**Code interpretation:** Each file's root symbols are analyzed with the filter, and a nested specs-only `analyzeImpact()` correctly computes `result.affectedSpecs`. However, `analyzeFileImpactDetails()` ignores those nested `affectedSpecs`. It builds `symbolDepths` for root symbols, then adds affected symbol IDs/files only when the `symbols` result category is materialized (`packages/code-graph/src/domain/services/analyze-file-impact.ts:96-107`, `:151-164`). The later covering-spec query therefore sees roots and import-reached files, but not a call-affected symbol whose spec coverage exists only through `COVERS_SYMBOL`. Multi-file aggregation inherits the same omission.

**Impact:** `--file ... --type specs` can return a plausible non-empty list yet silently omit specs that cover only call-affected symbols. The supplied multi-file E2E proves common real-graph coverage, but not this symbol-only edge.

**Alternative assessment:** If file covering specs were intentionally limited to input symbols plus import-level files, the implementation would be consistent, but the merged requirement explicitly includes admitted impacted symbols and the design's result mapping says specs-only traversal retains hidden symbol evidence.

### D-4 — MEDIUM — `ImpactFrontierQuery.resource` has contradictory contract semantics

**Spec/design interpretation:** The backend-neutral request should carry an unambiguous target/resource kind. The port JSDoc says `resource` is the “Category of canonical identifiers supplied in frontier” (`packages/code-graph/src/domain/ports/graph-store.ts:119-135`). The validated design is even more explicit: `frontier` contains IDs/paths of exactly the declared resource kind and normal traversal depth is one-based.

**Code interpretation:** SQLite and the in-memory backend treat `resource` as the neighboring candidate kind to join/hydrate (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:543-555` and its resource-specific joins). Coverage calls intentionally pass file or symbol IDs in `frontier` while declaring `resource: 'spec'`; spec coverage calls pass spec IDs while declaring `resource: 'file'` or `'symbol'`. Coverage reads also use `depth: 0, maxDepth: 0`.

**Impact:** Current implementations and tests agree with each other, so runtime behavior is stable. The abstract port is nevertheless not self-describing and a future non-SQLite adapter implementing the documented semantics would be incompatible. This weakens the storage-neutral guarantee.

**Alternative assessment:** The executable interpretation—`resource` means candidate/neighbor category—is useful and supports heterogeneous relations. The likely repair may be to rename/document the port and permit depth-zero projection rather than change working code. This is exactly why neither side should be assumed authoritative without a design decision.

### D-5 — MEDIUM — Unrequested symbol coverage SQL still executes during filtered spec impact

**Spec interpretation:** The SQLite scenario says that when only files and specs are requested, SQLite does not execute or hydrate the symbol-result collection. Result categories should prevent unrequested physical category work.

**Code interpretation:** `analyzeFilteredSpecImpact()` launches file and symbol coverage `queryImpactFrontier` calls unconditionally in one `Promise.all` (`packages/code-graph/src/domain/services/analyze-spec-impact.ts:173-193`). For `types: ['files', 'specs']`, the symbol query still performs a relation query and symbol/file join in SQLite; its symbol array is empty and the service then ignores it because symbols were not selected.

**Impact:** No incorrect symbol rows cross the adapter, but avoidable SQL crosses the worker/database boundary and the explicit “does not execute” portion of the scenario is unmet. It also obscures D-2: the work is paid for without using it to derive files.

**Alternative assessment:** If “does not execute the symbol-result collection” means only “does not hydrate symbols,” the database satisfies it. The scenario uses both verbs (“execute or hydrate”), and the end-to-end service issues the symbol frontier, so the stricter reading is better supported.

## Test Coverage

### `cli:graph-impact`

- Covered: comma-separated type/kind parsing; trimming and stable deduplication; repeated workspace flags; exact normalized provider calls; unsupported `documents` before context/provider; incompatible type/kind before provider; single-file, multi-file, symbol, spec, and export delegation; JSON preservation of provider-owned category membership; symbol specs-only JSON regression.
- Existing suite result: 38/38 passing.
- Gap: no text assertion that symbol/public-binding `affectedSpecs` identifiers are displayed (D-1).
- Gap: no explicit TOON assertion for specs-only symbol/public-binding membership, although the generic structured serializer path is shared with JSON.

### `code-graph:traversal`

- Covered: omitted/empty filter equivalence; kind/workspace admission and exclusion precedence; aggregate counts/risk from admitted symbol evidence; files-only materialization with empty symbols; specs-only symbol impact from direct and affected coverage; required empty arrays; provider-derived affected specs.
- Covered by broader passing suites: cycles, depth, direction, file imports, spec traversal, and legacy impact paths.
- Gap: no focused test where a files-only spec impact must derive a file solely from `COVERS_SYMBOL` (D-2).
- Gap: no focused single-/multi-file specs-only test where the only covering spec is attached to an affected caller symbol (D-3). The existing multi-file specs-only test asserts only empty file/symbol arrays and per-file shape; it does not seed/assert this coverage edge.
- Gap: “filtering precedes final result limits” has no direct boundary test with excluded rows ahead of an admitted bounded candidate. The current frontier API has no new final result limit, so the implementation avoids a known post-limit filter, but the scenario is not independently demonstrated.

### `code-graph:graph-store`

- Covered by the reusable port contract: direction, relation type, kind, inclusion, exclusion, overlap precedence, result categories, deterministic sorting/deduplication, empty frontier, and input immutability.
- SQLite-specific tests prove the production adapter applies predicates before returning relations/nodes.
- Gap: no contract test detects the disagreement between documented frontier resource kind and candidate resource kind (D-4); existing fixtures intentionally codify candidate-kind semantics.

### `code-graph:composition`

- Covered: all five provider operations forward the same filter object; one storage-generation/availability check per operation; frontier receives the exact filter; symbol and public-binding specs-only results expose coverage-derived specs; curated barrel exposes the closed result vocabulary and types while hiding concrete SQLite/store internals.
- No facade-specific missing test beyond downstream projection cases D-2/D-3.

### `code-graph:sqlite-graph-store`

- Covered: real worker/database path; one resource category hydrated at a time; file/spec/symbol categories; SQL kind/workspace predicates; inclusion/exclusion overlap; unknown workspace; empty lists; both directions; deterministic ordering; SQL-metacharacter workspace values; structured-clone payload/result; schema version 10 and new indexes; wide filtered traversal batching.
- Existing full package suite: 59 files / 728 tests passing.
- Gap: no spy/trace assertion that an unrequested resource query is never dispatched, which permits D-5.
- Gap: parameterization test exercises a metacharacter workspace value, but not a metacharacter frontier ID or kind value. Source inspection shows all three are bound; this is an evidence gap, not an observed injection defect.
- Gap: worker transport test proves structured-clone equality but does not invoke `handleMessage` with a database spy to assert the same payload ordering at the dispatcher call site. Real integration tests exercise the route, so risk is low.

## Missing Tests

1. CLI text: symbol `--type specs` prints an affected-spec count and ordered IDs.
2. CLI text: public binding `--type specs` prints affected specs independently for binding and canonical impact.
3. Traversal: spec target with only `COVERS_SYMBOL`, filter `{ types: ['files'] }`, expects the symbol's owning file and empty symbols.
4. Traversal: file target whose caller symbol alone has `COVERS_SYMBOL`, filter `{ types: ['specs'] }`, expects that covering spec with blast-radius evidence.
5. Multi-file: overlapping symbol-only coverage under specs-only filtering preserves per-file evidence and aggregate deterministic deduplication.
6. SQLite/service integration: `types: ['files', 'specs']` does not dispatch a symbol collection query, or explicitly proves the chosen alternative that hidden symbol evidence is queried and used only to derive files.
7. Store contract: explicitly name and assert whether `resource` describes frontier nodes or neighbor nodes, including coverage relations and depth-zero projection.
8. SQLite parameterization: bind a frontier ID and a kind-like value containing SQL metacharacters, confirming statement structure and graph integrity.
9. Filtering-before-limit: a bounded frontier where excluded early candidates cannot consume the admitted result capacity, if/when the frontier contract exposes such a limit.

## Spec Dependency Chain

### Relevant project-wide directives

- `default:_global/architecture`: domain remains pure; stateless impact services are pure functions over `GraphStore`; SQL/worker code remains infrastructure; provider wiring remains composition; CLI delegates through the curated SDK/provider boundary; no IoC or circular workspace dependency was introduced.
- `default:_global/conventions` and `default:_global/eslint`: strict TypeScript, readonly inputs, ESM `.js` imports, named exports, and package-layer lint constraints are respected. Passing typecheck/build/lint evidence supports this.
- `default:_global/testing`: domain/store behavior is unit/contract tested with the in-memory port implementation; SQLite behavior uses real temporary storage and worker/integration tests.
- `default:_global/error-handling-conventions`: invalid type/kind combinations use the existing CLI error route, exact actionable messages, and exit code 1 before provider access.
- `default:_global/docs`: the CLI reference was updated in English and the implementation remains traceable to the change artifacts.

No change-added behavior contradicts the global architecture or package-dependency direction. D-4 is an internal port-semantics clarity problem, not a layer violation.

### Direct dependencies at depth 1

- `cli:graph-impact` → `cli:entrypoint` (output/error/exit conventions), `cli:graph-cli-context` (SDK context and provider lifecycle), `core:config` (workspace/config identities), `code-graph:traversal`, `code-graph:workspace-integration` (canonical workspace-prefixed identities), `code-graph:resolve-symbol-reference` (deterministic target/binding resolution). Parsing/delegation preserves these contracts; D-1 conflicts with output completeness, not output envelope conventions.
- `code-graph:traversal` → `code-graph:symbol-model` (closed SymbolKind and relation families), `code-graph:graph-store`, `code-graph:resolve-symbol-reference`. The change reuses these vocabularies and does not alter resolution precedence; D-2/D-3 are projection gaps after valid admission.
- `code-graph:graph-store` → `code-graph:symbol-model`, `default:_global/architecture`, `code-graph:staleness-detection`, `code-graph:document-model`. The new port remains backend-neutral at the type level and does not introduce documents as an impact category. D-4 should be resolved to keep future adapters conformant.
- `code-graph:composition` → `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:indexer`, `code-graph:traversal`, `default:_global/architecture`, graph-health/index/coverage/resolution specs, and `code-graph:isolated-index-worker`. The facade preserves availability validation and manual composition; it does not move indexing locks or lifecycle ownership.
- `code-graph:sqlite-graph-store` → `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, `code-graph:workspace-integration`. Schema roots remain config-derived, canonical workspace columns are used, logical node/relation identities are unchanged, and the worker protocol remains infrastructure-internal.

### Consistency conclusion

The change specs are broadly conformant with global and dependency specs: no document result category was added; canonical workspace and SymbolKind vocabularies are reused; CLI lifecycle remains SDK/provider-owned; resolution and freshness behavior are unchanged; the domain/port/infrastructure separation is sound; and SQLite details do not leak into the public provider surface. The material discrepancies are within the new result-projection and internal frontier semantics rather than contradictions with an external dependency spec.

## Summary Counts

- Change-added requirements audited: **5**
- Fully compliant requirements: **1** (`code-graph:composition` facade/public surface)
- Substantially/partially compliant requirements: **4**
- Change-added scenarios audited: **23**
- Scenarios with direct satisfactory implementation/test evidence: **20**
- Scenarios partially satisfied by implementation: **2** (text rendering of symbol specs; category query suppression)
- Scenarios without a direct decisive test: **1** (filter-before-final-limit)
- Discrepancies: **5 total**
  - CRITICAL: **0**
  - HIGH: **3**
  - MEDIUM: **2**
  - LOW: **0**
- Missing or materially insufficient focused tests: **9**
- Global/dependency contradictions: **0 external contradictions**; **1 internal port/design semantics contradiction** (D-4)

Overall audit result: **issues found; do not treat full verification as clean without an explicit reviewer decision.** The implementation is strong on provider delegation, SQL-side predicate admission, determinism, worker transport, and structured outputs, but the three HIGH projection/rendering gaps affect supported user-visible category selections and should normally route back to implementation.
