# Tasks: filter-impact-results-at-provider

## 1. Public contracts

- [x] 1.1 Add the public impact filter vocabulary
      `packages/code-graph/src/domain/value-objects/impact-result.ts`: `IMPACT_RESULT_TYPES`, `ImpactResultType`, `ImpactResultFilter` — define immutable result-type, symbol-kind, include-workspace, and exclude-workspace inputs.
      Approach: use the literal tuple `['files', 'symbols', 'specs']`, derive its union type, import `SymbolKind`, and document omission and exclusion-precedence invariants with JSDoc.
      (Req: Filtered-impact provider surface, Filtered impact results)
- [x] 1.2 Export the public impact filter vocabulary
      `packages/code-graph/src/domain/value-objects/index.ts`, `packages/code-graph/src/public.ts`, `packages/code-graph/src/index.ts`: named exports — expose the constant and types through supported package barrels.
      Approach: retain ESM `.js` suffixes, use named/type-only exports, and do not expose SQLite implementation types.
      (Req: Filtered-impact provider surface)
- [x] 1.3 Define the backend-neutral frontier query contract
      `packages/code-graph/src/domain/ports/graph-store.ts`: `ImpactDirection`, `ImpactResourceKind`, `ImpactFrontierQuery`, `ImpactFrontierResult` — add the complete readonly port payload/result types.
      Approach: model resource, frontier, direction, depth/maxDepth, relation types, optional filter, and four deterministic result arrays using existing node/relation value objects.
      (Req: Filtered impact query contract)
- [x] 1.4 Add the abstract frontier query operation
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore.queryImpactFrontier()` — require every store to implement filtered frontier membership and hydration.
      Approach: add `abstract queryImpactFrontier(input: ImpactFrontierQuery): Promise<ImpactFrontierResult>` with complete JSDoc; leave every existing method unchanged.
      (Req: Filtered impact query contract)

## 2. Domain traversal

- [x] 2.1 Add filtered symbol/public-binding impact traversal
      `packages/code-graph/src/domain/services/analyze-impact.ts`: `analyzeImpact()`, `analyzePublicBindingImpact()` — append the optional filter and route frontier expansion through the store port.
      Approach: preserve resolution and BFS rules, batch once per frontier/depth, admit relations before visited/count/risk aggregation, and hydrate only requested categories.
      (Req: Filtered impact results)
- [x] 2.2 Add filtered single-file impact traversal
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`: `analyzeFileImpact()` and internal details operation — append and forward `filter?: ImpactResultFilter` after existing optional parameters.
      Approach: preserve resolver/context parameter positions, use admitted store frontiers, and assign `[]` to required unselected symbol/spec category fields.
      (Req: Filtered impact results)
- [x] 2.3 Add filtered multi-file impact aggregation
      `packages/code-graph/src/domain/services/analyze-files-impact.ts`: `analyzeFilesImpact()` — append the optional filter and aggregate only admitted per-file results.
      Approach: deduplicate by canonical identity, retain shallowest depth, combine covering evidence deterministically, and derive counts/risk after filtering.
      (Req: Filtered impact results)
- [x] 2.4 Add filtered spec impact traversal
      `packages/code-graph/src/domain/services/analyze-spec-impact.ts`: `analyzeSpecImpact()` — append the optional filter and apply category/workspace constraints to affected specs, files, and symbols.
      Approach: traverse through admitted relations, preserve existing spec-resolution behavior, and keep every result field structurally present.
      (Req: Filtered impact results)
- [x] 2.5 Preserve omitted-filter compatibility across impact services
      `packages/code-graph/src/domain/services/analyze-impact.ts`, `analyze-file-impact.ts`, `analyze-files-impact.ts`, `analyze-spec-impact.ts`: legacy branches — keep current semantic ordering, counts, risk, and materialization.
      Approach: treat `undefined` and direct-caller empty lists as unconstrained, omit new predicates, and materialize all legacy categories.
      (Req: Filtered impact results)

## 3. Provider composition

- [x] 3.1 Extend the public provider impact signatures
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider` impact methods — append `filter?: ImpactResultFilter` to symbol, binding, file, files, and spec operations.
      Approach: use an optional final argument so every existing call remains source-compatible and no backend-specific type leaks into the facade.
      (Req: Filtered-impact provider surface)
- [x] 3.2 Delegate filters through the provider implementation
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProviderImpl` impact methods — forward the exact filter to the matching domain service.
      Approach: retain exactly one `assertAvailable()` call per operation and all current open/stale/close lifecycle behavior.
      (Req: Filtered-impact provider surface)

## 4. SQLite query path

- [x] 4.1 Add the frontier operation to the worker protocol
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: `SQLiteWorkerOperationMap.queryImpactFrontier` — define the typed payload and result mapping.
      Approach: transport `{ input: ImpactFrontierQuery }` and `ImpactFrontierResult` using only structured-clone-safe arrays and plain readonly objects.
      (Req: Query-time filtered impact reads)
- [x] 4.2 Dispatch the frontier operation in the worker
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: `handleMessage()` — add the operation switch branch.
      Approach: call `database.queryImpactFrontier(payload.input)` and return its result; keep predicate/filtering logic out of the dispatcher.
      (Req: Query-time filtered impact reads)
- [x] 4.3 Delegate frontier reads from the SQLite adapter
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `SQLiteGraphStore.queryImpactFrontier()` — satisfy the new abstract store method.
      Approach: make one typed worker request per non-empty frontier, return four empty arrays without a request for an empty frontier, and never post-filter rows in TypeScript.
      (Req: Filtered impact query contract, Query-time filtered impact reads)
- [x] 4.4 Implement direction/type-aware frontier relation SQL
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `queryImpactFrontier()` — select upstream, downstream, or both-direction candidate relations.
      Approach: generate only fixed SQL fragments and placeholder counts, bind all frontier IDs/relation types, union and canonical-deduplicate `both`, and sort deterministically.
      (Req: Query-time filtered impact reads)
- [x] 4.5 Apply symbol kind and workspace predicates in SQL
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `queryImpactFrontier()` symbol branch — constrain symbol endpoints before rows leave SQLite.
      Approach: join candidate symbols to files for workspace, bind `kinds`, included workspaces, and excluded workspaces, omit clauses for empty lists, and apply inclusion plus exclusion together.
      (Req: Query-time filtered impact reads, Filtered impact query contract)
- [x] 4.6 Apply file and spec workspace predicates in SQL
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `queryImpactFrontier()` file/spec branches — constrain endpoints by their own workspace columns.
      Approach: bind all values, make exclusions win through simultaneous `IN`/`NOT IN`, hydrate only selected categories, and return unselected arrays empty.
      (Req: Query-time filtered impact reads, Filtered impact query contract)
- [x] 4.7 Add physical indexes and bump the SQLite schema
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION`, schema index statements — support new workspace/kind predicates.
      Approach: bump version `9` to `10`, add `idx_files_workspace` and `idx_symbols_kind_file_path`, and rely on the existing recreate/reindex compatibility flow.
      (Req: Query-time filtered impact reads)

## 5. CLI parsing and delegation

- [x] 5.1 Register impact filter options
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpact()` — add type, kind, repeatable workspace, and repeatable exclude-workspace options.
      Approach: append workspace values with a collector initialized to `[]`; keep existing selectors, depth, direction, and formatting options unchanged.
      (Req: Provider-owned impact result filters)
- [x] 5.2 Normalize result-type filters
      `packages/cli/src/commands/graph/impact.ts`: impact option normalization — parse comma-separated result types.
      Approach: trim/lowercase, discard empty tokens, stable-deduplicate by first occurrence, and reject unknown tokens with the exact required message before provider creation/open.
      (Req: Provider-owned impact result filters)
- [x] 5.3 Normalize symbol-kind filters
      `packages/cli/src/commands/graph/impact.ts`, `packages/cli/src/commands/graph/parse-graph-kinds.ts`: impact option normalization — reuse the canonical parser.
      Approach: call `parseGraphKinds`, stable-deduplicate, and reject `--kind` with explicit types excluding symbols using exact message `--kind requires --type to include symbols`.
      (Req: Provider-owned impact result filters)
- [x] 5.4 Normalize repeatable workspace filters
      `packages/cli/src/commands/graph/impact.ts`: impact option normalization — trim and stable-deduplicate inclusion/exclusion arrays.
      Approach: preserve unknown names, retain both lists so provider-side simultaneous predicates enforce exclusion precedence, and do not comma-split workspace values.
      (Req: Provider-owned impact result filters)
- [x] 5.5 Delegate one normalized filter from every CLI target branch
      `packages/cli/src/commands/graph/impact.ts`: file, symbol, exported-binding, and spec handlers — pass the filter as the final provider argument.
      Approach: return `undefined` when all filter flags are absent and perform no membership filtering after provider return; retain display-path projection only.
      (Req: Provider-owned impact result filters)

## 6. Test-store and domain tests

- [x] 6.1 Implement the frontier query in the in-memory test store
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `queryImpactFrontier()` — make domain tests compile and observe the production contract.
      Approach: filter immutable in-memory candidates by direction, relation type, kind, and workspace; exclusion wins; sort/deduplicate exactly like the port contract.
      (Req: Filtered impact query contract)
- [x] 6.2 Add graph-store contract coverage
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: frontier-query contract suite — exercise every registered store.
      Approach: assert omitted filter, each category, kinds, includes/excludes, overlap precedence, empty frontier, deterministic ordering, deduplication, and input immutability.
      (Req: Filtered impact query contract)
- [x] 6.3 Test filtered traversal admission and aggregates
      `packages/code-graph/test/domain/services/traversal.spec.ts` and applicable impact service specs: filtered traversal cases — verify filter-before-count/depth/risk semantics.
      Approach: construct mixed workspace/kind graphs, assert excluded endpoints never enter visited/count evidence, and cover max depth and cycles.
      (Req: Filtered impact results)
- [x] 6.4 Test result category materialization and legacy compatibility
      `packages/code-graph/test/domain/services/traversal.spec.ts` and applicable impact service specs: result shape cases — verify required arrays and omitted-filter equivalence.
      Approach: assert selected fields contain deterministic rows, unselected fields equal `[]`, and no-filter results retain legacy ordering/counts/risk.
      (Req: Filtered impact results)
- [x] 6.5 Test filtered multi-file aggregation
      `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts`: filtered aggregation cases — verify canonical deduplication after admission.
      Approach: overlap per-file results, retain shallowest depth, combine covering-spec evidence deterministically, and calculate aggregates/risk after filtering.
      (Req: Filtered impact results)
- [x] 6.6 Test provider lifecycle and filter delegation
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: all impact facade methods — verify exact final-argument forwarding.
      Approach: spy on services/store, assert one availability check per operation, and retain closed/stale error behavior.
      (Req: Filtered-impact provider surface)
- [x] 6.7 Test public barrel exports
      `packages/code-graph/test/barrel.spec.ts`: public export assertions — cover filter constants/types without exposing SQLite internals.
      Approach: extend named-export fixtures/type assertions and preserve ESM entry-point expectations.
      (Req: Filtered-impact provider surface)

## 7. SQLite tests

- [x] 7.1 Test worker protocol transport
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: `queryImpactFrontier` fixtures — verify payload/result typing and serialization.
      Approach: send readonly plain-object inputs and assert arrays round-trip without `Map`, callback, handle, or class instances.
      (Req: Query-time filtered impact reads)
- [x] 7.2 Test real SQL result-type filtering
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: frontier result-type cases — verify only requested categories are hydrated.
      Approach: seed symbols/files/specs across relations, call the real adapter/worker/database path, and assert required unselected arrays are empty.
      (Req: Query-time filtered impact reads)
- [x] 7.3 Test real SQL kind/workspace filtering and precedence
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: predicate cases — verify filtering occurs before adapter return.
      Approach: seed multiple workspaces/kinds, cover inclusion, exclusion, overlap, unknown workspace, empty lists, and both directions with deterministic results.
      (Req: Query-time filtered impact reads)
- [x] 7.4 Test SQL parameterization
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: metacharacter inputs — prove user values are bound.
      Approach: use workspace/frontier values containing quotes and SQL metacharacters, assert correct empty/matching results, intact schema, and no SQL error.
      (Req: Query-time filtered impact reads)
- [x] 7.5 Test schema version and indexes
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: schema compatibility assertions — verify version 10 and physical indexes.
      Approach: inspect SQLite metadata for `idx_files_workspace` and `idx_symbols_kind_file_path` and assert version-9 stores follow the existing recreate-required path.
      (Req: Query-time filtered impact reads)
- [x] 7.6 Test wide filtered traversal batching
      `packages/code-graph/test/integration/sqlite-wide-traversal.spec.ts`: wide/deep integration case — guard efficiency and aggregate correctness.
      Approach: assert one store operation per frontier/resource kind rather than per node, excluded rows never cross the worker boundary, and counts/risk match admitted rows.
      (Req: Query-time filtered impact reads, Filtered impact results)

## 8. CLI tests and documentation

- [x] 8.1 Test CLI option registration and normalization
      `packages/cli/test/commands/graph-impact.spec.ts`: filter flag cases — verify comma parsing, repeat collectors, trimming, deduplication, and precedence payloads.
      Approach: invoke Commander with repeated workspace flags and mixed type/kind tokens, then inspect exact provider mock calls.
      (Req: Provider-owned impact result filters)
- [x] 8.2 Test CLI validation before provider access
      `packages/cli/test/commands/graph-impact.spec.ts`: invalid type/kind compatibility cases — verify deterministic usage failures.
      Approach: assert exact messages/exit behavior and that provider creation/open/impact methods are not called.
      (Req: Provider-owned impact result filters)
- [x] 8.3 Test every CLI target branch and output shape
      `packages/cli/test/commands/graph-impact.spec.ts`: file, files, symbol, export/from, and spec cases — verify filter delegation and structural arrays.
      Approach: return filtered mock results, assert no CLI membership post-filtering, preserve display-path mapping, and compare JSON/TOON/text membership.
      (Req: Provider-owned impact result filters)
- [x] 8.4 Document graph impact filters
      `docs/cli/cli-reference.md`: `graph impact` reference — describe all four flags and examples.
      Approach: document comma-separated type/kind values, repeatable workspaces, type/kind rule, exclusion precedence, empty required arrays, and provider/SQLite ownership.
      (Req: Provider-owned impact result filters)

## 9. Validation and manual verification

- [x] 9.1 Run focused Code Graph domain/composition tests
      `packages/code-graph/test/domain/**`, `packages/code-graph/test/composition/**`: focused test commands — validate contracts and service/provider behavior.
      Approach: run the design-listed traversal, aggregation, provider, and barrel suites; require exit code `0`.
      (Req: Filtered impact results, Filtered-impact provider surface, Filtered impact query contract)
- [x] 9.2 Run focused SQLite tests
      `packages/code-graph/test/infrastructure/sqlite/**`, `packages/code-graph/test/integration/sqlite-wide-traversal.spec.ts`: focused adapter commands — validate physical predicates and worker efficiency.
      Approach: run the design-listed store, protocol, and wide traversal suites; require exit code `0` and deterministic assertions.
      (Req: Query-time filtered impact reads)
- [x] 9.3 Run focused CLI tests
      `packages/cli/test/commands/graph-impact.spec.ts`: command suite — validate parsing/delegation/output.
      Approach: run the package test filtered to graph impact and require exit code `0`.
      (Req: Provider-owned impact result filters)
- [x] 9.4 Run lint and monorepo build
      `packages/code-graph`, `packages/cli`, monorepo: static validation — catch type/export/ESM/JSDoc integration errors.
      Approach: run both package lint commands followed by `pnpm build`; require all exit codes `0`.
      (Req: Filtered-impact provider surface, Filtered impact query contract)
- [x] 9.5 Reindex a real graph under schema 10
      `.specd` derived graph store: migration smoke test — recreate/index with the new schema.
      Approach: run `node packages/cli/dist/index.js graph index --format toon`, assert success/current freshness, and confirm no authored data migration occurs.
      (Req: Query-time filtered impact reads)
- [x] 9.6 Compare unfiltered impact with legacy behavior
      CLI E2E: known symbol impact — confirm omitted-filter compatibility.
      Approach: run JSON impact without filters and assert all legacy arrays, ordering, counts, and risk are present as before.
      (Req: Filtered impact results, Provider-owned impact result filters)
- [x] 9.7 Verify repeated workspace and files-only E2E behavior
      CLI E2E: filtered symbol impact — confirm repeat collectors and exclusion precedence.
      Approach: include `cli` and `code-graph`, exclude `cli`, request `files`, and assert only admitted files plus required empty symbol/spec arrays and filtered counts/risk.
      (Req: Provider-owned impact result filters, Filtered impact results)
- [x] 9.8 Verify symbol-kind E2E behavior
      CLI E2E: filtered file impact — confirm kind-aware query-time results.
      Approach: request `symbols` with `function,method` in TOON and assert only those kinds in deterministic order.
      (Req: Provider-owned impact result filters, Query-time filtered impact reads)
- [x] 9.9 Verify invalid type/kind E2E behavior
      CLI E2E: incompatible flags — confirm failure occurs before store access.
      Approach: run `--type files --kind function`, assert exit `1` and exact message `--kind requires --type to include symbols`.
      (Req: Provider-owned impact result filters)
- [x] 9.10 Verify filters across all selector branches and formats
      CLI E2E: file/files/symbol/export/spec selectors with JSON, TOON, and text — confirm one semantic membership set.
      Approach: run each branch against the same indexed graph and assert provider-owned filtering with only display-path representation differences.
      (Req: Provider-owned impact result filters, Filtered-impact provider surface)
- [x] 9.11 Validate the completed specd change
      `specd-sdd/changes/20260828-072258-filter-impact-results-at-provider`: artifact and scenario validation — prove implementation completion is traceable.
      Approach: run `node packages/cli/dist/index.js changes validate filter-impact-results-at-provider --format text` and require every artifact/scenario to pass.
      (Req: Provider-owned impact result filters, Filtered impact results, Filtered impact query contract, Filtered-impact provider surface, Query-time filtered impact reads)

## 10. Review follow-up: symbol affected specs

- [x] 10.1 Add specs to the base impact result contract
      `packages/code-graph/src/domain/value-objects/impact-result.ts`: `ImpactResult`, `SpecImpactResult` — add required `affectedSpecs: readonly string[]` to the base interface and remove the redundant child declaration.
      Approach: keep one unconditional result shape for every target; migrate the field rather than making it optional so provider and structured CLI consumers can rely on deterministic arrays.
      (Req: Filtered impact results, Filtered-impact provider surface)
- [x] 10.2 Migrate impact result constructors and structural fixtures
      `packages/code-graph/src/domain/services/**`, `packages/code-graph/test/**`, `packages/cli/test/commands/graph-impact.spec.ts`: `ImpactResult` literals — initialize the newly required base field in every production result, mock, and fixture.
      Approach: use computed deterministic IDs when specs are materialized and `[]` when specs are not requested; do not omit the property in any target branch.
      (Req: Filtered impact results, Provider-owned impact result filters)
- [x] 10.3 Extract shared coverage collection
      `packages/code-graph/src/domain/services/collect-impact-specs.ts`, `packages/code-graph/src/domain/services/analyze-file-impact.ts`: coverage helper and existing file coverage logic — centralize `COVERS_SYMBOL`/`COVERS_FILE` lookup for reuse.
      Approach: move the existing detailed covering-spec collector into a dependency-neutral helper, preserve `CoveringSpecImpact` evidence, and expose stable-deduplicated canonical spec IDs without introducing a service import cycle.
      (Req: Filtered impact results)
- [x] 10.4 Populate symbol and public-binding affected specs
      `packages/code-graph/src/domain/services/analyze-impact.ts`: `analyzeImpact()`, `analyzePublicBindingImpact()` — derive `affectedSpecs` for both target families.
      Approach: collect coverage from the resolved root symbol and owning file at depth `0` plus all admitted affected symbols/files; apply workspace constraints through the store, sort by canonical spec ID, and leave counts/depths/risk unchanged.
      (Req: Filtered impact results, scenario: Symbol specs are derived from admitted coverage)
- [x] 10.5 Align file, files, and spec result projections
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`, `analyze-files-impact.ts`, `analyze-spec-impact.ts`: result assembly — populate inherited `affectedSpecs` consistently while retaining detailed file `coveringSpecs`.
      Approach: map detailed coverage to canonical IDs, merge multi-file IDs deterministically, preserve spec traversal semantics, and assign `[]` whenever the specs category is not selected.
      (Req: Filtered impact results)
- [x] 10.6 Verify coverage lookup at the store boundary
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: coverage frontier queries — ensure incoming `COVERS_SYMBOL` and `COVERS_FILE` relations hydrate specs for symbol/file evidence under workspace filters.
      Approach: reuse the typed `queryImpactFrontier` path with bound parameters and SQL-side admission; add or adjust the minimal resource/direction handling only if the existing query cannot return the covering spec endpoints.
      (Req: Query-time filtered impact reads, Filtered impact query contract)
- [x] 10.7 Add domain regression tests for specs-only symbol impact
      `packages/code-graph/test/domain/services/traversal.spec.ts`: symbol and public-binding coverage scenarios — prove root and admitted evidence produce specs.
      Approach: seed both `COVERS_SYMBOL` and `COVERS_FILE`, request `types: ['specs']`, assert deterministic `affectedSpecs`, empty `affectedFiles`/`affectedSymbols`, deduplication, workspace filtering, and unchanged aggregates.
      (Req: Filtered impact results, scenario: Symbol specs are derived from admitted coverage)
- [x] 10.8 Add provider contract regression coverage
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`, `packages/code-graph/test/barrel.spec.ts`: public result shape — verify symbol/public-binding operations expose the inherited field through supported exports.
      Approach: assert exact delegation plus unconditional `affectedSpecs` presence without leaking helper or SQLite implementation types.
      (Req: Filtered-impact provider surface, scenario: Symbol and public-binding results expose specs)
- [x] 10.9 Add CLI regression for `SpecRepository`
      `packages/cli/test/commands/graph-impact.spec.ts`: symbol specs-only output — cover the reported no-results regression.
      Approach: invoke `graph impact --symbol SpecRepository --type specs`, return provider coverage IDs, and assert JSON/TOON/text render `affectedSpecs` while file/symbol arrays remain empty and no CLI post-filtering occurs.
      (Req: Provider-owned impact result filters, scenario: Symbol target renders affected specs)
- [x] 10.10 Update the CLI result documentation
      `docs/cli/cli-reference.md`: `graph impact --type specs` semantics — document that specs are available for every target family.
      Approach: add the `SpecRepository` symbol example and explain base `affectedSpecs`, direct root coverage, deterministic IDs, and empty unrequested file/symbol arrays.
      (Req: Provider-owned impact result filters)
- [x] 10.11 Run the reported specs-only symbol E2E
      CLI E2E: indexed `SpecRepository` symbol — confirm the provider returns real coverage after rebuild and reindex.
      Approach: run `node packages/cli/dist/index.js graph impact --symbol SpecRepository --type specs --format json` and require non-empty deterministic `affectedSpecs` with `affectedFiles` and `affectedSymbols` equal to `[]`.
      (Req: Provider-owned impact result filters, Filtered impact results)

## 11. Compliance findings resolution (D-1 to D-5)

- [x] 11.1 Render affectedSpecs in CLI text format for symbol and public-binding targets (D-1)
      `packages/cli/src/commands/graph/impact.ts`: `formatImpact()` — update text formatter to display count and sorted list of `affectedSpecs` when non-empty or when `--type specs` is requested.
      Approach: extend `FormattedImpactResult` and `formatImpact()` to include `affectedSpecs: result.affectedSpecs` and format the specs count and bulleted list similar to `formatSpecImpact()`.
      (Req: Provider-owned impact result filters, scenario: Symbol target renders affected specs)
- [x] 11.2 Include COVERS_SYMBOL-derived files in files-only spec impact (D-2)
      `packages/code-graph/src/domain/services/analyze-spec-impact.ts`: `analyzeFilteredSpecImpact()` — derive owning files from covered symbols even when the `symbols` result category is unmaterialized.
      Approach: collect covered symbols' owning file paths into `affectedFiles` when `types` contains `files`, regardless of whether `symbols` is requested, while keeping `affectedSymbols: []` if unselected.
      (Req: Filtered impact results, scenario: Result types control materialized categories)
- [x] 11.3 Retain call-affected symbol spec coverage in specs-only file and multi-file impact (D-3)
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`, `packages/code-graph/src/domain/services/analyze-files-impact.ts`: file traversal details and aggregation — retain nested `affectedSpecs` from symbol analysis when materializing specs-only results.
      Approach: fold nested `result.affectedSpecs` from each root symbol's `analyzeImpact()` into file covering specs collection even when `symbols` is not materialized.
      (Req: Filtered impact results, scenario: Symbol specs are derived from admitted coverage)
- [x] 11.4 Clarify and align ImpactFrontierQuery.resource contract semantics and depth-zero queries (D-4)
      `packages/code-graph/src/domain/ports/graph-store.ts`: `ImpactFrontierQuery` JSDoc and comments — align documentation with candidate/neighbor kind hydration semantics and permit depth 0 for coverage.
      Approach: document that `resource` designates the candidate/neighbor category to expand/hydrate and that coverage queries use `depth: 0`.
      (Req: Filtered impact query contract, scenario: Port remains storage neutral)
- [x] 11.5 Avoid dispatching unrequested symbol coverage SQL in filtered spec impact (D-5)
      `packages/code-graph/src/domain/services/analyze-spec-impact.ts`: `analyzeFilteredSpecImpact()` — selectively dispatch coverage queries.
      Approach: only dispatch the symbol coverage frontier when symbols are requested or needed for files derivation, avoiding unnecessary SQL execution.
      (Req: Query-time filtered impact reads, scenario: Category predicates prevent unrequested hydration)
- [x] 11.6 Add regression tests for compliance findings
      `packages/cli/test/commands/graph-impact.spec.ts`, `packages/code-graph/test/domain/services/traversal.spec.ts`, `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` — add unit and integration test assertions covering D-1 through D-5.
      Approach: add tests for text-mode symbol/binding specs, files-only spec-to-symbol-file coverage, specs-only file call-affected symbol coverage, store contract semantics, and query suppression.
      (Req: Provider-owned impact result filters, Filtered impact results, Query-time filtered impact reads)
