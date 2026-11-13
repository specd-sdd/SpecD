# Compliance audit: code-graph:indexer (change bound-indexer-ast-resource-lifecycle)

Scope: delta requirements added or modified by the change (spec.md.delta + verify.md.delta). Pre-existing requirements were not re-audited except where touched. Read-only audit; implementation is uncommitted in the working tree.

## Requirements Summary

Modified:

1. Discovery fingerprint uses effective config: adds effective `maxFileBytes` and effective `largeFilePaths` (project + workspace) as fingerprint inputs.
2. Bounded analysis memory: no retention of parser objects across files and chunks; at most the parser-owned resources of the one file being analysed.
3. Index result: new `filesSkippedForSize`, `largestSkippedForSize` (>= 10 entries, desc size then path), `sizeExemptAnalysed`.

Added: 4. Parser resource lifecycle: library-neutral `parserResources` scope in the session; epoch closed after every begun file on every exit path; reverse-order disposal, failure isolation, reference drop, best-effort GC; typed diagnostic; no `napi-keepalive`. 5. Per-file size limit: no read/hash/decode/analyse/store above effective `maxFileBytes` (workspace > project > 262144; 0 = off); byte size from fs metadata, evaluated once, after discovery rules; `largeFilePaths` exemption; coverage `unsupported`/`file-too-large`; unproven absence. 6. Size skip in incremental runs and dependents: removal of previously indexed data, re-index when file shrinks/exempt, fingerprint-triggered rebuild, unresolved imports with discoverable cause. 7. Typed indexing events: `onEvent` with `file-activity`, `file-skipped`, `resource-disposal-failed`; unthrottled; skipped-by-analysis files counted in progress.

## Implementation Status

| Req                         | Status      | Where                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Fingerprint               | Implemented | `application/use-cases/_shared/compute-graph-fingerprint.ts` (workspace, root and aggregate inputs), `_shared/resolve-effective-graph-config.ts` (`DEFAULT_MAX_FILE_BYTES`, effective per-ws limit and pattern lists)                                                                                                                                                                                                                        |
| 2 Bounded memory            | Implemented | `index-code-graph.ts` per-file `finally` -> `closeParserResourceEpoch`; adapters register `sgRoot` into `context.session.parserResources` (ts/py/php/go adapters); `napi-keepalive` has zero occurrences in src (also asserted by a test)                                                                                                                                                                                                    |
| 3 Index result              | Implemented | `domain/value-objects/index-result.ts` (`SIZE_SKIP_LIST_LIMIT = 25`), assembled at end of `index-code-graph.ts` with `compareCodeUnits` ordering                                                                                                                                                                                                                                                                                             |
| 4 Parser resource lifecycle | Implemented | `domain/value-objects/parser-resource-scope.ts`, `application/use-cases/in-memory-parser-resource-scope.ts` (LIFO, per-disposer try/catch, entries detached before disposal), `application/services/close-parser-resource-epoch.ts`, `request-garbage-collection.ts`, `IndexSession.parserResources` in `in-memory-index-session.ts`; outer `finally` in `execute` closes the active session scope again (covers persistence failure/throws) |
| 5 Size limit                | Implemented | `application/services/file-size-gate.ts` (`createFileSizeGate`), applied in both workspace and `root:` discovery loops right after `discoverFiles`, so excluded/binary files never reach it; skipped files never enter `allDiscoveredPaths`, so no hashing/read; coverage seeded as `Unsupported`/`file-too-large`; `get-graph-health.ts` `deriveCoverageCompleteness` -> `complete-with-warnings` + `file-too-large` warning                |
| 6 Incremental/dependents    | Implemented | deletion loop (`sizeSkippedPaths` / `indexedResourceKinds`) removes previously indexed data; fingerprint covers limit/exemptions; skipped file absent from graph so imports stay unresolved                                                                                                                                                                                                                                                  |
| 7 Typed events              | Implemented | `domain/value-objects/index-event.ts`, `IndexOptions.onEvent`, `emitEvent` (swallows receiver errors), `file-activity` emitted before read for every file entering the loop, unthrottled; `file-skipped` emitted at discovery; `resource-disposal-failed` from the epoch-close callback                                                                                                                                                      |

## Discrepancies

D1 (Low) "Size evaluated once per file" is only partly true at indexer level.

- Spec (Req 5, scenario "The size is evaluated once per file") says the fs metadata for the size decision is requested a single time and reused by every phase, including change detection.
- Code: the gate stats each kept file once (good, and `fileSizes` is reused by `groupIntoChunks`), but change detection (`index-code-graph.ts` ~line 872) calls `statSync(absPath)` again for mtime/size observation comparison, and observation persistence (~line 1987) stats again. `groupIntoChunks` also falls back to a second `statSync` when the cached size is null.
- Possibility A (code wrong): reuse a single stat result (size + mtimeMs) from the gate for change detection. Possibility B (spec wrong/too strict): reword to "the size decision" being evaluated once, acknowledging mtime observation needs its own stat. The scenario text ("size decision a single time") is arguably still satisfied because those later stats are not size decisions; recommend clarifying wording.

D2 (Low) Fingerprint input shape vs spec wording.

- Spec says the input is each workspace's effective `largeFilePaths` "(the project patterns together with the workspace patterns)". Code fingerprints `{project:[...], workspace:[...]}` as separate arrays. Two configs that move a pattern between the project and workspace list produce different fingerprints though the union is equal. This is semantically defensible (the two lists are evaluated relative to different roots, so they are not interchangeable). Spec could say "both lists, kept distinct", or code could merge them (would be wrong, since roots differ). Code is probably right; spec wording is imprecise.

D3 (Low/Info) "Cancellation" has no in-process cancellation path in `IndexCodeGraph`.

- The indexer has no abort signal; cancellation is realised by the isolated worker killing the child, or by a thrown error. Code satisfies the requirement via the per-file `finally` and the outer `finally`. The spec scenario ("cancelled while a file is being analysed") is only emulated in tests by a throwing `onProgress`, which fires before the per-file try block. Either the spec should say "aborted by a thrown error", or a cooperative cancellation hook is expected and missing. No behavioural defect found.

D4 (Low) `closeParserResourceEpoch` returns early with no GC when the scope is empty.

- Spec: "request a garbage collection when the host exposes one" on closing an epoch; also "closing the epoch is a no-op" for adapters registering nothing. The code follows the second statement and is consistent with the "Adapters without resources are unaffected" scenario. The first statement read literally would request GC after every file. Spec is slightly ambiguous; code behaviour is sensible (avoids a GC per file for pure-regex/no-resource adapters). Recommend spec wording "when the epoch held at least one resource".

D5 (Info) Lookup of a size-skipped file reporting "not indexed": no dedicated code path or test. It holds implicitly (no node created) and health reports the warning; no consumer-level lookup (resolve-symbol-reference, file outline, CLI) was verified to emit a "not indexed" distinct from "not found". If the intent is a distinct response, it is not implemented here (it may belong to another spec in the change).

No High or Medium discrepancies found. Consistency with dependencies: `get-graph-health` change matches the `code-graph:get-graph-health` reference in Req 5; `core` config schema/`specd-config.ts` carry `maxFileBytes`/`largeFilePaths`; `cli/stats.ts` surfaces the warning.

## Test Coverage

- Fingerprint: `test/application/use-cases/compute-graph-fingerprint.spec.ts` (limit/exemption change detection, equal-however-declared, root fingerprint); `resolve-effective-graph-config.spec.ts`.
- Bounded memory / lifecycle: `index-code-graph.parser-resources.spec.ts` (scope size <= 1 per file, parse failure, disposal failure events, early exits: document/binary/oversized, persistence failure, abort via thrown callback, original error preserved when disposal also fails, `napi-keepalive` absence); `in-memory-parser-resource-scope.spec.ts` (LIFO, failure isolation, reference drop, reuse, re-entrancy); `close-parser-resource-epoch.spec.ts` (GC after disposal, absent `gc` harmless, empty-scope no GC, failure callback); `parser-resource-lifecycle.integration.spec.ts` (200 files per built-in language under forced GC); adapter specs and `language-adapter-conformance.spec.ts` touched.
- Size limit: `index-code-graph.size-limit.spec.ts` (default 262144 boundary, 0 disables, workspace override, exemption + `sizeExemptAnalysed`, ordering/cap, document, test/ignore categories, exclusion beats exemption, binary beats exemption, workspace-relative pattern, root files, lowered limit drops indexed file, chmod 000 "never read or hashed" in first and incremental run); `file-size-gate.spec.ts` (multibyte bytes, stat failure, stat exactly once per decision).
- Incremental: `index-code-graph-incremental.spec.ts` (shrink -> indexed, raised limit -> rebuild, import of oversized module unresolved with `file-too-large` coverage).
- Result fields: size-limit spec asserts `filesSkippedForSize`, `largestSkippedForSize`, `sizeExemptAnalysed`.
- Health: `get-graph-health.spec.ts` (`complete-with-warnings` with count; `complete` otherwise).
- Events: `index-code-graph.events.spec.ts` (unthrottled `file-activity`, `file-skipped`, JSON round-trip, throwing receiver swallowed, identical result/progress with and without `onEvent`, size skip not announced as activity but analysis-skipped files are).

## Missing Tests

M1. "Retention is bounded across files and chunks": no test forces several chunks (`chunkBudget` is unused in tests) with a resource-registering adapter. Existing test proves size <= 1 for 4 files in a single chunk only.
M2. "The size is evaluated once per file" at indexer level: only the gate unit test covers it; no test spies on `statSync` across change-detection/analysis (and D1 shows it would currently fail if asserted strictly).
M3. "A project-level exemption applies from the project root" with an `app/controllers/legacy.php`-style path and "Workspace and project exemptions are combined": the size-limit spec covers a project exemption and workspace-relative pattern separately; no single test combines both in one workspace.
M4. "Cancellation closes the epoch" during analysis of a file (adapter-level abort) is only emulated by a throw in `onProgress` that fires between files (see D3).
M5. "The indexer is independent of the parsing library" has only fake-object tests (acceptable, but there is no explicit assertion that indexer sources reference no tree-sitter/ast-grep type).
M6. "Lookups about a skipped file" at consumer level (symbol/file lookup returns not indexed): no test (see D5).
M7. "Files that exit early also close the epoch": covered for document/binary/oversized, but undecodable-content path closing with a registered resource is not explicitly distinguished.
M8. "Every file is announced with its size" with thousands of files: the events test uses a small file count; no stress-style assertion (low value).

## Summary Counts

- Requirements audited: 7 (3 modified, 4 added); verify scenarios audited: about 55.
- Implemented: 7/7 requirements. Scenarios with direct test coverage: roughly 45; partial: 6; uncovered: 3.
- Discrepancies: High 0, Medium 0, Low 4 (D1-D4), Info 1 (D5).
- Missing tests: 8 (M1-M8), of which M1, M2, M4, M6 are the meaningful gaps.
