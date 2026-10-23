# Partial compliance audit: indexer, symbol-model, sqlite-graph-store, resolve-symbol-reference

Change: code-graph-package-resolution-hardening. Scope: delta requirements and verify scenarios of the four specs, checked against the uncommitted working tree in packages/code-graph (+ sdk wiring) and tests. Read-only; no code/spec modified. Method: delta files read in full, merged specs skimmed, code read with git diff + targeted reads. Tests not re-run (reported passing: 1429).

Neither spec nor code is assumed correct; each discrepancy lists both readings.

## Counts

| Spec                                       | Reqs audited                                                                                    | Implemented       | Discrepancies            | Test gaps |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------ | --------- |
| code-graph:indexer                         | 4 (Shared session, Cross-workspace resolution, Incremental equivalence, Package import closure) | 3 full, 1 partial | 4 (1 HIGH, 2 MED, 1 LOW) | 5         |
| code-graph:symbol-model                    | 1 (File node namespace)                                                                         | yes               | 1 (LOW)                  | 0         |
| code-graph:sqlite-graph-store              | 2 (Persisted node storage, schema v16)                                                          | yes               | 0                        | 1 (minor) |
| code-graph:resolve-symbol-reference        | 1 (Structured reference input)                                                                  | yes, 1 nuance     | 2 (LOW)                  | 1         |
| Cross-spec (index-project-graph, \_global) | -                                                                                               | -                 | 1 (MED)                  | -         |

Totals: 8 discrepancies (1 HIGH, 3 MED, 4 LOW), 7 test gaps (2 HIGH-value).

---

## 1. code-graph:indexer

### 1.1 Shared indexing session (qualified-name lookup, hydrated files, test exclusion)

Implementation:

- `InMemoryIndexSession.hydratePersistedFile` fills `qualifiedNameSymbolMap` / new `testQualifiedNameSymbolMap` from persisted `namespace`+`namespaceSeparator` (default `.` if separator missing). `registerAnalysis` does the same for analysed files. `findSymbolByQualifiedName` / `getQualifiedNames` take `{includeTests}` and return merged map (production wins on duplicate). OK.
- Indexer passes `includeTests: fileCategories.get(prefixedPath) === 'test'` (index-code-graph.ts ~1369).

#### D1 (HIGH) `fileCategories` is never updated for new/changed files, so the importer-is-test decision is wrong

- Evidence: `fileCategories` is built once from `existingFiles` (index-code-graph.ts:1032) and has no `.set` anywhere (greps: lines 1032, 1258, 1369 only; `fileLanguages` does get `.set` at 1197, categories do not). In Pass 2 the `includeTests` flag uses that stale map.
- Effect: in a clean run (empty `existingFiles`) every importer is treated as non-test, so a new test file importing a test helper by qualified name gets no local binding via `qualifiedNames`. Same for a file that changed category (stale old category). Violates "An importing file that is itself a test SHALL see test symbols" and verify scenario "A test importer resolves to a test helper".
- Why tests pass: the end-to-end PHP test (package-resolution.spec.ts:387) only asserts the file-level `IMPORTS` relation and impact on files; PHP adapter falls back to `packageEntryFiles` (PSR-4) at php-language-adapter.ts:996-1005 which allows test importer to test target. The symbol-level path (`importMap` through `qualifiedNames`) is masked. The only direct test of `includeTests` is the session unit test (in-memory-index-session.spec.ts), which does not exercise the indexer decision.
- Possibility A (code wrong): use `session.getFileCategory(prefixedPath)` (already registered with the fresh category during Pass 1) instead of `fileCategories`. Likely the intended behaviour.
- Possibility B (spec wrong/too strong): none plausible; spec text and scenario both require test importers to see test symbols.

#### D2 (LOW) Hydration only on one path

- `hydratePersistedFile` runs only when `persistedReferenceFacts !== undefined` (semanticRefreshRequired: coverage exists and files changed). The separate "unchanged files" loop (index-code-graph.ts ~1246-1272) registers analyses with no `namespace`, so unchanged files would contribute no qualified names when hydration did not run (e.g. existing files but zero coverage rows). Edge case; the spec says "filled identically ... for files hydrated from the persisted store".
- A (code): pass `namespace`/`namespaceSeparator` from `existingFiles` in that loop. B (spec): acceptable if that path cannot coexist with reprocessing; then state the precondition in the spec.

### 1.2 Cross-workspace package resolution

Implemented and matching spec:

- Per-workspace repo root via `RepositoryRootSource` (VcsRepositoryRootSource -> `createVcsAdapter(codeRoot).rootDir()`; throw (NullVcsAdapter) or rejection -> `undefined`; deduped per codeRoot; never rejects). Project root no longer used as boundary (`projectRoot` separate field in `PackagePrepareContext`; `repoRoot` per workspace in analyze/resolve/relation contexts).
- Every adapter asked for identity per workspace; identity throw -> error recorded, adapter added to `disabledPackageResolution`, `reExportLinking.link` still called (with empty `packageToWorkspace`). `prepare` throw -> same.
- Collision: claims map, identity removed from map (resolves to no workspace), error names all claimants; same workspace through several adapters is not a conflict.
- Map and `prepare` cover `configuredWorkspaces ?? workspaces`, filtered by accessibility. SDK passes `configuredWorkspaces: listed` (sdk/src/orchestration/run-index-project-graph.ts:94).
- `PackageImportResolver` is generic (no language/manifest branching; verified by grep), filters entries to indexed non-test, resolves only when all hits share the target, reason codes `facet-absent` / `package-unknown` / `no-entry-surface` / `not-exported` / `ambiguous`.
- `externalPackageImports` counts `package-unknown` only; `facet-absent` excluded; `adaptersWithoutPackageResolution` = distinct adapter instances by first declared language, sorted.

#### D3 (MED) Partial-run correctness is only guaranteed for the first run, not for incremental partial runs

- Fingerprints (`computeWorkspaceFingerprint(..., options.workspaces, ...)`) and the incremental closure use only the selected workspaces. If workspace B (configured but not selected) changes its manifest/entry or is newly added, importers in selected workspace A are not re-resolved in a partial run (A's files are unchanged so nothing is reprocessed; addition-only fallback considers only new files in the selected set).
- Spec text: "so the result for an indexed workspace does not depend on which subset was requested" and "a change to ... a package manifest ... or to the set of workspaces SHALL re-extract the importing files in other workspaces".
- A (code gap): include `configuredWorkspaces` (names + manifest facts) in the fingerprint / closure inputs. B (spec): narrow the claim to "map and prepare data", and state that stale importers outside the selected set are repaired by the next full run.
- Related: the scenario "A imports a package declared by B" only resolves if B is already indexed in the store (entry must be `session.getFileId`-registered). That is true in the test but the spec does not state the precondition.

#### D4 (LOW) Inaccessible workspace is reported through `IndexResult.errors`

- Spec: "skipped with a diagnostic ... MUST NOT fail the run". Code pushes `{filePath: "<ws>:<manifest>", message: "... skipped for package resolution ..."}` to `errors`. The CLI prints `errors: N` but does not fail on it (cli/src/commands/graph/index-graph.ts:163,205), so behaviour is acceptable, but the same channel is used for real failures; `result.errors` is not empty for a healthy run with an uncloned repo.
- A (code): acceptable; maybe use a distinct warning channel. B (spec): state that the diagnostic is carried as an indexing error entry.
- Also: only checks existence of directory, not whether the selected `options.workspaces` entry is accessible (a selected, missing root fails elsewhere in discovery).

### 1.3 Identity-sensitive incremental equivalence

- Implemented via hydration (D1/D2 caveats). Tests exist for PHP, Python, Go (index-code-graph-incremental.spec.ts) comparing `semanticState` of incremental vs clean.

### 1.4 Package import incremental closure (addition-only fallback)

- `addsCode = newFiles.some(p => registry.getAdapterForFile(relativeIdentityPath(p)) !== undefined)`; `additionCandidates` only if true. Matches spec ("files an adapter analyzes"). A new TypeScript-adapter-claimed file counts; documents/assets do not.
- Reverse `import:package` closure and manifest-driven re-extraction are unchanged by this change (not re-audited beyond existing test at package-resolution.spec.ts:169).

### Indexer test coverage gaps

- G1 (HIGH value) "Partial run maps and prepares every configured workspace" (index-code-graph-package-resolution.spec.ts:293) is vacuous: the first run already persists the `import:package` step; the second (partial) run reprocesses nothing (no file changed), then asserts a step exists. It never asserts equality with a both-workspace run and never forces re-resolution in the partial run (e.g. touch an importing file, or a fresh store seeded with B). Would still pass if `configuredWorkspaces` were ignored.
- G2 (HIGH value) No indexer-level test of "test importer sees test symbols" on the qualified-name path (masks D1). Needs a Python/Go/PHP case where the only route is `qualifiedNames`, in a clean run AND an incremental run, asserting `importMap`/local binding or symbol-level dependency, not just file `IMPORTS`.
- G3 Inaccessible-workspace test (index-code-graph-package-resolution.spec.ts:320) asserts only the diagnostic; not "imports of its packages count as external" (externalPackageImports) nor "other workspaces indexed normally".
- G4 No positive test for the addition-only fallback ("adds a new code file -> existing files re-extracted and a previously unresolved import resolves, equals clean rebuild"); only the negative (non-code file) exists (index-code-graph-incremental.spec.ts:236). Title says "still re-extract" but asserts the opposite.
- G5 Incremental equivalence tests use a single mutation (edit one consumer), PHP fallback (PSR-4 file import) can mask a missing hydrated lookup; no assertion that the hydrated lookup itself was used, no mutation types listed in the spec (rename/move/delete/add).
- Covered scenarios (present): every adapter asked, collision, same-ws multi-adapter, per-repo roots, no-VCS, VCS throw, identity-throw keeps barrel linking, adapter-once listing, package-unknown external. Verify scenario "The first adapter to return an identity wins" / "Identity is searched within the project" were removed by delta; no residual tests asserting them were found.

---

## 2. code-graph:symbol-model

Requirement: FileNode optional `namespace`, `namespaceSeparator`, separator present iff namespace present, not part of equality.

- Implemented: `FileNode` fields, `createFileNode` omits both when namespace undefined (separator-only input dropped). Not part of equality (no equality function includes them).

#### D5 (LOW) "present if and only if" is not enforced

- `createFileNode({namespace:'X'})` without separator yields a node with namespace only (test file-node.spec.ts:162 explicitly asserts this). Hydration defaults to `.`. Spec says separator present iff namespace present.
- A (code): throw/default the separator when namespace is set (e.g. default '.' or reject). B (spec): relax to "separator is optional; consumers default to `.`", matching the session's behaviour and the test.
- Test coverage: scenario "File namespace is optional and paired" covered (file-node.spec.ts:162), but the test encodes the relaxed behaviour (see D5). The scenario's PHP `App\Models` / Go example is not literally tested via the PHP/Go adapters.

---

## 3. code-graph:sqlite-graph-store

- `SQLITE_SCHEMA_VERSION = 16`; DDL adds nullable `namespace`, `namespace_separator` to `files` (REQUIRED_COLUMNS derived from DDL, so a missing column is rejected). All `files` SELECT/INSERT/UPSERT paths (single, bulk, getFilesByPaths, getAllFiles, by project path, file-content search joins) updated; `mapFileRow` maps nulls to absent. Worker payload carries whole `FileNode`, no separate row shape to change. Version 15 (and <15, >16) rejected by existing equality check (`Number(current.value) !== SQLITE_SCHEMA_VERSION`), recovery reason `SCHEMA_INCOMPATIBLE`; test sqlite-graph-store.spec.ts:1723 (`it.each` incl. '15','17') and :1872 (15 -> rebuild as 16, epoch rotation).
- No ALTER TABLE migration. Compliant. No discrepancies.
- Both columns null or both set is not enforced by DDL (no CHECK); store writes whatever FileNode carries (see D5). Spec says "are both null or both set". LOW; tied to D5 (A: add CHECK or normalise on write; B: relax spec).
- Test gaps: "Namespace round-trips through the files table" covered (single, batch, all-files). Not covered: round-trip through the bulk/worker path (`bulkLoad` / indexer-run commit) and file-content search results that now select the namespace columns.

---

## 4. code-graph:resolve-symbol-reference

- `deriveQualifiedName` removed from the resolver's `resolveQualifiedMember`; equality is only on stored `target.qualifiedName`. `parseDottedMemberReference` fallback removed from `parseAnchoredReference`; adapter chosen by explicit `language`, else `registry.getAdapterForFile(anchored)`; adapter without `symbolReferenceSyntax` -> `{candidates: []}`.
- Both new verify scenarios have tests (resolve-symbol-reference.spec.ts:1526, 1573).

#### D6 (LOW) Zero parsed candidates returns `undefined`, not an explicit unresolved

- Spec: when no adapter/facet, the text "MUST resolve as unresolved". `resolveQualifiedMember` returns `undefined` when `parsed.candidates.length === 0`, so control falls to later lanes (generic name lookup of the whole text). Result is still unresolved for the covered scenarios, but another lane could in principle match the full spelling by name equality.
- A (code): return `unresolved(prepared, 'REFERENCE_UNPROVEN')` when an adapter was required but absent. B (spec): fine as-is if later lanes can never match owner-qualified text.

#### D7 (LOW) Adapter selection by "indexed public-surface metadata" is just extension matching

- Spec order: explicit language, language of anchored indexed file, indexed public-surface metadata. Code calls `getAdapterForFile(filePath ?? publicSurface)`, i.e. path extension; it does not check the file is indexed nor read public-surface metadata (language of surface). Go package surface does end up with no adapter (matches the scenario).
- A (code): resolve language from the indexed file/surface record in the store. B (spec): reword to "language inferred from the anchor's path extension".

Cosmetic: `deriveQualifiedName` is still exported and used by `session-reference-store.ts:68` at index time to materialise the stored `qualified_name`; consistent with spec (derivation at write time, not at lookup). Doc comment of `resolveQualifiedMember` fine.

---

## 5. Cross-spec consistency (\_global, workspace-integration, graph-store, index-project-graph)

#### D8 (MED) `index-project-graph` spec not updated for `configuredWorkspaces`

- specs/code-graph/index-project-graph/spec.md:37-39 enumerates `IndexProjectGraphInput` fields (`provider, projectRoot, workspaces, graphConfig, codeGraphVersion, vcsRoot, vcsRef, force, onProgress`). Code adds optional `configuredWorkspaces` (index-project-graph.ts:15, forwarded), and `IndexOptions.configuredWorkspaces`. No delta for `code-graph:index-project-graph` exists in this change (deltas dir: go/indexer/language-adapter/php/python/resolve-symbol-reference/sqlite-graph-store/symbol-model/typescript).
- A (spec gap): add a delta for index-project-graph (and, if applicable, `ProjectGraphConfig.projectRoot` doc change "never a boundary for package resolution" in workspace-integration/composition). B (code): none; the SDK needs to pass configured workspaces.
- Also `graph-store` spec lists FileNode data needed; it does not mention `namespace`/`namespaceSeparator` explicitly (spec mentions "FileNode data needed by indexing" generically), so a store implementer reading only graph-store would not know to persist them; consider a graph-store note or contract-suite test (`graph-store.contract.ts` has no namespace round-trip test, so alternate stores such as the in-memory one are unchecked). LOW.
- `workspace-integration` (cross-workspace resolution requirement, spec.md:181) does not state the repository-bounded identity model; no contradiction found.
- `_global` conventions/architecture/testing/eslint: not exhaustively re-checked. Observed: application layer already imported `node:fs` before this change (new `existsSync/statSync` use is consistent with existing code); new port `RepositoryRootSource` lives in application/ports with infra implementation in infrastructure/vcs (layering respected); new files carry JSDoc. Not verified: lint run, test-title conventions.

---

## Top issues (ranked)

1. D1 + G2: stale `fileCategories` makes test importers fail to see test symbols on the qualified-name path (new files and category changes). Masked by file-level PSR-4 fallback in PHP test.
2. G1/D3: partial-run scenario test is vacuous; incremental partial runs can leave importers stale when an unselected workspace changes (fingerprint/closure use only selected workspaces).
3. D8: `index-project-graph` spec (and possibly workspace-integration) not updated for `configuredWorkspaces` / repo-bounded identity.
4. G4: no positive addition-fallback test; G3/G5 weak assertions.
5. D5: namespace/separator pairing is not enforced (code, test, and DB agree on "optional"; spec says iff).
