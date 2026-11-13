# Tasks: fix-sqlite-delete-file-variable-limit

## 1. Shared SQLite parameter accounting

- [x] 1.1 Add the input chunk-size calculator
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `getSqliteInputChunkSize()` — add the documented private helper with complete JSDoc
      Approach: validate integer `fixedParameterCount >= 0` and
      `inputMultiplicity >= 1`; return
      `floor((SQLITE_BATCH_PARAMETER_LIMIT - fixedParameterCount) / inputMultiplicity)`;
      throw the specified `RangeError` messages for invalid or exhausted accounting
      (Req: Worker-efficient batch reads)
- [x] 1.2 Add deterministic symbol-result comparison
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `compareSymbolNodes()` — add the documented private comparator
      Approach: compare `filePath`, `line`, `column`, then `id`; use it for every
      `findSymbols()` return so output order never depends on chunk boundaries
      (Req: Worker-efficient batch reads)

## 2. Constant-parameter file cleanup

- [x] 2.1 Replace symbol-id materialization in file cleanup
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.deleteFileLocalState()` — remove the symbol-id read and
      variable-width deletes
      Approach: delete relations using two `symbols WHERE file_path = ?` subqueries,
      then delete symbols with `DELETE FROM symbols WHERE file_path = ?`; preserve the
      existing file-endpoint relation, FTS, and file-row deletes in that order
      (Req: Transactional mutation model)

## 3. Batch relation and affected-file lookups

- [x] 3.1 Chunk reverse relation coverage lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.getRelationsByTargets()` — bound target placeholders while
      preserving relation semantics
      Approach: reserve one fixed type parameter, chunk sorted unique targets, merge rows
      by `source/type/target`, map with `readRelations()`, and sort with `compareRelations`
      (Req: Worker-efficient batch reads)
- [x] 3.2 Chunk directly affected file lookups with repeated-input accounting
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findDirectlyAffectedFiles()` — bound the path list used in two
      predicates
      Approach: compute fixed count as one import type plus `dependencyTypes.length`, use
      multiplicity 2, execute the union for each sorted unique path chunk, merge paths in a
      set, and return one lexicographically sorted array
      (Req: Worker-efficient batch reads)

## 4. Reference-fact batch lookups

- [x] 4.1 Chunk logical-symbol ID lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findLogicalSymbolsByIds()` — bound the ID placeholder list
      Approach: query unique IDs in budget-sized chunks, merge by logical-symbol ID, and
      return `compareLogicalSymbols` order
      (Req: Worker-efficient batch reads)
- [x] 4.2 Chunk declaration lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findDeclarations()` — bound logical-symbol ID placeholders
      Approach: query unique IDs in chunks, merge declarations by logical-symbol ID,
      symbol ID, and kind, then apply `compareLogicalDeclarations`
      (Req: Worker-efficient batch reads)
- [x] 4.3 Chunk exported-name public-binding lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findPublicBindingsByExportedNames()` — bound exported-name
      placeholders
      Approach: query sorted unique names in chunks, merge bindings by ID, and apply
      `comparePublicBindings`
      (Req: Worker-efficient batch reads)
- [x] 4.4 Chunk qualified-name logical-symbol lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findLogicalSymbolsByQualifiedNames()` — bound qualified-name
      placeholders
      Approach: retain empty-string filtering, query sorted unique names in chunks, merge
      by logical-symbol ID, and apply `compareLogicalSymbols`
      (Req: Worker-efficient batch reads)
- [x] 4.5 Chunk logical declaration lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findLogicalDeclarations()` — bound logical-symbol ID placeholders
      Approach: query unique IDs in chunks, merge by logical-symbol ID, symbol ID, and kind,
      then apply `compareLogicalDeclarations`
      (Req: Worker-efficient batch reads)
- [x] 4.6 Chunk resolution-step lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findResolutionSteps()` — bound `from_id` placeholders
      Approach: query unique source IDs in chunks, merge by `fromId/toId/kind`, and apply
      `compareResolutionSteps`
      (Req: Worker-efficient batch reads)
- [x] 4.7 Chunk index-coverage lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findIndexCoverage()` — bound file-path placeholders
      Approach: query unique paths in chunks, merge by `filePath`, retain JSON capability
      parsing, and sort by file path
      (Req: Worker-efficient batch reads)

## 5. Remaining collection-backed reads

- [x] 5.1 Chunk multi-file symbol queries
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.findSymbols()` — bound non-empty `query.filePaths` while
      preserving every scalar and wildcard filter
      Approach: build scalar predicates once, subtract their parameter count, execute once
      per sorted unique path chunk, merge symbols by ID, apply existing wildcard filters,
      and finish with `compareSymbolNodes`; retain one-query behavior when `filePaths` is
      absent or empty
      (Req: Worker-efficient batch reads)
- [x] 5.2 Chunk freshness-latch workspace lookups
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `SQLiteGraphDatabase.readFreshnessLatches()` — bound workspace placeholders
      Approach: query unique `__graph__` plus workspace names in chunks, merge rows by
      workspace, then build the existing response from the original workspace list with
      missing values defaulting to `false`
      (Req: Worker-efficient batch reads)

## 6. Cleanup regression tests

- [x] 6.1 Test large-file standalone replacement
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      new SQLite integration case — replace a file whose old cleanup expansion exceeded
      the SQLite host-variable limit
      Approach: persist 16,384 minimal symbols with incoming and outgoing relations, call
      `upsertFile()`, and assert success, complete old-state cleanup, and replacement-only
      visibility through public store methods
      (Req: Transactional mutation model; scenario: Direct file mutations clean up a file
      with a large symbol count)
- [x] 6.2 Test large-file standalone removal
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      new SQLite integration case — remove a file above the former cleanup limit
      Approach: call `removeFile()` and assert the file, its 16,384 symbols, incoming and
      outgoing relations, file-endpoint relations, and FTS-visible content are absent
      (Req: Transactional mutation model; scenario: Direct file mutations clean up a file
      with a large symbol count)
- [x] 6.3 Test large-file bulk replacement
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      new bulk-session integration case — commit replacement state for a large existing file
      Approach: stage the removed path and replacement records in one session, commit, and
      assert no variable-limit error, no prior symbol/relation rows, and atomic replacement
      visibility
      (Req: Transactional mutation model; scenario: Bulk commit cleans up a file with a
      large symbol count)
- [x] 6.4 Test rollback after cleanup begins
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      transaction regression case — force replacement persistence to fail after cleanup
      Approach: use duplicate logical reference facts to trigger the existing constraint
      failure within the same transaction; assert the previously committed file, symbols,
      relations, and FTS-searchable content remain intact
      (Req: Transactional mutation model; scenarios: File upsert and removal are
      all-or-nothing, Bulk indexing batch is all-or-nothing)

## 7. Parameter-budget regression tests

- [x] 7.1 Test the repeated-path budget boundary
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      `findDirectlyAffectedFiles()` boundary case — cover 446 and 447 unique paths
      Approach: include duplicates and unknowns; assert complete identical known results,
      lexicographic order, no duplicates, and no variable-limit error when a second chunk
      becomes necessary
      (Req: Worker-efficient batch reads; scenario: Fixed and repeated parameters count
      toward the chunk budget)
- [x] 7.2 Test the fixed relation-type budget boundary
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      reverse file/symbol coverage cases — cover 899 and 900 targets
      Approach: exercise `getCoveringSpecsForFiles()` and
      `getCoveringSpecsForSymbols()`; assert complete `compareRelations` order,
      de-duplication, unknown omission, and no variable-limit error
      (Req: Worker-efficient batch reads; scenario: Fixed and repeated parameters count
      toward the chunk budget)
- [x] 7.3 Test logical-reference lookup families above the safe budget
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      logical symbols, declarations, public bindings, qualified names, and resolution steps
      Approach: persist 901 minimal reference-fact records, query each public path with a
      duplicate and unknown key, and assert complete deduplicated comparator-ordered results
      (Req: Worker-efficient batch reads; scenario: Collection-binding batch reads are
      chunked transparently inside the worker)
- [x] 7.4 Test symbol file-path lookup above the safe budget
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      `findSymbols({ filePaths, ...scalarFilters })` integration case
      Approach: query 901 paths plus duplicates and unknowns while scalar filters are active;
      assert all and only matches appear once in `compareSymbolNodes` order
      (Req: Worker-efficient batch reads; scenario: Collection-binding batch reads are
      chunked transparently inside the worker)
- [x] 7.5 Test freshness and coverage lookups above the safe budget
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      freshness-latch and index-coverage integration cases
      Approach: query 901 workspaces/paths plus duplicates and unknowns; assert persisted
      values, false defaults, de-duplication, and deterministic coverage order
      (Req: Worker-efficient batch reads; scenario: Collection-binding batch reads are
      chunked transparently inside the worker)
- [x] 7.6 Preserve empty-input semantics for every newly chunked family
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      table-driven empty collection assertions
      Approach: call each affected public lookup with its empty key collection and assert
      the pre-existing empty result, with the intentional `__graph__` freshness behavior
      asserted separately
      (Req: Worker-efficient batch reads; scenario: Empty batch avoids worker and SQLite
      work)
- [x] 7.7 Verify chunking stays inside one worker operation
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      existing worker-dispatch spy table — add representative newly chunked lookups
      Approach: pass inputs above the SQL chunk size and assert exactly one host-to-worker
      dispatch for each logical public call
      (Req: Worker-efficient batch reads; scenario: Logical batch crosses the worker
      boundary once)

## 8. Validation

- [x] 8.1 Run the focused SQLite graph-store suite
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      execute the real-adapter regression suite
      Approach: run
      `pnpm --filter @specd/code-graph test -- test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
      and require exit status 0 with no variable-limit, duplicate, order, dangling-row,
      partial-state, RPC-count, or timeout failure
      (Req: Worker-efficient batch reads, Transactional mutation model)
- [x] 8.2 Run package type checking
      `packages/code-graph`: validate strict TypeScript contracts
      Approach: run `pnpm --filter @specd/code-graph typecheck` and require no diagnostics
      (Req: Worker-efficient batch reads, Transactional mutation model)
- [x] 8.3 Run package linting
      `packages/code-graph`: validate conventions and JSDoc
      Approach: run `pnpm --filter @specd/code-graph lint` and require no errors
      (Req: Worker-efficient batch reads, Transactional mutation model)
- [x] 8.4 Build the package
      `packages/code-graph`: validate ESM bundles and declaration generation
      Approach: run `pnpm --filter @specd/code-graph build` and require successful output
      (Req: Worker-efficient batch reads, Transactional mutation model)

## 9. Compliance review follow-up

- [x] 9.1 Preserve empty batches at the host boundary
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`:
      affected collection-backed public methods — avoid dispatching empty logical batches
      Approach: return `[]` before `client.sendRequest(...)` in
      `findDirectlyAffectedFiles()`, both reverse-coverage methods, the logical-symbol and
      declaration lookups, both public-binding lookups, `findResolutionSteps()`, and
      `findIndexCoverage()`; keep signatures, DTOs, and non-empty behavior unchanged
      (Req: Worker-efficient batch reads; scenario: Empty batch avoids worker and SQLite
      work)
- [x] 9.2 Canonicalize normalized lookup keys before chunking
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
      `findLogicalSymbolsByIds()`, `findDeclarations()`,
      `findPublicBindingsByExportedNames()`, `findLogicalSymbolsByQualifiedNames()`,
      `findLogicalDeclarations()`, `findResolutionSteps()`, `findIndexCoverage()`, and
      `readFreshnessLatches()` — make chunk membership independent of caller permutation
      Approach: sort each deduplicated lookup-key array before passing it to `chunksOf()`;
      retain the original requested workspace list when constructing freshness results and
      include the internal `__graph__` key only once
      (Req: Worker-efficient batch reads; scenario: Collection-binding batch reads are
      chunked transparently inside the worker)
- [x] 9.3 Strengthen large direct cleanup fixtures
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      16,384-symbol standalone replacement and removal cases — prove every claimed cleanup
      dimension on the former variable-limit path
      Approach: persist incoming and outgoing symbol relations, a file-endpoint relation,
      and distinctive FTS-searchable source content; after replacement/removal assert exact
      absence of old symbols, all old relations, the old file row, and the old FTS candidate,
      plus replacement-only visibility for upsert
      (Req: Transactional mutation model; scenario: Direct file mutations clean up a file
      with a large symbol count)
- [x] 9.4 Strengthen large bulk cleanup fixtures
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      16,384-symbol bulk replacement case — prove relation and FTS cleanup in the same
      successful bulk transaction
      Approach: commit incoming/outgoing symbol relations, a file-endpoint relation, and
      distinctive FTS-searchable content with the old file; after replacement assert exact
      absence of every old relation and FTS candidate and atomic visibility of replacement
      state
      (Req: Transactional mutation model; scenario: Bulk commit cleans up a file with a
      large symbol count)
- [x] 9.5 Assert exact identities and comparator order for oversized reads
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      901-record logical-reference and multi-file symbol lookup cases — replace count-only
      or stability-only assertions with complete expected sequences
      Approach: assert exact IDs/keys for logical symbols, declarations, bindings,
      resolution steps, freshness, and coverage; build symbols spanning file paths, lines,
      columns, and ids and assert exact `filePath/line/column/id` order; repeat with reversed
      equivalent inputs to prove output independence from input order
      (Req: Worker-efficient batch reads; scenario: Collection-binding batch reads are
      chunked transparently inside the worker)
- [x] 9.6 Re-run focused package validation after follow-up fixes
      `packages/code-graph`: verify the strengthened implementation and regression suite
      Approach: run the focused SQLite suite, typecheck, lint, and build commands from group
      8 and require all four to exit with status 0
      (Req: Worker-efficient batch reads, Transactional mutation model)

## 10. Full-verification rollback follow-up

- [x] 10.1 Add the direct upsert post-cleanup rollback regression
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
      direct `SQLiteGraphStore.upsertFile()` transaction case — prove rollback after the
      file-local cleanup and replacement inserts have started
      Approach: commit a baseline file with two symbols, incoming and outgoing symbol
      relations, a file-endpoint relation, and distinctive FTS-searchable content; attempt
      a same-path replacement through public `upsertFile()` with valid replacement relation
      endpoints and `metadata: { invalid: 1n }`; rely on structured clone accepting `BigInt`
      and `insertRelations()` rejecting when `JSON.stringify()` serializes the metadata,
      after cleanup, file insertion, and symbol insertion have begun; assert rejection,
      exact preservation of the baseline file, symbols, all relation directions, and
      baseline FTS candidate, plus absence of replacement symbols, relations, and FTS
      content; add no production hook, public API change, schema change, or error translation
      (Req: Transactional mutation model; scenario: Direct file upsert rolls back a failure
      after cleanup begins)
- [x] 10.2 Re-run validation after the direct rollback regression
      `packages/code-graph`: verify the added regression and unchanged package contracts
      Approach: run the focused SQLite graph-store suite, package typecheck, package lint,
      and package build commands from group 8; require exit status 0 for each command and
      no rollback, FTS, relation, or transaction-state regression
      (Req: Transactional mutation model)
