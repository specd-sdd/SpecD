# Compliance re-audit: indexer, language-adapter, ts/py/php/go adapters, index-project-graph (change bound-indexer-ast-resource-lifecycle)

Scope: delta requirements of the change against the CURRENT merged specs (deltas clarified since report 20261027-030006) and the uncommitted working tree. Read-only. `npx vitest run test/application test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` in packages/code-graph: 468 passed, 0 failed.

## Resolution of the previous findings

| Id  | Previous finding                                                                        | Status now                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Size "evaluated once" vs extra `statSync` in change detection / observation persistence | RESOLVED (spec clarified)        | Spec now: size decided once from a single metadata request before content is read; "Other phases MAY request metadata for their own purposes, such as change detection". Code: gate stats once per kept file (`file-size-gate.ts` `decide`), `fileSizes` reused by `groupIntoChunks`; remaining `statSync` at `index-code-graph.ts` ~872 / ~1987 are mtime observation, not size decisions. Compliant.                                                                                                   |
| D2  | Fingerprint shape project/workspace lists                                               | RESOLVED (spec clarified)        | Spec: "kept as two lists in the fingerprint because they are evaluated against different roots". `compute-graph-fingerprint.ts` ~159-161 emits project and workspace lists separately. Matches.                                                                                                                                                                                                                                                                                                          |
| D3  | No in-process cancellation path                                                         | STILL OPEN (Low/Info, unchanged) | Spec scenario "Cancellation closes the epoch" untouched. Code satisfies it through the per-file `finally` (index-code-graph.ts ~1381) and outer `finally` (~2214); no cooperative abort signal exists. Test emulates it with a throwing `onProgress` that fires between files, before the per-file `try`.                                                                                                                                                                                                |
| D4  | Empty-epoch close does no GC                                                            | RESOLVED (spec clarified)        | Spec: GC requested "when the epoch held at least one registered resource"; "Closing an epoch that held nothing performs no garbage-collection request". `close-parser-resource-epoch.ts` returns early when `scope.size === 0`. Matches; test `close-parser-resource-epoch.spec.ts` covers empty-scope no GC.                                                                                                                                                                                            |
| D5  | Lookup of size-skipped file "reports not indexed"                                       | STILL OPEN (Low/Info)            | Requirement text unchanged ("A lookup addressed to such a file SHALL report it as not indexed"; scenario "Lookups about a skipped file are unproven, not absent"). `file-too-large` appears only in get-graph-health, index-code-graph, index-event, index-options (code-graph) and core config. No lookup/consumer path (symbol or file lookup) produces a "not indexed" answer distinct from "not found". Health half (`complete-with-warnings` + `file-too-large` warning) is implemented and tested. |

Missing tests from the previous report:

- M3 (combined project+workspace exemption): RESOLVED. `index-code-graph.size-limit.spec.ts` "combines project-level and workspace-level exemptions in one workspace" (project `ws/src/by-project.ts` + workspace `gen/**`, third file skipped).
- M1 (retention bounded across several chunks): STILL OPEN. `IndexOptions.chunkBytes` exists (index-options.ts:157, used at index-code-graph.ts:520) but no test sets it; the lifecycle tests run in a single chunk.
- M2 (single size stat at indexer level): downgraded. Spec wording relaxed; the gate unit test (`file-size-gate.spec.ts`, stat exactly once per decision) is adequate. Optional: an indexer-level spy asserting one size request per file.
- M4 (adapter-level cancellation): STILL OPEN, same cause as D3.
- M5 (no tree-sitter/ast-grep types in indexer): STILL OPEN, low value (fake-adapter tests only; no source-level assertion).
- M6 (consumer lookup says not indexed): STILL OPEN, same cause as D5.
- M7 (early-exit paths close the epoch with a registered resource): STILL OPEN, narrowed. Test "leaves no residue from files that exit early" only registers from the adapter, which is never invoked for the document, undecodable blob, or oversized file; it proves a clean scope start for the following files but cannot show a resource registered during an early exit is released.
- M8: unchanged, low value.

## Per-spec results

### code-graph:indexer

Requirements Summary

1. Discovery fingerprint uses effective config (modified): adds effective `maxFileBytes` and `largeFilePaths` (project and workspace lists kept separate).
2. Bounded analysis memory (modified): at most the parser resources of the one file being analysed, across files and chunks.
3. Parser resource lifecycle (added): library-neutral scope, epoch closed after each begun file on all exit paths, reverse-order disposal, failure isolation, reference drop, GC only if the epoch held a resource and the host exposes gc, typed diagnostic, no `napi-keepalive`.
4. Per-file size limit (added): workspace > project > 262144, 0 = off; one metadata request for the size decision, other phases may stat; discovery rules first; `largeFilePaths` exemption; coverage `unsupported`/`file-too-large` with no size persisted; unproven absence.
5. Size skip in incremental runs and dependents (added).
6. Typed indexing events (added): `file-activity`, `file-skipped`, `resource-disposal-failed`; unthrottled; analysis-skipped files counted in progress.
7. Index result (modified): `filesSkippedForSize`, `largestSkippedForSize` (>= 10 entries), `sizeExemptAnalysed`.

Implementation Status: all 7 implemented.

- Fingerprint: `_shared/compute-graph-fingerprint.ts`, `_shared/resolve-effective-graph-config.ts`.
- Lifecycle: `domain/value-objects/parser-resource-scope.ts`, `use-cases/in-memory-parser-resource-scope.ts`, `services/close-parser-resource-epoch.ts`, `services/request-garbage-collection.ts`, `IndexSession.parserResources`; per-file `finally` plus outer `finally` in `index-code-graph.ts`. `napi-keepalive` has no occurrence in src.
- Size gate: `services/file-size-gate.ts`, applied in workspace and `root:` discovery loops after discovery rules; skipped files seeded as coverage `Unsupported`/`file-too-large` (coverage entry carries no size, matching the clarified spec); `get-graph-health.ts` gives `complete-with-warnings`.
- Events: `domain/value-objects/index-event.ts`, `emitEvent` swallows receiver errors, `file-activity` emitted for every file entering the loop before it is read.

Discrepancies

- D3 (Low/Info): no cooperative cancellation in `IndexCodeGraph`; behaviour satisfied via thrown-error path (see above). Suggest spec wording "cancelled or aborted by a thrown error", or accept.
- D5 (Low/Info): lookup "reports not indexed" has no implementation in this spec's scope; either owned by a lookup spec not in this change (then the sentence should reference it) or missing.
- N1 (Info, new): when the gate's `statSync` fails it returns `within-limit` with `sizeBytes: null` (fail-open); the file then proceeds to read and fails there (collected as a per-file error) or is read without a size check. Spec silent; harmless, but a failed metadata request cannot be proven under limit. No action required.

Test Coverage

- Fingerprint: `compute-graph-fingerprint.spec.ts`; effective config: `resolve-effective-graph-config.spec.ts`.
- Lifecycle: `index-code-graph.parser-resources.spec.ts` (size <= 1 per file, parse failure, disposal-failure events, early exits, persistence failure, abort by throwing callback, original error preserved, napi-keepalive absence), `in-memory-parser-resource-scope.spec.ts`, `close-parser-resource-epoch.spec.ts`, `parser-resource-lifecycle.integration.spec.ts`.
- Size limit: `index-code-graph.size-limit.spec.ts` (boundary 262144/262145, 0, workspace override, exemption, ordering and cap, document, test/ignore categories, exclusion beats exemption, binary beats exemption, workspace-relative, combined project+workspace exemption, root files, lowered limit, coverage-only skip); `file-size-gate.spec.ts`.
- Incremental: `index-code-graph-incremental.spec.ts`.
- Events: `index-code-graph.events.spec.ts`.
- Health: `get-graph-health.spec.ts`.

Missing Tests: M1, M4, M5, M6, M7 (narrowed), M2 optional, M8 skip.

### code-graph:language-adapter

Requirements Summary: Full-file analysis contract (modified: draft plain data, no parser-runtime objects); Parser-owned resource registration (added: register inside `analyzeFile` right after parse and before traversal, no adapter-private/instance retention, nothing library-specific in indexer/session/stores).
Implementation Status: Implemented. All four built-in adapters call `context.session.parserResources.register(sgRoot)` directly after `parse(...)` (typescript 978-980, python 667-669, php 794-796, go 579-581) before `sgRoot.root()`.
Discrepancies: none. (Registration passes no disposer; scope reference drop is the release for ast-grep, which the spec permits: "optionally together with a disposal function".)
Test Coverage: `language-adapter-conformance.spec.ts` ("registers parse result right after parsing and before traversal for all built-in adapters": exactly one `register`, scope size 1, closes to 0; "releases parse resource when traversal throws"); per-adapter specs; `index-code-graph.parser-resources.spec.ts` (fake library with disposal, independence from library); `index-code-graph.language-independence.spec.ts`.
Missing Tests: (Low) the ordering assertion proves registration occurs but not strictly that it precedes the first traversal step; the traversal-throw test covers the consequence. No test for the scenario "A new adapter on another parser library fits the contract" with registry addition beyond the fake-adapter lifecycle tests (considered covered). No test for "An adapter keeps nothing after analysis" inspecting the adapter instance fields (Low).

### code-graph:typescript-language-adapter, python-language-adapter, php-language-adapter, go-language-adapter

Requirements Summary: each adapter registers its parse result in `session.parserResources` immediately after parsing and before traversal; no parser objects in adapter-private session state, instance fields, or returned draft; PHP Pass 2 consumes immutable parser-derived facts and does not depend on a retained tree.
Implementation Status: Implemented for all four (lines above). No `napi-keepalive` key in src. PHP Pass 2 works from serialized facts (`SerializedPhpTypeInfo`, state maps) without tree access.
Discrepancies: none.
Test Coverage: conformance spec runs the registration and traversal-failure scenarios over all four adapters; each adapter spec was extended (about 19 lines each for ts/py); keepalive absence asserted by `index-code-graph.parser-resources.spec.ts`; 200-files-per-language GC regression in `parser-resource-lifecycle.integration.spec.ts`.
Missing Tests: (Low) the per-adapter scenarios "Nothing outlives the file's analysis" (inspect adapter instance, session adapter state, serialized draft) and "No run-wide keepalive state" (multi-file run per language, inspect adapter-state) are only covered generically, not per language. No behavioural gap found.

### code-graph:index-project-graph

Requirements Summary: forwards `graphConfig` (size limit and exemption lists kept separate) and `onEvent` unchanged to `provider.index()`; prepared input accepts `onEvent`; Effective size limit resolution (single place, default 262144, 0 = no limit, bootstrap config gets the same default, base directories kept, values feed fingerprint, no other call site applies the default).
Implementation Status: Implemented. `DEFAULT_MAX_FILE_BYTES = 262144` defined only in `_shared/resolve-effective-graph-config.ts` (no other literal 262144 in code-graph, cli, core, sdk src); `build-project-graph-config.ts` maps without applying defaults; `index-project-graph.ts` forwards `onEvent`.
Discrepancies: none.
Test Coverage: `index-project-graph.spec.ts` (onEvent forwarded unchanged); `resolve-effective-graph-config.spec.ts` (default, project values, workspace override, 0, array copies); `bootstrap-graph-config.spec.ts` (default 262144 for bootstrap); `build-project-graph-config.spec.ts` (no default applied, lists mapped); `compute-graph-fingerprint.spec.ts`.
Missing Tests: (Low) "No other call site applies the default" is not asserted by a test (code search confirms it); the "base directories" scenario is covered only indirectly through the gate and size-limit specs.

## Summary Counts

- Requirements audited: indexer 7, language-adapter 2, four adapters 4 (one modified requirement each, PHP two), index-project-graph 3; all implemented.
- Previous discrepancies: D1, D2, D4 resolved; D3 and D5 still open (both Low/Info). Previous missing tests: M3 resolved; M1, M4, M5, M6, M7 (narrowed) still open; M2 downgraded to optional; M8 ignored.
- New findings: N1 (Info).
- Discrepancies open: High 0, Medium 0, Low 2 (D3, D5), Info 1 (N1).
- Missing tests open: meaningful gaps M1 (multi-chunk bound), M6 (consumer lookup, tied to D5), M4 (tied to D3), M7 (early-exit with registered resource); minor: M5, per-language "nothing outlives" and keepalive scenarios, default-call-site assertion.
