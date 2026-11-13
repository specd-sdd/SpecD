# Partial C: code-graph:traversal, code-graph:graph-store, code-graph:sqlite-graph-store (round 3)

Change: `cross-language-symbol-semantics`. Read-only audit. Specs read via `changes spec-preview` (merged, with verify scenarios).
Tests run (all green): `traversal.spec.ts`, `analyze-files-impact.spec.ts`, `sqlite-graph-store.spec.ts`, `sqlite-wide-traversal.spec.ts` -> 224 pass / 0 fail.
Also queried a copy of the repo's real graph DB (`.specd/config/graph/code-graph.sqlite`, schema 15, already has `local_bindings.start_line`).

## Answer to the schema-15 question (pre-amendment v15 DB lacking `start_line`)

Findings:

- `assertExistingSchemaCompatible` (`sqlite-graph-database.ts:2674-2689`) and `ensureSchemaVersion` (`:2693-2712`) compare only `meta.schemaVersion` to `SQLITE_SCHEMA_VERSION` (15).
- `configureDatabase` runs `CREATE TABLE IF NOT EXISTS` (`schema.ts:105`), which is a no-op on an existing `local_bindings` table. The open succeeds and the first statement touching `start_line` fails with a raw `SqliteError: no such column: start_line`. That statement is `findLocalBindings` (`:2479`), `getAllReferenceFacts` (`:1262`) or the bulk/`replaceReferenceFacts` insert (`:3538`).
- That error is not typed. `getStorageRecoveryReason` (`:4783-4800`) only maps `GraphSchemaIncompatibleError`, `SQLITE_CORRUPT` and `SQLITE_NOTADB`. So `run-index-project-graph.ts:118-120` does not call `provider.recreate()`, even with `--force`.
- `--force` uses the logical `clear()` path (spec: "healthy forced reindex MUST NOT delete/recreate"). `clearLogicalGeneration` (`:3144-3170`) works on the old table. The following insert then fails again. This matches the reported symptom.

Do the specs require recreate on such a mismatch? No.

- sqlite `Reference schema upgrade` explicitly says the `local_bindings` range columns "belong to schema version 15, which this change introduces; no separate version is created".
- Recovery is defined only by version mismatch: 14, <14 and >15 reject with `SCHEMA_INCOMPATIBLE`, and `graph index` recreates.
- No spec text covers same-version structural drift. So this is a spec gap, not a code violation.
- HEAD had `SQLITE_SCHEMA_VERSION = 14` (`git diff`: `-14 +15`), so only developer DBs built mid-change at "15" are affected.

Recommendation (a decision for the owner):

- (a) Keep as is and document "delete `.specd/config/graph` or bump".
- (b) Add a structural guard in `assertExistingSchemaCompatible` (`PRAGMA table_info(local_bindings)` / `logical_declarations`, mapped to `GraphSchemaIncompatibleError`) and amend the sqlite spec. This makes `--force` self-heal via the existing typed-recovery flow.
- (c) Bump to 16, which contradicts the spec sentence above.

Severity: LOW for release (v15 unreleased). MEDIUM for dev ergonomics.

---

## Spec 1: code-graph:traversal

Requirements summary and status:

| Requirement                                               | Status         | Evidence                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream/Downstream traversal, cycle, maxDepth, truncated | OK             | `get-upstream.ts:44-135`, `get-downstream.ts` (mirror); tests `traversal.spec.ts:108-490`                                                                                                                                                  |
| Bounded batched traversal                                 | PARTIAL        | frontier uses `getIncoming/OutgoingSymbolRelations` + `getSymbolsByIds` (OK). `includeFiles` branch is per-file (see C-5). `Promise.all(roots.map(getSymbol))` is unbounded (C-9). `queryImpactFrontier` is not memoized (C-6).            |
| Bounded hotspot hierarchy                                 | OK             | `compute-hotspots.ts:76-117` one `getIncomingSymbolRelations` with EXTENDS/IMPLEMENTS/OVERRIDES; test `compute-hotspots.spec.ts:418`                                                                                                       |
| TraversalOptions/Result                                   | OK             | defaults 3/true, structure OK                                                                                                                                                                                                              |
| Impact analysis (counts, risk, omittedCounts, hierarchy)  | PARTIAL        | `analyze-impact.ts`; `computeRiskLevel` matches the spec table (`risk-level.ts:33-48`). `affectedProcesses` is always `[]` and `processCount` is hard-coded 0 (C-12). Counts use `Math.max(symbol,file)` rather than a sum (undocumented). |
| Filtered impact results                                   | OK             | store-side predicates; `types` materialization; `affectedSpecs` empty when not requested                                                                                                                                                   |
| Static type dependency impact                             | OK             | `SYMBOL_IMPACT_RELATION_TYPES` (6 types)                                                                                                                                                                                                   |
| File impact                                               | PARTIAL        | see C-3, C-4, C-6                                                                                                                                                                                                                          |
| Spec impact                                               | PARTIAL        | N+1 in the unfiltered path (C-11)                                                                                                                                                                                                          |
| Change detection                                          | PARTIAL        | duplicated risk thresholds, no category admission (C-10)                                                                                                                                                                                   |
| Pure functions                                            | OK             | per-call memo caches only                                                                                                                                                                                                                  |
| Resolved canonical / public-binding impact                | PARTIAL (HIGH) | see C-1                                                                                                                                                                                                                                    |
| Logical-target aggregation                                | OK             | `analyze-impact.ts:176-560`, `semanticCounts` distinct from physical counts; tests `traversal.spec.ts:1189-1380`                                                                                                                           |
| Owner-qualified impact target                             | N/A here       | resolver-level (`resolve-graph-selector` / `resolve-symbol-reference`), not audited in this batch                                                                                                                                          |
| File-impact covering specs                                | PARTIAL        | see C-3, C-4                                                                                                                                                                                                                               |
| Logical symbol coverage during impact                     | PARTIAL        | see C-2, C-4                                                                                                                                                                                                                               |

### Discrepancies

**C-1 (HIGH, code/spec, production data)**
The exact public-binding view cannot work against a real index.

- `analyzePublicBindingImpact` (`analyze-impact.ts:118-153`) seeds `bindingImpact` from `[binding.id]` and reads relations whose target is the binding id.
- The indexer only persists dependency relations to physical symbol ids (`scoped-binding-environment.ts:173,188,229`; `index-code-graph.ts:1226-1236`).
- Real DB check: 5922 `public_bindings`, 0 relations targeting them. `bindingImpact` is therefore always empty in production.
- The tests hand-craft `Calls -> binding.id` edges (`analyze-files-impact.spec.ts:213`) that the indexer never emits.
- The sqlite relation validator allows binding targets (`sqlite-graph-database.ts:4761`) but nothing produces them.
- The spec scenario "Export impact separates route and target" (exact route includes only its proven route, canonical includes all three routes, "including downstream re-export chains") is not realizable. Nothing walks `resolution_steps` for re-export chains. The same test asserts `canonicalImpact` excludes `routeConsumer`, which contradicts "canonical impact includes all three routes".

**C-2 (MEDIUM, code)**
`collectCoveringSpecs` (`analyze-file-impact.ts:378-440`) still has the physical fallback `querySymbols = logicalDepths.size > 0 ? ... : physicalDeclIds` (`:403`).

- It also resolves depth via `symbolDepths.get(relation.target)` (`:~429`).
- `analyze-files-impact.ts:93` uses it whenever `filter === undefined`.
- This violates "physical ID MUST NOT be used as fallback logical ID" and "all-physical-only traversal MUST skip the reverse logical-coverage store operation". Multi-file impact without a filter calls `getCoveringSpecsForSymbols` with physical ids.
- The single-file path (`analyze-file-impact.ts:61`) always uses the logical collector, so single-file and multi-file behavior diverge.
- No test covers the all-physical-only case for file or multi-file impact. `traversal.spec.ts:1375,1508` only test `analyzeResolvedSymbolImpact`.

**C-3 (MEDIUM, code)**
`analyzeResolvedSymbolImpact` omits the files of reached symbols from covering-spec file evidence.

- `fileDepthsMap` (`analyze-impact.ts:341-376`) holds only root files (depth 0) plus the IMPORTS-BFS files.
- Files of reached call/hierarchy dependents are added to `affectedFiles` (`:327-333`) but not to the coverage frontier (`:523`).
- A spec with `COVERS_FILE` on a caller's file is missed by symbol impact. The physical path (`collectAffectedSpecs`, `:1023-1040`) and file impact (`analyze-file-impact.ts:~186`) do include them.
- Violates "specs covering admitted impacted symbols and files" (Filtered impact requirement).

**C-4 (MEDIUM, code)**
Fabricated covering-spec depth and evidence.

- `analyze-file-impact.ts:63-72` and `analyze-files-impact.ts:106-116` push `{ specId, minDepth: 1, evidence: [] }` for specs found only via per-symbol `affectedSpecs`.
- This is the normal outcome under a specs-only filter, because `symbolDepths` is only filled when `symbols` is materialized (`analyze-file-impact.ts:~178`).
- The result carries a made-up minimum depth of 1 and no evidence. A spec covering the input file's symbol at depth 0 or a symbol at depth 3 is mislabeled. This contradicts "every distinct evidence item" and "minimum impact depth".
- Test D-3 (`analyze-files-impact.spec.ts:438`) asserts only presence.

**C-5 (LOW-MEDIUM, code)**
`getUpstream`/`getDownstream` with `includeFiles` (default true) do per-file `getImporters`/`getImportees` plus per-importing-file `findSymbols` inside a frontier, sequentially (`get-upstream.ts:76-95`, `get-downstream.ts:76-96`; `detect-changes.ts` loops symbols sequentially).

- Not per-symbol, but not "one logical batch per frontier".
- Not bounded concurrency (sequential), so no overload.
- The `includeFiles` tests (`traversal.spec.ts:336,469`) do not assert batching.

**C-6 (MEDIUM, code)**
`createMemoizedReadStore` (`analyze-file-impact.ts:~520`) does not memoize `queryImpactFrontier`, `findLogicalDeclarationsByDeclarationIds` or `findLogicalSymbolsByIds`.

- The hot path of multi-file impact is therefore not a "shared memoized read view". Repeated frontiers across files and symbols hit the worker again.
- Scenario "repeated reads across files share one memoized read view" is only loosely covered. `sqlite-wide-traversal.spec.ts` checks completion under `maxPendingOperations: 32`.
- No assertion on memoization of the frontier.

**C-7 (LOW, spec/code)**
Many orderings use `String.localeCompare` (domain services: 19 sites; `sqlite-graph-database.ts`: 11, including `compareRelations` at `:4669`).

- SQL `ORDER BY` is binary while JS sorts by locale/ICU.
- "Deterministic across backends/environments" holds within one runtime but not across ICU or locale differences.
- Recommend a code-point comparator.

**C-8 (LOW, code)**
`analyzeFileImpactDetails` returns `affectedFiles: [...affectedFileSet]` unsorted (`analyze-file-impact.ts:~215`), while multi-file and the other paths sort. Deterministic only because inputs happen to be.

**C-9 (LOW, code)**
`analyzeFilteredTraversalTargets` hydrates roots with `Promise.all(roots.map((t) => store.getSymbol(t)))` (`analyze-impact.ts:~708`). The fan-out equals the declaration count and is unbounded.

- The resolved path uses `getSymbolsByIds` correctly.
- With 256+ declarations this could trip `StoreOverloadError`.
- Use `getSymbolsByIds`.

**C-10 (LOW, spec gap)**
`detectChanges` duplicates the risk thresholds instead of `computeRiskLevel`, and ignores file categories. Test callers inflate its dependents and risk, unlike `analyzeImpact`. The spec is silent.

**C-11 (LOW)**
`analyzeSpecImpact` unfiltered path (`analyze-spec-impact.ts:60-125`) does per-spec `getSpecDependents`/`getCoveredFiles`/`getCoveredSymbols` and a per-symbol `resolve()`. Outside the batching requirement's text, but not batched.

**C-12 (LOW)**
CRITICAL via "3+ execution flows" is unreachable: `processCount` is always 0 and `affectedProcesses` is always `[]`. The spec says "(when process data is available)", so it is acceptable but dead.

**C-13 (LOW-MEDIUM, unverified)**
"Hierarchy traversal SHALL preserve ... language precedence for contracts, overrides, inherited members, traits, mixins, embedding, promotion, and provable interface satisfaction" is not implemented or tested in the traversal services. They follow persisted EXTENDS/IMPLEMENTS/OVERRIDES edges only. There are no traversal-level tests for traits/mixins/embedding/promotion. This depends entirely on adapters and the indexer (other partials).

**C-14 (LOW)**
Physical-only declarations are classified in `semanticAffectedTargets` (`kind: 'physical-only'`). In the coverage collectors they are silently dropped (`collect-impact-specs.ts:78-95`), with no explicit "coverage-not-applicable" classification on `CoveringSpecImpact`. The scenario "Physical-only declarations are classified explicitly" is satisfied only at the semantic-target level. `project-spec-coverage` has its own classification.

### Test coverage (traversal)

Well covered:

- Upstream/downstream basics, cycles, maxDepth.
- Batched frontier call counts (`traversal.spec.ts:306,439`).
- Risk thresholds, category pruning, anchored test target.
- Logical aggregation, physical-only, depth-0 own coverage.
- Hotspot batch (`compute-hotspots.spec.ts:418`).
- Wide SQLite traversal (`sqlite-wide-traversal.spec.ts`).

Missing tests:

- Hotspot with `maxPendingOperations: 16` (spec scenario "Wide-graph hotspot ranking completes"). `sqlite-wide-traversal.spec.ts` exercises `computeHotspots`; confirm it uses 16.
- All-physical-only coverage skip for file and multi-file impact, and for the unfiltered `collectCoveringSpecs` (C-2).
- Resolved symbol impact where a caller's file is covered by `COVERS_FILE` (C-3).
- Specs-only file impact asserting the `coveringSpecs` depth and evidence (C-4).
- Real-indexer end-to-end public-binding impact (C-1).
- `includeFiles` batching (C-5).
- Memoization of `queryImpactFrontier` across files (C-6).
- Owner-qualified scenarios are not in this package's traversal tests (resolver partials).
- Impact over a diamond or cycle with multiple logical declarations, to check depth minimality of logical aggregation across routes.

---

## Spec 2: code-graph:graph-store

Requirement status:

| Requirement                                                                   | Status              | Evidence                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port, minimum semantics, lifecycle, recreate/clear distinction                | OK                  | `graph-store.ts`; `sqlite-worker-lifecycle.spec.ts:163`; `sqlite-graph-store.spec.ts:1594,1900`                                                                                                                                        |
| Complete logical clear                                                        | OK impl / test GAP  | `sqlite-graph-database.ts:3144-3170` clears all tables plus 4 FTS tables and 3 meta keys inside one transaction (`:441-444`). Contract `clear removes everything` (`graph-store.contract.ts:1857`) checks only file and symbol counts. |
| Storage generation                                                            | OK                  |                                                                                                                                                                                                                                        |
| Atomic upsert, addRelations, removeFile                                       | OK                  |                                                                                                                                                                                                                                        |
| Query methods                                                                 | OK                  |                                                                                                                                                                                                                                        |
| Filtered impact contract                                                      | OK                  | `sqlite-graph-database.ts:3184-3340`                                                                                                                                                                                                   |
| Batched traversal reads, exact batch retrieval                                | OK                  |                                                                                                                                                                                                                                        |
| Statistics                                                                    | OK                  |                                                                                                                                                                                                                                        |
| Spec upsert/removal, search                                                   | OK                  | not re-audited here (search partial)                                                                                                                                                                                                   |
| Bulk ops, reference persistence                                               | OK                  | local-binding ranges persisted: `:3538`; shadowed bindings round-trip in the contract suite                                                                                                                                            |
| Logical/declaration batch lookup                                              | PARTIAL             | declaration to logical mapping assumes 1:1 (C-15)                                                                                                                                                                                      |
| Member-semantics persistence                                                  | OK                  |                                                                                                                                                                                                                                        |
| Logical-symbol coverage endpoints / batched coverage lookup                   | PARTIAL             | frontier emits physical `COVERS_SYMBOL` targets (C-16); stale metadata contradiction (S-1)                                                                                                                                             |
| Source-content candidates, incompatible store, freshness, single-session bulk | OK / not re-audited |                                                                                                                                                                                                                                        |

### Discrepancies

**C-15 (LOW-MEDIUM)**
`findLogicalDeclarationsByDeclarationIds` (`sqlite-graph-database.ts:1347-1371`) keeps the first row per `symbol_id` with no `ORDER BY`, and the schema PK `(logical_symbol_id, symbol_id)` permits one physical declaration to map to several logicals (declaration merging, overload-like cases). `analyze-impact.ts:395` and `collect-impact-specs.ts` also keep one mapping (`Map.set` overwrite). The result is nondeterministic or lossy. The real DB currently has 0 such cases. A unique index, or all rows ordered deterministically, would close it.

**C-16 (MEDIUM, spec/code)**
`queryImpactFrontier` for `resource: 'symbol'`, downstream, `COVERS_SYMBOL` rewrites `relation.target` from the logical id to `ld.symbol_id` (physical) (`sqlite-graph-database.ts:3207-3212,3270`). The in-memory store mirrors it (`in-memory-graph-store.ts:629-647`).

- The returned `Relation` therefore claims a `COVERS_SYMBOL` to a physical id. This contradicts "Coverage queries SHALL preserve the logical target ID ... a declaration-occurrence `SymbolNode.id` MUST NOT be the canonical target".
- It is defensible as a traversal-hydration shortcut, but it is not documented in the port, and `analyze-spec-impact.ts:~230` relies on it. The fallback there (`getSymbolsByIds(relations.map(target))`) treats relation targets as physical ids.

**C-17 (LOW)**
`recreate()` host (`sqlite-graph-store.ts:757-760`) calls `invalidateBulkSession()` before the open check. A rejected `recreate()` on an open store therefore kills an active bulk session while the store stays open. The spec says rejection is a pure precondition error. Not tested.

**C-18 (LOW)**
Host `findLogicalSymbols` (`sqlite-graph-store.ts:855-859`) and `findLocalBindings` (`:957-961`) have no empty-input short-circuit (other batch lookups do). The spec's "no backend work for empty input" is explicit for declaration mapping only, so this is minor. The DB layer does guard `findLocalBindings`.

**C-19 (LOW)**
`GraphStore` is an abstract class but ~20 reference-fact methods are non-abstract defaults that `reject('not supported')` (`graph-store.ts:302-493`), so an incomplete backend compiles. Spec silent.

**C-20 (LOW)**
Spec requires "relation endpoint validation and hierarchy/method lookup SHALL have batch operations" on the Store (Single-session bulk indexing). The port exposes no such operations. The SQLite adapter does it internally (`loadExistingIds`), so the observable guarantee holds, but a non-SQLite backend has no hook.

### Spec-vs-spec issues (graph-store)

- **S-1 (MEDIUM)**
  - Minimum graph semantics: `COVERS_SYMBOL` "MAY carry `metadata.stale` when the archived link no longer resolves to a live indexed symbol".
  - Logical-symbol coverage endpoints: relations whose logical target is missing "MUST be rejected" (sqlite spec: dropped and diagnosed).
  - A stale link cannot persist under the second rule. Code emits `stale: false` only (`index-code-graph.ts:1433,1627`) and never `true`. The stale feature is dead. One of the two statements should be removed.
- **S-2 (LOW)**
  - "Reference and coverage persistence" says lookups by "member form".
  - "Member-semantics persistence" says "MUST NOT keep a `memberForm` field".
  - Terminology conflict: use "member semantics".
- **S-3 (LOW-MEDIUM)**
  - Search scenario "Persisted file content does not introduce file search surface ... no separate file full-text search category".
  - "Source-content search candidates" requires `searchSourceContentCandidates` over `FileNode.content`, and `file_content_fts` exists.
  - The older scenario is stale.
  - `sqlite-graph-store` Default backend role also lists "file ... discovery" among required search. The three statements need reconciling.

### Test coverage (graph-store)

Present: contract suite run against SQLite and the in-memory store (batches, ordering, filtered frontier, coverage, categories, reference facts, observations); wide-traversal.

Missing or weak:

- Complete logical clear: no test populating observations, reference facts, latches, coverage and FTS then asserting empty (including `index_coverage` cannot cause skip). The contract test checks two counters.
- Clear rollback on injected failure (`sqlite-graph-database.ts` transaction): none.
- "Clear contract is backend-neutral" shared suite: only stats.
- "Missing and occurrence-only targets fail endpoint validation" and "Physical symbol rejected as coverage target": verify they exist in `graph-store.contract.ts:1207`; the in-memory store may differ from SQLite validation.
- Display-path derivation never calls exact batch retrieval: no test in code-graph (CLI-level).
- Bulk: one begin / one commit / one semantic and one content-FTS rebuild is not asserted by counting.

---

## Spec 3: code-graph:sqlite-graph-store

Requirement status:

| Requirement                                                 | Status                          | Evidence                                                                                                               |
| ----------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| SQLite-backed implementation, worker non-blocking execution | OK                              | lifecycle/backpressure/responsiveness specs                                                                            |
| Worker-efficient batch reads                                | OK                              | chunking `getSqliteInputChunkSize`, `chunksOf`; tests `sqlite-graph-store.spec.ts:412-1147`                            |
| Query-time filtered impact reads                            | PARTIAL                         | SQL predicates OK; host does not normalize (C-21); no SQL or dispatcher assertion (T-1)                                |
| Exact batch node lookups, logical declaration mapping       | OK                              | `:702-780`, `:1311-1371`; chunk size is 900 constant, not accounting for fixed parameters, but these queries have none |
| Config-derived layout, default backend, sidecar             | OK                              |                                                                                                                        |
| Destructive recreation, locked recreation                   | PARTIAL                         | S-4                                                                                                                    |
| Logical clear parity                                        | OK impl / weak tests            |                                                                                                                        |
| Schema ownership, node storage, relation storage            | OK                              | `schema.ts`                                                                                                            |
| Logical coverage integrity (`relationEndpointsExist`)       | OK                              | `sqlite-graph-database.ts:4755-4770` requires `ids.logicalSymbols`                                                     |
| Batched logical coverage reads                              | OK                              | joins `logical_symbols` (`:883-908`)                                                                                   |
| FTS                                                         | not re-audited (search partial) |                                                                                                                        |
| Transactional mutation, bulk indexing                       | OK                              |                                                                                                                        |
| Schema versioning, reference schema upgrade (v15)           | PARTIAL                         | see schema-15 question and C-22                                                                                        |

### Discrepancies

**C-21 (LOW)**
Spec: the filter is normalized before the worker request ("duplicate filter values SHALL be normalized before the worker request"; "SQLiteGraphStore SHALL send the normalized filter unchanged").

- Host `queryImpactFrontier` (`sqlite-graph-store.ts:409-414`) sends the raw `{ input }`. Normalization (dedupe, sort) happens in the worker-side database (`sqlite-graph-database.ts:631-632,3227,3262`), and `relationTypes: []` still costs an RPC.
- Results are correct; the layering differs from the spec text.

**C-22 (LOW)**
Same-version structural drift is not detected (schema-15 section above). Also `assertExistingSchemaCompatible` treats an existing `meta` table without a `schemaVersion` row as compatible and stamps it (`:2697-2702`).

**S-4 (MEDIUM, spec/code)**
sqlite `Destructive recreation` says recreate "remove[s] the graph persistence directory including SQLite companion files".

- The code removes only `code-graph.sqlite`, `-wal`, `-shm` (`sqlite-graph-store.ts:762-768`, `sqlite-graph-database.ts:423-428`).
- Directory removal would delete `graph/index.lock` (`index-lock.ts:48-50`) and `storage.epoch`, which contradicts "recreate MUST NOT delete a live `index.lock`".
- The code is the consistent reading. Fix the spec text. The `index.lock` survival test exists (spec scenario) in `index-lock.spec.ts`/store spec.

**S-5 (LOW)**
`Schema versioning` still lists the open order "executes the current schema definition, then verifies version". The code (correctly, per `Reference schema upgrade`) verifies the version before executing DDL (`:366-369`). Text is stale.

**C-23 (LOW)**
Local-binding insert has no dedupe/`OR IGNORE`: `INSERT INTO local_bindings ... PK(id)` (`:3538`). The in-memory session dedupes by id (`in-memory-index-session.ts:144,189`) and `reference facts` chunk merge in the worker concatenates (`sqlite-worker.ts:144`). A direct `replaceReferenceFacts` or `writeReferenceFacts` with duplicate ids throws a UNIQUE constraint error. `symbol-index.spec.ts:339` exercises duplicates only against the in-memory path. The spec allows rejecting duplicates; flagging as an untested edge.

### Test coverage (sqlite-graph-store)

Present: schema 15 DDL (`:1631`), reject versions 10-14 and 16 (`:1670`), reopen v15 (`:1706`), v14 to v15 recreate with new epoch (`:1810`), `occurrence_form` round-trip (`:810`), local-binding range round-trip through the contract suite (`graph-store.contract.ts:846-1043`), qualified-name equality (`:797,1770`), chunking families, locked WAL retry (`:1562,1578`), rollback of upsert/bulk.

Missing:

- **T-1.** Filtered-impact scenarios "SQLite filters before crossing the adapter boundary" (no SQL statement inspection) and "Worker transports the normalized request losslessly" (no dispatcher or protocol test for `queryImpactFrontier`; `sqlite-worker-protocol.spec.ts` has none).
- **T-2.** Logical clear completeness and rollback, as above.
- **T-3.** FTS and source-content index rebuilt exactly once per bulk commit.
- **T-4.** Pre-amendment same-version DB (C-22): no test either way.
- **T-5.** `recreate()` on an open store with an active bulk session (C-17).
- **T-6.** `symbol_fts` carries no extra column (`Qualified spelling is an equality column` scenario): only the `qualified_name` equality index is asserted (`:1798`).
- **T-7.** "Search text is not identity" negative lookup scenario.
- **T-8.** "Partial member axes do not match a different member" and "Non-member leaves member axes empty": confirm in the contract/sqlite specs; not individually located.

---

## Cross-spec / global consistency summary

- traversal vs graph-store: consistent on batch signatures and on `getCoveringSpecsForSymbol(s)` taking logical ids (port renamed to `logicalSymbolId`/`logicalSymbolIds`, matching the spec).
- Contradictions to fix in specs: S-1 (stale vs reject), S-2, S-3, S-4, S-5. Code-vs-spec: C-1, C-2, C-3, C-4, C-16.
- Global specs not re-read in this batch beyond architecture (domain services pure, no `@specd/core` import): OK. Traversal functions live in `domain/services/`, never mutate the store (`traversal.spec.ts:1164`).

## Counts by severity

- HIGH: 1 (C-1)
- MEDIUM: 6 (C-2, C-3, C-4, C-6, C-16, S-1) plus S-4 (spec text), so 7 listed
- LOW-MEDIUM: 3 (C-5, C-13, S-3)
- LOW: 14 (C-7, C-8, C-9, C-10, C-11, C-12, C-14, C-15, C-17, C-18, C-19, C-20, C-21, C-22, C-23, S-2, S-5)
- Test gaps: T-1 to T-8 plus the ones listed under each spec (the most important are clear completeness and rollback, and the all-physical-only multi-file case)

## Top 5

1. C-1: exact public-binding impact is structurally empty on real indexes (0 of 5922 bindings have inbound relations). The tests use synthetic binding-targeted edges.
2. C-2: legacy `collectCoveringSpecs` still falls back to physical ids as logical coverage ids on the unfiltered multi-file path.
3. C-3 and C-4: resolved symbol impact ignores covering specs of reached files; file impact fabricates `minDepth: 1` and empty evidence under a specs-only filter.
4. C-16 and S-1: frontier reads rewrite `COVERS_SYMBOL` targets to physical ids, and the spec's "stale" coverage is contradicted by logical-endpoint rejection (stale is never emitted).
5. Schema-15 drift: no spec requires recreate and the code raises an untyped `SqliteError`. Add a structural guard or a doc note. Separately, the complete-clear completeness and rollback tests are missing.
