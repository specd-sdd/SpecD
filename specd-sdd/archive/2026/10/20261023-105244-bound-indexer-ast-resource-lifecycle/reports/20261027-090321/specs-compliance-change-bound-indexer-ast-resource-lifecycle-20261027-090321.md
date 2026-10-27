# Spec Compliance Report (re-audit) — bound-indexer-ast-resource-lifecycle

Run: 20261027-090321. Mode: change. Re-audit after spec clarifications and group 16.

## Summary

| Batch                                    | High | Medium                             | Low             | Info |
| ---------------------------------------- | ---- | ---------------------------------- | --------------- | ---- |
| indexer + adapters + index-project-graph | 0    | 0                                  | 2               | 1    |
| worker + health + sdk                    | 0    | 1 (S1, preexisting, outside delta) | 3 + 8 test gaps | 6    |
| config + cli                             | 0    | 0                                  | 8               | -    |

## Detailed Findings

---

# Partial audit (re-audit): core:config, core:config-loader, cli:graph-index, cli:graph-stats

Change: bound-indexer-ast-resource-lifecycle. Read-only re-audit of the uncommitted working tree (run 20261027-090321). Supersedes 20261027-030006. Specs taken from the change deltas / spec-preview. Tests run: core `config-loader.spec.ts` 145 passed; cli `graph-stats.spec`, `graph-index.spec`, `graph-index-task.spec` 3 files passed. Only `stats.ts` and `graph-stats.spec.ts` changed since the earlier run in these areas; core:config, core:config-loader and cli:graph-index code is unchanged, so their findings carry over.

## Status of earlier findings

| Earlier finding                                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MEDIUM graph-stats: `Coverage complete: true` printed next to the warning line                                                                           | RESOLVED. `stats.ts` now prints the `coverage: complete with warnings (...)` line plus hint INSTEAD of `Coverage complete: ...` for `complete-with-warnings`. Test "does not print a plain complete label next to the warning" asserts absence of `Coverage complete:`; "keeps the plain complete line for a complete graph" covers the complete case. |
| LOW graph-stats: only `file-too-large` count rendered, others dropped, N falls back to 0                                                                 | RESOLVED. Every warning code is listed with its own count, joined by `; ` (test "lists every warning code with its own count"). The warning-less edge case yields `coverage: complete with warnings ()` (see new L1).                                                                                                                                  |
| Missing test: incomplete/unknown text output                                                                                                             | RESOLVED (test "renders incomplete and unknown completeness without the warning label").                                                                                                                                                                                                                                                               |
| Missing test: TOON output of the fields                                                                                                                  | STILL OPEN (only json asserted).                                                                                                                                                                                                                                                                                                                       |
| Missing test: `complete-with-warnings` with empty warnings                                                                                               | STILL OPEN.                                                                                                                                                                                                                                                                                                                                            |
| LOW config: huge `maxFileBytes` (1e21 etc.) accepted                                                                                                     | STILL OPEN (schema unchanged; spec says only "non-negative integer").                                                                                                                                                                                                                                                                                  |
| LOW config (test): no combined project+workspace test for replace/combine scenarios                                                                      | STILL OPEN.                                                                                                                                                                                                                                                                                                                                            |
| LOW config-loader (test): `maxFileBytes` rejection tests do not assert key/location in the message                                                       | STILL OPEN.                                                                                                                                                                                                                                                                                                                                            |
| LOW graph-index: `formatSize` rounds near-limit files (262145 B shows `256 KB`)                                                                          | STILL OPEN (design-conformant; cosmetic).                                                                                                                                                                                                                                                                                                              |
| LOW graph-index: double `cliError` relying on `never` (`index-graph.ts:~215-225`)                                                                        | STILL OPEN (informational).                                                                                                                                                                                                                                                                                                                            |
| LOW graph-index (test): native-crash cause not exercised                                                                                                 | RESOLVED for structured output (`graph-index.spec.ts:390,407` json); text-mode rendering with native-crash still uses `resource-limit` (negligible, cause is opaque to CLI).                                                                                                                                                                           |
| LOW graph-index (docs): cli-reference.md:1317 says exempt files must still pass "gitignore, excludePaths, and binary detection", omitting `allowedPaths` | STILL OPEN (spec lists `allowedPaths`; docs/guide/configuration.md correct).                                                                                                                                                                                                                                                                           |

## core:config

Requirements (Project-level graph configuration modified, Workspace-level graph configuration added, Graph file size limit added): all Implemented. Evidence: `config-schema.ts` (`z.number().int().nonnegative()`, `.strict()`), `specd-config.ts`, `config-loader.ts` conditional spreads. Tests: config-loader.spec 1793, 1833, 1870, 1906, 2100, 2117, 2126, 2139, 2257.
Discrepancies: LOW 1 (huge values accepted; spec silent, optional tighten), LOW 2 (test: combined-level scenarios not asserted together).
Counts: 0 HIGH, 0 MEDIUM, 2 LOW.

## core:config-loader

Requirement added (accept/expose both keys, no default, strict, layer merge unchanged): Implemented. Discrepancy: LOW (test) no message-level assertion naming `workspaces.default.graph.maxFileBytes` / project `graph.maxFileBytes` in the error.
Counts: 0 HIGH, 0 MEDIUM, 1 LOW.

## cli:graph-index

All requirements Implemented (size-skip summary, capped list with "N more", escaped and root-anchored YAML snippet, memory note, exempt list, structured modes without hints, never edits specd.yaml, worker diagnostics text/structured, docs). No regression.
Discrepancies (all LOW, unchanged): formatSize rounding; double cliError; cli-reference.md:1317 omits `allowedPaths`; text-mode native-crash not separately tested.
Counts: 0 HIGH, 0 MEDIUM, 3 LOW (docs, formatSize, cliError) plus 1 trivial test note counted in the LOW total below only as part of missing tests.

## cli:graph-stats

| Requirement / scenario                                                                                                             | Status                    | Evidence                                                                                                          | Test                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Text: `coverage: complete with warnings (N file(s) skipped: file-too-large)` + hint on `graph.maxFileBytes`/`graph.largeFilePaths` | Implemented               | `stats.ts` ~118-127                                                                                               | graph-stats.spec 604        |
| `complete` prints no warning (still `Coverage complete: true`)                                                                     | Implemented               | else branch                                                                                                       | 622, 645                    |
| `incomplete` / `unknown` keep existing diagnostics                                                                                 | Implemented               | else branch (`Coverage complete: false/null`)                                                                     | 654                         |
| Warned graph NOT labelled plainly complete                                                                                         | Implemented (was partial) | `Coverage complete:` line suppressed for `complete-with-warnings`; "Symbol absence cannot be proven" also emitted | 631                         |
| JSON/TOON expose fields unchanged, no hint, no recomputation                                                                       | Implemented               | `output(health, fmt)`                                                                                             | json test 688; no toon test |
| Docs (graph.md:235-240, cli-reference.md:1570-1577)                                                                                | Consistent with code      | n/a                                                                                                               | n/a                         |

Docs note: cli-reference.md:1571-1572 says the aggregate `coverageComplete` flag stays `true`; still true in structured output, and text now no longer prints that flag for warned graphs. Consistent; the docs do not mention the text line being replaced (cosmetic).

New findings:

- L1 LOW: for `complete-with-warnings` with an empty/absent `coverageWarnings`, text prints `coverage: complete with warnings ()` (empty parentheses). Not reachable with current health logic and spec silent; guard or fallback text would be tidier. Untested.
- L2 LOW (test): TOON output not asserted (spec scenario names `json` or `toon`).

Counts: 0 HIGH, 0 MEDIUM, 2 LOW.

## Overall counts (this partial)

| Severity | Count                                                            |
| -------- | ---------------------------------------------------------------- |
| HIGH     | 0                                                                |
| MEDIUM   | 0 (earlier MEDIUM resolved)                                      |
| LOW      | 8 open (config 2, config-loader 1, graph-index 3, graph-stats 2) |

Requirements: 8 covered; 8 implemented, 0 partial, 0 missing, 0 contradicted. No new problems beyond the two graph-stats LOWs.

---

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

---

# Partial compliance re-audit: isolated-index-worker, get-graph-health, run-index-project-graph

Change: bound-indexer-ast-resource-lifecycle. Re-audit date 2026-10-27. Read-only; implementation is uncommitted in the working tree.
Specs read via `changes spec-preview` (current merged state, including the clarifications: captured output only in failure diagnostics, throwing receiver ends the run with `GraphIndexProgressHandlerError`, `coverageWarnings` empty unless complete).
Tests run: code-graph `isolated-index-worker` directory plus `get-graph-health.spec.ts`: 91 pass / 0 fail. sdk `run-index-project-graph.spec.ts`: 20 pass / 0 fail. (Same counts as before; no test changes were visible in these files for the clarified points.)
Previous audit: `reports/20261027-030006/_partial-worker-health-sdk.md`.

## 1. Status of previous findings

| ID                                                                                                                   | Previous                            | Now                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 (spec inconsistency: tails "and the worker events")                                                               | Low                                 | Resolved                                                    | Verify scenario now reads "captured tails are available only through failure diagnostics". Code exposes tails only via `error.diagnostics`; no event carries them.                                                                                                                                                                                                                                                                                                     |
| W2 (throwing receiver vs watchdog)                                                                                   | Low                                 | Resolved for the child-running paths; a new narrow gap (N1) | Requirement now states a throwing receiver gives `GraphIndexProgressHandlerError` after terminating the child. `supervisor.ts` `onMessage` activity branch and the silence tick both set `GraphIndexProgressHandlerError` and call `terminate()`; the tick uses `terminal ??=`.                                                                                                                                                                                        |
| W3 (rate-limit boundary)                                                                                             | Info                                | Unchanged, informational                                    | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| W4 (unspecified details: 4096-char item cap, empty item dropped, 1 s stream-close grace, signal-over-OOM precedence) | Info                                | Still open (Info)                                           | Not documented in the spec. Not a defect.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| W5 (no diagnostics before a child exists)                                                                            | Info                                | Unchanged, consistent                                       | `does not attach diagnostics to contract error thrown before fork`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| H1 (`coverageWarnings` when incomplete/unknown)                                                                      | Low                                 | Resolved                                                    | Spec now says `coverageWarnings` is empty whenever completeness is `incomplete` or `unknown`. `deriveCoverageCompleteness` returns `[]` for both; the tests assert it (lines 525-526, 533-534).                                                                                                                                                                                                                                                                        |
| H2 (never-indexed graph is `unknown`)                                                                                | Info                                | Unchanged                                                   | Consistent with "cannot be assessed"; still no scenario names it.                                                                                                                                                                                                                                                                                                                                                                                                      |
| S1 (non-forced SCHEMA_INCOMPATIBLE recovery contradicts "if and only if force")                                      | Medium, pre-existing, outside delta | Still open                                                  | Spec text unchanged: recovery "if, and only if, `input.force` is true" and scenario "Non-forced ... not retried". `run-index-project-graph.ts` line 124: `if (input.force !== true && error.reason !== 'SCHEMA_INCOMPATIBLE') return false`. Test "recreates and rebuilds an incompatible schema shape without --force" codifies the behavior. File diff in this change is still 4 lines (the `onEvent` forwarding). Needs a spec reconciliation or a separate change. |
| S2 (member-level docs of worker event and diagnostics types)                                                         | Low                                 | Still open (Low)                                            | `graph-index-worker-types.ts`: the `stale-lock-recovered` members are documented one by one, but the inline members of the `activity` variant (`kind`, `item`), the `worker-silent` variant (`kind`, `item`, `silentForMs`) and `GraphIndexWorkerDiagnostics.lastActivity.item` / `.agoMs` have only variant-level or parent-level text. The spec says "including every member".                                                                                       |
| S3 (receiver error behaviour on the SDK `onEvent`)                                                                   | Info                                | Resolved by spec clarification, with a nuance               | The SDK requirement says the SDK receiver carries only indexer events; the throwing-receiver rule is now stated for the worker receiver only. `IndexCodeGraph` still logs and swallows listener errors for the indexer receiver. The spec is silent for that receiver. Consistent, but the difference between the two receivers is not stated (Info).                                                                                                                  |

Missing tests from the previous report:

| ID                                                                      | Now                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-W1 (real child blocked more than 10 s)                                | Still open (Low). Silence is only tested with fake timers and an inert fake child.                                                                                                                                                                                            |
| M-W2 (arbitrary invalid UTF-8 such as 0xFF; 1 MiB through a real child) | Still open (Low). `output-tail.spec.ts` covers the 16 KiB bound and a multibyte cut only.                                                                                                                                                                                     |
| M-W3 (real fork, output not leaked to host streams)                     | Still open (Low). Only the fake-child test "never writes the captured child output to the host streams" exists. The clarified scenario (captured output only in diagnostics) is covered at unit level only: no test asserts that no event or progress message carries a tail. |
| M-W4 (mandatory announcement end to end)                                | Still open (Low).                                                                                                                                                                                                                                                             |
| M-W5 (silence plus stale-lock ordering)                                 | Still open (Info).                                                                                                                                                                                                                                                            |
| M-H1 (latched-stale early return)                                       | Still open (Low). No assertion of `coverageCompleteness`/`coverageWarnings` on that path.                                                                                                                                                                                     |
| M-H2 (integrity mismatch gives `incomplete`)                            | Still open (Low). Only the 5 scenarios plus the older integrity test exist.                                                                                                                                                                                                   |
| M-H3 (`partial` status in a completeness scenario)                      | Still open (Info).                                                                                                                                                                                                                                                            |
| M-H4 (provider fallback default `unknown`/`[]`)                         | Still open (Info).                                                                                                                                                                                                                                                            |
| M-S1 (worker events not on the SDK receiver)                            | Still open (Low).                                                                                                                                                                                                                                                             |
| M-S2 (type-level export check; TSDoc completeness)                      | Still open (Low). The export test checks runtime values only.                                                                                                                                                                                                                 |
| M-S3 (ordered sequence in the SDK test)                                 | Still open (Info). The test is an identity check.                                                                                                                                                                                                                             |
| M-S4 (second recreate on the derivation-mismatch path)                  | Still open (Info).                                                                                                                                                                                                                                                            |

## 2. New findings

### code-graph:isolated-index-worker

| #   | Severity       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Spec or code                                                                                                                                                                                                                      |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Low            | A receiver that throws on the `stale-lock-recovered` event (or in `onWarning`) is not converted to `GraphIndexProgressHandlerError`. The callback runs inside `acquireLock` (`supervisor.ts` lines 129-146, via `recoverStaleLock` in `index-lock.ts`). The exception propagates out of `acquireLock` and the `catch` rejects the run with the raw error. The spec says "A receiver that throws while handling an event ... ends the run with `GraphIndexProgressHandlerError`". No lock leak results: the stale file has been removed and the new lock was not yet created, and no child exists, so "after terminating the child" is vacuous. `onWarning` throwing before this change behaved the same way. | Code does not match the general wording. Either wrap the handler call and map to `GraphIndexProgressHandlerError` (the lock is not held at that point, so this is safe), or narrow the spec text to "while the child is running". |
| N2  | Low (test gap) | The only test for a throwing receiver ("converts throwing onEvent handler ...", line 567) throws on an `activity` event. The `worker-silent` tick path (the one that the clarification mainly concerns) and the `stale-lock-recovered` path (N1) have no throwing-receiver test. The `terminal ??=` branch in the tick is therefore unexercised.                                                                                                                                                                                                                                                                                                                                                             | Missing test                                                                                                                                                                                                                      |
| N3  | Info           | The `GraphIndexProgressHandlerError` message for event receivers is "The graph-index event handler threw." with the cause preserved. The type is shared with progress-handler failures; the `cause` classification for it is `protocol` per the doc comment of `GraphIndexFailureCause`. Spec lists no cause for a host failure other than the closed set, so `protocol` is acceptable.                                                                                                                                                                                                                                                                                                                      | None                                                                                                                                                                                                                              |

### code-graph:get-graph-health

No new problems. Both result paths (latched-stale early return, main return) apply `deriveCoverageCompleteness`; `coverageComplete` semantics are unchanged; the producer writes `reason: 'file-too-large'` consistently.

### sdk:run-index-project-graph

No new problems. `onEvent` is added only when provided (key absent otherwise, asserted by test). `onProgress` signature unchanged. Result passthrough test covers the three size-skip fields.

## 3. Verification of the clarified points

- Captured output only in failure diagnostics: requirement, scenario and code agree. `worker-silent` and the other events carry no captured output. Resolved.
- Throwing receiver ends the run with `GraphIndexProgressHandlerError`: implemented for `activity` and `worker-silent` while the child runs, with `terminate()` called; covered by test for `activity` only; not implemented for `stale-lock-recovered` (N1).
- `coverageWarnings` empty unless graph complete: implemented and tested for `incomplete` and `unknown`.

## 4. Totals (three specs, current state)

| Severity | Open items                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| High     | 0                                                                                                                            |
| Medium   | 1 (S1, pre-existing, outside the delta)                                                                                      |
| Low      | 3 discrepancies/test gaps in code or spec: S2, N1, N2; plus missing tests M-W1, M-W2, M-W3, M-W4, M-H1, M-H2, M-S1, M-S2 (8) |
| Info     | W3, W4, W5, H2, S3, N3; missing tests M-W5, M-H3, M-H4, M-S3, M-S4 (5)                                                       |

Resolved since the previous audit: W1, W2 (except N1), H1, S3 (clarified). Requirements implemented: worker 7 of 7, health 1 of 1, SDK 3 of 3, with the N1 exception noted for the receiver-failure rule.
