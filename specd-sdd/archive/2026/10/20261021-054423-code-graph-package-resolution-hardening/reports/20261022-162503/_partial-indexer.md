# Partial compliance audit (batch B): indexer, resolve-symbol-reference, symbol-model, sqlite-graph-store, index-project-graph

Change: code-graph-package-resolution-hardening. Read-only. Merged specs fetched with `changes spec-preview`; code re-read against the CURRENT working tree (an earlier partial from 140310 exists; several of its findings are now fixed, noted below). Tests not re-run (reported 1433 passing). Neither spec nor code is presumed correct; each discrepancy gives both readings.

## Summary counts

| Spec                                          | Changed reqs | Status                                            | Discrepancies                      | Test gaps |
| --------------------------------------------- | ------------ | ------------------------------------------------- | ---------------------------------- | --------- |
| code-graph:indexer                            | 4            | Implemented; 1 partial (partial-run incremental)  | 5 (0 HIGH, 2 MED, 3 LOW)           | 6         |
| code-graph:resolve-symbol-reference           | 1            | Implemented                                       | 2 (LOW)                            | 3         |
| code-graph:symbol-model                       | 1            | Implemented                                       | 1 (LOW)                            | 2         |
| code-graph:sqlite-graph-store                 | 2            | Implemented (code); spec internally contradictory | 4 (1 HIGH spec, 1 MED spec, 2 LOW) | 2         |
| code-graph:index-project-graph                | 2            | Fully implemented                                 | 1 (LOW, spec gap, pre-existing)    | 0         |
| Global specs (\_global/testing, architecture) | -            | -                                                 | 4 (LOW/MED)                        | -         |

Totals: 17 discrepancies (1 HIGH [spec text], 4 MED, 12 LOW), 13 test gaps.

Fixed since the earlier partial (verified in code now): D1 stale `fileCategories` (now `fileCategories.set(...)` at index-code-graph.ts:1214); D5 namespace/separator pairing (`createFileNode` defaults separator to `.`, drops separator-only); D6 zero parsed candidates now returns `unresolved(REFERENCE_UNPROVEN)` (resolve-symbol-reference.ts:1047); D8 `index-project-graph` delta now exists and code matches; the e2e test-importer test (package-resolution.spec.ts:387) now asserts symbol-level EXTENDS and impact, not only file IMPORTS.

---

## 1. code-graph:indexer

### Requirement status

- Shared indexing session (hydrated + analyzed files fill qualified-name lookup; test symbols hidden from non-test importers, visible to test importers): IMPLEMENTED. `InMemoryIndexSession.hydratePersistedFile` and `registerAnalysis` fill `qualifiedNameSymbolMap` / `testQualifiedNameSymbolMap` from `namespace`+`namespaceSeparator` (default `.`); `getQualifiedNames({includeTests})` merges (production wins duplicates); indexer passes `includeTests: fileCategories.get(path) === 'test'` (index-code-graph.ts:1385-1387), map now updated for processed files (:1214). Hydration runs for retained files whenever `persistedReferenceFacts` is defined (:872-890).
- Cross-workspace package resolution: IMPLEMENTED.
  - Per-workspace repo root via `RepositoryRootSource` (`VcsRepositoryRootSource` -> `createVcsAdapter(codeRoot).rootDir()`, throw/reject -> undefined, deduped per codeRoot, wired in create-code-graph-provider.ts:73); project root is only `PackagePrepareContext.projectRoot`, not a boundary.
  - Every adapter with the facet is asked per workspace; `report` diagnostics appended to `errors` without disabling; identity throw -> error, adapter added to `disabledPackageResolution`, sole-claimed identities purged (`purgeDisabledAdapterClaims`), `reExportLinking.link` still called (with empty map for disabled adapters); `prepare` throw -> same.
  - Collision: error names all claimants, identity deleted from map; same workspace via several adapters is not a conflict.
  - Map and `prepare` use `configuredWorkspaces ?? workspaces`, filtered by accessibility; inaccessible -> `errors` entry `"<ws>:<manifest>"` ("skipped for package resolution ... not accessible"), not fatal. SDK passes `configuredWorkspaces: listed` (sdk run-index-project-graph.ts:94).
  - `PackageImportResolver` (application/services/package-import-resolver.ts) is generic (no language/manifest branching), filters entries to indexed + non-test, requires all hits to share one target (else `ambiguous`), reasons `facet-absent` / `package-unknown` / `no-entry-surface` / `not-exported`, no name search.
  - Diagnostics: `package-unknown` -> `externalPackageImports` only; `facet-absent` excluded from total/byReason/samples; samples capped; `adaptersWithoutPackageResolution` = distinct adapter instances (no facet or disabled) by first declared language, sorted.
- Identity-sensitive incremental equivalence: IMPLEMENTED for the PHP path; see I1 and G3 (weak for Python/Go).
- Package import incremental closure (addition-only fallback only for new code files): IMPLEMENTED (`addsCode` uses `registry.getAdapterForFile`, index-code-graph.ts:814-819). Fingerprint mismatch path sets `newFiles = allDiscoveredPaths`, so manifest edits re-extract everything.

### Discrepancies

I1 (MED) Python and Go do not feed the qualified-name lookup, contradicting the spec's "PHP, Python, and Go".

- Evidence: only `php-language-adapter.ts:764` emits `namespace`/`namespaceSeparator`. `grep namespace` in python/go adapters finds no emission (only a doc comment). Python (:958) and Go (:771) read `qualifiedNames.get(imp.specifier)`, but the map can never contain their symbols, so that branch is dead for them. The new equivalence requirement and scenario "Name-addressed imports match a clean rebuild" say PHP, Python, and Go depend on the hydrated lookup.
- Code-wrong reading: Python/Go adapters should report `namespace`/`namespaceSeparator` (module path / package path) in analysis if their name-addressed imports are meant to resolve through it.
- Spec-wrong reading: narrow the requirement/scenario to "namespace-bearing languages (PHP)" and say Python/Go resolve through package resolution/relative routes. Also a Go-file-has-no-namespace statement (symbol-model scenario) is only true because of this gap.

I2 (MED) Partial incremental runs do not re-resolve importers when an UNSELECTED configured workspace changes (carry-over from earlier D3, still present).

- Evidence: `computeWorkspaceFingerprint(..., options.workspaces, ...)` and `collectAffectedFileClosure` operate on selected workspaces only (index-code-graph.ts:619-633, 2096). If workspace B (configured, not selected) changes its manifest/entry, importers in selected A are not re-extracted in an `--workspace A` run.
- Spec: "the result for an indexed workspace does not depend on which subset was requested" and closure must re-extract importers when a manifest or "the set of workspaces" changes.
- Code-wrong: feed `configuredWorkspaces` identities/manifests into the fingerprint or closure seeds. Spec-wrong: restrict the "does not depend on subset" sentence to the first/clean run and the map/prepare data, and state that stale importers are repaired by the next full run. The verify scenario "Partial run maps and prepares every configured workspace" is also silent on the precondition that B must already be indexed in the store.

I3 (LOW) Collision/claim state is not recomputed when an adapter is disabled.

- Evidence: `claims` (workspace claimants) is never purged by `purgeDisabledAdapterClaims`; only `packageToWorkspace` is. Example: adapter1 claims X on ws A and later fails on ws C; ws B then claims X via adapter2 -> `claims.get(X)={A}` (stale) -> reported as collision and X unresolved, although adapter1 is supposedly "not providing packageResolution".
- Code-wrong: remove disabled adapter's claimants from `claims` and recompute. Spec-wrong/acceptable: spec only says identities "claimed solely by that adapter ... SHALL be removed"; it does not say a collision with a disabled adapter is withdrawn. Narrow edge.

I4 (LOW) Application layer performs filesystem I/O directly (global architecture spec, "Application layer uses ports only").

- `existsSync`/`statSync` for workspace accessibility added in index-code-graph.ts:897 while a `RepositoryRootSource` port was introduced for VCS. The file already imported `node:fs` for staging/reads (pre-existing violation), so this extends it.
- Code-wrong: route accessibility through a port (or the RepositoryRootSource/ManifestSource). Spec-wrong: none; architecture spec has no exception for staging. Also, the unit-test requirement ("unit tests must not touch the filesystem") is violated by the new indexer test files (they use real temp dirs); pre-existing pattern in this package.

I5 (LOW) Spec wording ambiguities.

- Scenario "Production importers never resolve to a test symbol": "a symbol in a test file with the same qualified name as no production symbol" is garbled (probably "with no production symbol of that qualified name").
- Spec does not state precedence when a test importer sees both a production and a test symbol with the same qualified name (code: production wins, `getQualifiedNames` merge order). Covered only by the session unit test.
- Inaccessible-workspace diagnostic shares the `IndexResult.errors` channel with real failures, so a healthy run with an uncloned repo has non-empty `errors`; spec explicitly asks for it, so code is compliant, but the CLI prints `errors: N` (not failing). Consider a distinct warning channel in spec.

### Test gaps (indexer)

G1 (MED) "Partial run maps and prepares every configured workspace" (index-code-graph-package-resolution.spec.ts:293) is much improved (touches an app file, asserts `filesIndexed === 1` and an `import:package` step) but still never compares the result with a both-workspace run (the scenario's THEN), and does not cover I2 (changed B manifest in a later partial run).
G2 (MED) Inaccessible workspace test (:331) asserts only the diagnostic; not "imports of its packages count as external" (`externalPackageImports`) nor "other workspaces indexed normally" (e.g. `filesIndexed`, an unaffected import resolving).
G3 (MED) Incremental equivalence tests (index-code-graph-incremental.spec.ts:119-233): single mutation (prepend comment to consumer). Python uses a relative import and Go has no import at all (same `package main`), so neither exercises the hydrated qualified-name lookup (and cannot, see I1). PHP can pass through the PSR-4 fallback without the hydrated lookup. No rename/move/delete/add mutation; no assertion that the hydrated lookup was used. Prepending `// ...` before `<?php` also turns the comment into inline HTML, which is an odd mutation.
G4 (LOW-MED) Addition-only fallback has only the negative test (:237, whose describe title says "still re-extract" but asserts the opposite). The positive case is covered indirectly by index-code-graph.package-imports.spec.ts:600 (target appears later, equals clean rebuild) but there is no test that distinguishes new code file vs non-code file as the trigger with a previously-unresolved import.
G5 (LOW) "Adapter disabled on a later workspace drops earlier sole identities" (:410) is near-vacuous: with a single adapter, `PackageImportResolver` already returns `facet-absent` for a disabled adapter, so the absence of an `import:package` step does not prove the identity was purged. Needs a second, healthy adapter importing that package. No test for prepare-throw identity purge, and none for `report` diagnostics being appended to `errors` without disabling the adapter.
G6 (LOW) Test-importer scenario: indexer-level coverage is only the PHP end-to-end test (package-resolution.spec.ts:387) with `autoload-dev` PSR-4 present; there is no incremental-run variant (new test file importing an unchanged hydrated test helper; file whose category changes), which is exactly the regression class of the fixed D1.

---

## 2. code-graph:resolve-symbol-reference

### Requirement status: IMPLEMENTED

- `resolveQualifiedMember` (resolve-symbol-reference.ts:1018) matches only stored `target.qualifiedName` (no derivation), needs no file/surface/language, `::` mapped to dotted via `qualifiedLookupText`, anchored filter via `symbolVisibleIn`, all matches returned via `outcomeFromTargets`.
- Other owner-qualified text: adapter by explicit `language`, else `registry.getAdapterForFile(filePath ?? publicSurface)`; no adapter / no `symbolReferenceSyntax` / zero candidates -> `unresolved(REFERENCE_UNPROVEN)` (:1043-1047, :1094-1113). No generic dotted parser, no default language, no other adapter.

### Discrepancies

R1 (LOW) "Language of the indexed anchored file / public surface" is implemented as plain extension matching on the anchor string (`getAdapterForFile`), without checking the anchor is indexed or reading stored language. Spec was reworded to "inferred from the file extension", so compliant; code-wrong only if stored language was intended. An explicit `language` that no registered adapter serves also yields unresolved (acceptable).
R2 (LOW) Anchor precedence: `filePath ?? publicSurface` means a `filePath` with no adapter never falls back to the surface's adapter; spec order lists file before surface, so consistent, but the "no remaining adapter" phrase does not say whether to try the next anchor. Spec ambiguity.

### Test gaps

T1 (LOW) Scenario "Anchor without an adapter..." (resolve-symbol-reference.spec.ts:1526) passes explicit `language: 'go'` together with a `.go` file and asserts only `status === 'unresolved'` (not `reasonCode === 'REFERENCE_UNPROVEN'`); the scenario's actual path (Go package surface anchor, no explicit language, no extension) is not tested. Text `Calculator.Add()` includes parentheses so it does not even reach `qualifiedLookupText`.
T2 (LOW) No test for: no anchor + no language + human text -> unresolved; adapter without facet via file extension only; explicit language with no registered adapter.
T3 (LOW) "Qualified name not derived" test (:1573) covers the unanchored path only; the anchored equality path with a divergent stored qualified name is untested.

---

## 3. code-graph:symbol-model

### Requirement status: IMPLEMENTED

`FileNode.namespace?` / `namespaceSeparator?`; `createFileNode` includes both only when namespace is defined, defaults separator to `.` when absent, drops separator-only input; not part of equality. PHP adapter emits `namespace` + `\`; Python/Go emit none.

### Discrepancies

S1 (LOW) "namespaceSeparator present iff namespace present" is enforced only in `createFileNode`. The `FileNode` interface permits either field alone, `SQLiteGraphDatabase` writes `file.namespace ?? null` / `file.namespaceSeparator ?? null` independently, and `mapFileRow` reads them independently (no CHECK constraint, matching the sqlite spec "both null or both set"). Plain-object FileNodes (tests, other stores) can violate it.

- Code-wrong: normalise on write or add a CHECK constraint. Spec-wrong: relax to "separator defaults to `.` when absent", matching consumers (`hydratePersistedFile` defaults `.`).

### Test gaps

- file-node.spec.ts:162 covers the pairing rules with literals only. No test that the indexer persists PHP namespace + `\` onto the stored FileNode end to end, and none that a Go/no-namespace file reads back with neither field (scenario's literal PHP `App\Models` / Go example is not exercised through adapters or the indexer).

---

## 4. code-graph:sqlite-graph-store

### Requirement status: CODE IMPLEMENTED, SPEC INTERNALLY CONTRADICTORY

- `SQLITE_SCHEMA_VERSION = 16`; `files` DDL has nullable `namespace`, `namespace_separator`; all `files` SELECT/INSERT/UPSERT/search-join paths (single, bulk, getFilesByPaths, getAllFiles, by project path, file-content search joins at sqlite-graph-database.ts:1993/2033) include them; `mapFileRow` maps null -> absent. Versions != 16 are rejected by the existing equality check, no ALTER TABLE. Tests: DDL contains columns (sqlite-graph-store.spec.ts:1690), `it.each` rejects 10-15 and 17 (:1717), 15 rejected for reads then `recreate()` gives 16 + new epoch + new columns (:1863), namespace round-trip single/batch/all (:3122-3166).

### Discrepancies (mostly spec text stale after the bump to 16; this change did not delta these scenarios)

Q1 (HIGH, spec-wrong) Scenario "Version 15 opens without rebuild" (merged verify, "GIVEN meta.schemaVersion is already 15 ... WHEN the store opens for a read THEN it does not throw GraphSchemaIncompatibleError and does not recreate") directly contradicts the modified requirement and the new scenario "Version 15 database is rejected after the bump". Code and tests follow the new requirement. Fix the spec (update/remove the scenario to version 16 in the change delta).
Q2 (MED, spec-wrong) Scenario "Unsupported schema versions are incompatible" says "older than 14 or newer than 15 ... no rows beside schema 15 rows", while the requirement says older than 15 / newer than 16 are rejected. Scenario "SQLite schema 14 rebuilds safely as 15" (expects schema 15) and "Version 15 database missing a required column is recreated" and "Worker row uses schema 15 declaration columns" / "bulk schema 15 generation" are likewise anchored to 15. Test `it.each` (10..15, 17) matches the requirement, not the stale scenario.
Q3 (LOW, spec-wrong) Requirement text: "These [local_bindings range] columns belong to schema version 15, which this change introduces; no separate version is created" and "Version 16 is introduced by this change": two versions both claimed as introduced by this change. HEAD already had `SQLITE_SCHEMA_VERSION = 15`, so the v15 sentence is stale/inconsistent (if v15 was already released) or the change is bumping twice (if not). Clarify.
Q4 (LOW) "namespace and namespace_separator are both null or both set" is not enforced by DDL (no CHECK) or the writer (see S1). Same two readings.

### Test gaps

- Namespace round-trip through the bulk/worker commit path used by indexer runs and the file-content-search result rows (which now select the namespace columns) is not tested; the unit tests use direct upserts. The `GraphSchemaIncompatibleError` type is asserted via `reason` in one test and via `GraphStorageRecoveryRequiredError` in the `it.each`; the requirement's "`graph index` recreates derived storage" is covered at store-level (`recreate()`), not through `graph index`/SDK in this package (SDK lifecycle is outside this batch).
- `graph-store.contract.ts` has no namespace round-trip case, so alternative stores (in-memory) are not checked against the contract.

---

## 5. code-graph:index-project-graph

### Requirement status: FULLY IMPLEMENTED

`IndexProjectGraphInput.configuredWorkspaces?` forwarded unchanged to `provider.index()` (index-project-graph.ts:15, :41-43); force forwarded as `force: true` only when true; no lifecycle calls. Test: index-project-graph.spec.ts "forwards configuredWorkspaces to provider.index" (+23 lines); SDK passes `listed` and has a spec (sdk/test/orchestration/run-index-project-graph.spec.ts:100).

### Discrepancies

P1 (LOW, pre-existing spec gap) Input also carries `derivationMismatch` and `getSpecMetadata`, forwarded to the provider, but neither the "MUST include" list nor the "options built from" list names them (nor `force` in the first list). Extra fields are not forbidden, so no violation; spec could list them. The Spec Dependencies bullet still says graph-store "recreate semantics for `--force`" although the spec now forbids calling `recreate()` (pre-existing wording).
P2 (LOW) Test uses `specRepo: {} as unknown as ProjectWorkspace['specRepo']` (index-project-graph.spec.ts), which `_global/testing` forbids ("No partial mocks with `as unknown as Port`").

---

## 6. Global spec / dependency cross-checks

- \_global/testing, Test naming: titles should read "given <state>, when <action>, then <outcome>". Many new titles are "Scenario: ..." or bare scenario names (in-memory-index-session.spec.ts, resolve-symbol-reference.spec.ts:1526/1573, file-node.spec.ts:162, package-resolution.spec.ts:387, index-code-graph-package-resolution.spec.ts:410). Also test files should match the source file name: `index-code-graph-incremental.spec.ts`, `index-code-graph-package-resolution.spec.ts`, `use-cases/package-resolution.spec.ts` have no same-named source (the resolver lives at application/services/package-import-resolver.ts). LOW.
- \_global/testing, Port mocks: `RepositoryRootSource` is mocked with object literals (full single-method port, acceptable); `as unknown as` partial mock noted in P2. A name-based heuristic `codeRoot.includes('graph')` (index-code-graph-package-resolution.spec.ts:416) could misfire if a host tmp path contains "graph"; use equality with `graphDir`.
- \_global/architecture: see I4. Public barrel `src/index.ts` now re-exports `findPackageManifest` / `findManifestField` from `infrastructure/tree-sitter/find-manifest-field.js`; the architecture spec says public barrels must not export infrastructure implementations, but the barrel already exports `SQLiteGraphStore`, adapters, and the index lock, so this follows existing practice (flag as consistent-with-precedent, LOW).
- Dependencies: `code-graph:language-adapter` delta (batch A) already defines `identity(codeRoot, repoRoot?, report?)` and the indexer code calls it with `(codeRoot, repoRoot, report)`; consistent. `code-graph:composition` and `code-graph:workspace-integration` do not mention `IndexOptions.configuredWorkspaces` or that `projectRoot` is no longer a package-resolution boundary (code docs in index-options.ts say so); no contradiction, but undocumented there (LOW spec gap; no delta targets those specs).
- docs/code-graph (modified in working tree) not audited here.

## Top issues (ranked)

1. Q1/Q2: sqlite-graph-store verify scenarios still assert schema 15 behaviour that the change now forbids (spec contradiction; fix via deltas).
2. I1: Python/Go never populate the qualified-name lookup, so the indexer spec claim and the incremental equivalence tests for them are hollow (spec or adapters must change).
3. I2 (+G1): partial incremental runs can leave importers stale when an unselected workspace changes.
4. G3/G5/G6: weak tests for incremental equivalence, identity purge, and test-importer incremental case.
5. I4: new direct `node:fs` use in the application layer.
