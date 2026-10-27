# Spec Compliance Report — bound-indexer-ast-resource-lifecycle

Run: 20261027-030006. Mode: change. Scope: 14 specs (3 batches).

## Summary

| Batch                                    | High | Medium                               | Low | Info |
| ---------------------------------------- | ---- | ------------------------------------ | --- | ---- |
| indexer + adapters + index-project-graph | 0    | 0                                    | 4   | 1    |
| worker + health + sdk                    | 0    | 1 (S1, outside delta)                | 4   | 5    |
| config + cli                             | 0    | 1 (graph-stats plain-complete label) | 8   | -    |

## Detailed Findings

---

# Partial audit: core:config, core:config-loader, cli:graph-index, cli:graph-stats

Change: bound-indexer-ast-resource-lifecycle. Read-only audit of the uncommitted working tree (run 20261027-030006). Tests run: core `config-loader.spec.ts` 145 passed; cli `graph-index.spec`, `graph-stats.spec`, `test/commands/graph/*`, `graph-index-task.spec` 188 passed (13 files). Spec content taken from the change deltas (spec.md / verify.md). This run supersedes the 20261026-193032 partial: its D1 (unanchored root-level snippet) and D2 (YAML-unsafe snippet) and D4/D5 (docs) are now FIXED in the tree (`toLargeFilePathsEntry`, `yamlScalar`, docs/cli/graph.md, docs/cli/cli-reference.md); the new `cli:graph-stats` spec is added.

---

## core:config

### Requirements Summary

| Requirement / scenario                                                                   | Status                                                                       | Evidence (code)                                                                                                                          | Test                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Project-level graph configuration lists `maxFileBytes`, `largeFilePaths`                 | Implemented                                                                  | `packages/core/src/application/ports/config-schema.ts:174-175`; `specd-config.ts:139,145` (SpecdGraphConfig); `config-loader.ts:642-647` | config-loader.spec:2100 "parses project graph.maxFileBytes and graph.largeFilePaths"            |
| Scenario: Project-level size fields accepted                                             | Implemented                                                                  | same                                                                                                                                     | same test                                                                                       |
| Workspace-level `graph.maxFileBytes` / `graph.largeFilePaths`                            | Implemented                                                                  | `config-schema.ts:163-164`; `specd-config.ts:95,101`; `config-loader.ts:473-478`                                                         | spec:1793                                                                                       |
| Graph file size limit: non-negative integer; negative / fractional / non-number rejected | Implemented                                                                  | `z.number().int().nonnegative()`                                                                                                         | spec:2139 (project), spec:1906 (workspace); assert error class only                             |
| Scenario: Zero accepted                                                                  | Implemented                                                                  | `!== undefined` guards (not truthiness)                                                                                                  | spec:2126, spec:1870                                                                            |
| Scenario: omitted limit is absent, no default written                                    | Implemented                                                                  | conditional spreads in loader                                                                                                            | spec:2117, spec:1833                                                                            |
| Scenario: workspace value replaces project value (config exposes both)                   | Implemented                                                                  | independent mapping of project and workspace blocks                                                                                      | No single test holding 1000 vs 5000 together; each level covered separately                     |
| Scenario: exemptions combined, each with own base dir                                    | Implemented                                                                  | arrays exposed separately per level                                                                                                      | Covered only per level, no combined test                                                        |
| Scenario: negation within list kept, order preserved                                     | Implemented                                                                  | `z.array(z.string())`, verbatim                                                                                                          | spec:1805-1830 (workspace-level `['generated/**','!generated/small.ts']`); not at project level |
| Exemption does not override excludePaths / allowedPaths / .gitignore / binary filter     | Outside scope here (code-graph); docs state it (docs/guide/configuration.md) | n/a                                                                                                                                      | n/a                                                                                             |
| Scenario: unknown graph keys rejected                                                    | Implemented                                                                  | `.strict()` kept                                                                                                                         | spec:1717 (workspace), spec:2176 (project)                                                      |
| Scenario: layers merge (scalar later wins, arrays append)                                | Implemented                                                                  | `config-schema.ts deepMergeRawConfig` (generic)                                                                                          | spec:2257 (project level only)                                                                  |
| Workspace-level graph requirement text (new fields)                                      | Implemented                                                                  | as above                                                                                                                                 | as above                                                                                        |

### Discrepancies

1. LOW: huge values accepted. `maxFileBytes: 1e21` / `1e300` / `Number.MAX_SAFE_INTEGER+` pass validation (previous probe; schema unchanged).
   - Spec wrong? Spec says only "non-negative integer"; silence on an upper bound may be deliberate.
   - Code wrong? A value far above any real file size is effectively "no limit" but is not `0`; `.safe()` would reject unsafe integers.
   - Action: none required; optionally tighten schema and spec together.
2. LOW (test only): "Workspace value replaces project value" and "Exemptions are combined" scenarios have no test asserting both levels in one config; the merge scenario is project-level only.

### Missing tests

- Combined project+workspace config asserting 1000 vs 5000 and both `largeFilePaths` lists.
- Workspace-level cascade (generic code path, low risk).
- Project-level negation-order test.
- Error-message content for `maxFileBytes` rejections (only class asserted).

### Summary counts

Requirements: 3 added/modified (Project-level graph configuration modified, Workspace-level graph configuration added, Graph file size limit added). Implemented 3, Partial 0, Missing 0, Contradicted 0. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW.

---

## core:config-loader

### Requirements Summary

| Requirement / scenario                                                        | Status      | Evidence                                                                                     | Test                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept both keys at project and workspace `graph`; expose exactly as declared | Implemented | `config-loader.ts:473-478, 642-647`                                                          | spec:1793, spec:2100                                                                                                                                                 |
| No default applied; absent when undeclared                                    | Implemented | conditional spreads                                                                          | spec:1833, spec:2117                                                                                                                                                 |
| Strict validation, only 2 new keys, other unknown keys rejected               | Implemented | `.strict()` retained                                                                         | spec:1717, spec:2176                                                                                                                                                 |
| `ConfigValidationError` naming offending key and location                     | Implemented | loader formats `formatZodPath(path): message` (e.g. `workspaces.default.graph.maxFileBytes`) | Error class asserted (spec:1906, 2139); key/location NOT asserted for `maxFileBytes` (is asserted for `largeFilePaths` and `allowedPaths`, e.g. spec:1717 neighbour) |
| Layer merge unchanged                                                         | Implemented | generic merge                                                                                | spec:2257                                                                                                                                                            |

### Discrepancies

1. LOW (test only): scenario "An invalid limit names the key and its location" not asserted at message level for `maxFileBytes`. Code appears compliant (path-prefixed message); add `.rejects.toThrow(/workspaces\.default\.graph\.maxFileBytes/)`.

### Missing tests

Same as core:config; plus message assertion above.

### Summary counts

Requirements: 1 added. Implemented 1. Discrepancies: 0 HIGH, 0 MEDIUM, 1 LOW (test).

---

## cli:graph-index

### Requirements Summary

| Requirement / scenario                                                                                                                                    | Status                      | Evidence                                                                                                                                                                   | Test                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size-skip: count + applied limit                                                                                                                          | Implemented                 | `index-graph.ts:322-327` (`size limit: N file(s) skipped (larger than graph.maxFileBytes, <limits> bytes)`; distinct limits joined)                                        | graph-index.spec "renders size-skip section with count, limit, files, YAML snippet and memory note"                                                             |
| Lists largest skipped (project-relative path, human size), max 10, "N more" line, total always shown                                                      | Implemented                 | `CLI_SIZE_SKIP_LIST_MAX=10`; `remaining = filesSkippedForSize - listed.length` (uses total, not capped list of 25)                                                         | "caps skipped files listing at 10 and prints ... and N more"                                                                                                    |
| YAML `graph.largeFilePaths` snippet, project-root-relative, escaped, valid for every workspace                                                            | Implemented                 | `toLargeFilePathsEntry` (anchors root-level files with `/`), `escapeGitignorePattern`, `yamlScalar` (single-quotes risky scalars) `index-graph.ts:40-55, 242-260, 336-341` | escape-gitignore-pattern.spec (escape, anchoring, yamlScalar); size-skip test                                                                                   |
| Mentions raise `graph.maxFileBytes`, `0` disables                                                                                                         | Implemented                 | line 342                                                                                                                                                                   | size-skip test                                                                                                                                                  |
| States ~3 KB memory per source byte                                                                                                                       | Implemented                 | line 343                                                                                                                                                                   | size-skip test                                                                                                                                                  |
| `sizeExemptAnalysed` listed separately with sizes                                                                                                         | Implemented                 | lines 346-351                                                                                                                                                              | "renders separate exempt list ..."                                                                                                                              |
| Section absent when nothing skipped/exempt (output unchanged)                                                                                             | Implemented                 | guards on `filesSkippedForSize > 0` / `sizeExemptAnalysed.length > 0`                                                                                                      | "leaves text output unchanged when filesSkippedForSize is 0 ..."                                                                                                |
| Structured modes carry data, no hint                                                                                                                      | Implemented                 | `output(result, fmt)`; help schema lists new fields (`:85-87`)                                                                                                             | "includes size-skip fields in structured JSON ... without hints"; "exposes the size-skip fields in toon mode without hint text"                                 |
| Command never edits specd.yaml                                                                                                                            | Implemented (no write path) | no fs writes                                                                                                                                                               | "never writes to the project configuration file"                                                                                                                |
| Worker diagnostics: `worker-silent` -> stderr warning naming file + duration, suggests `graph.excludePaths` / lower `graph.maxFileBytes` (text mode only) | Implemented                 | `:183-189`, handlers only for `fmt==='text'` (`:169`)                                                                                                                      | "prints worker-silent warning on stderr only in text mode"                                                                                                      |
| Structured modes: stdout only final result                                                                                                                | Implemented                 | no handlers in json/toon                                                                                                                                                   | same test                                                                                                                                                       |
| Failure in text: cause, last file, stderr tail; exit code per Error cases (3)                                                                             | Implemented                 | `:200-225`                                                                                                                                                                 | "renders worker failure diagnostics with exit code 3 in text mode" (uses cause `resource-limit`, spec scenario names `native-crash`; CLI treats cause opaquely) |
| Structured failure: cause + diagnostics as data, no CLI sentence                                                                                          | Implemented                 | `metadata:{cause,lastActivity,stdoutTail,stderrTail}`, `detail` only in text                                                                                               | "carries the failure cause and tails as structured data in json mode, without detail lines"; toon twin                                                          |
| Events cross worker boundary as JSON values, no new message format                                                                                        | Implemented                 | `graph-index-task.ts` `announce` / `emitProgress({event})`                                                                                                                 | graph-index-task.spec: threshold announce tests + "routes non-activity events ... JSON serializability"                                                         |
| Modified: CLI reference documentation (config fields, 256 KiB default, `0`, scope, summary, failure causes, large-file example)                           | Implemented                 | docs/cli/cli-reference.md (graph index section ~1251-1320), docs/cli/graph.md Output & Behavior + "Example: Exempting Large Files"                                         | No automated doc test of content beyond config-key coverage                                                                                                     |
| Extra (design): `resource-disposal-failed` warning                                                                                                        | Implemented                 | `:172-178`                                                                                                                                                                 | "prints warning on stderr for resource-disposal-failed progress in text mode"                                                                                   |
| Pre-existing requirements (progress rendering, Error cases, structured single document)                                                                   | No regression               | `process.exit(0)` moved after try/catch (`:229`)                                                                                                                           | existing + new tests                                                                                                                                            |

### Discrepancies

1. LOW: `formatSize` rounds KB to nearest, so a file of 262145 bytes prints `256 KB` next to a limit printed as `262144 bytes`; 1048575 prints `1024 KB`.
   - Spec wrong? Spec says only "human-readable size"; the helper and `format-size.spec.ts` pin round-to-nearest, so the behaviour is design-conformant.
   - Code wrong? A listed "skipped because larger than the limit" file appearing equal to the limit is confusing; `Math.ceil` or one decimal near the limit would avoid it.
2. LOW (informational): `cliError(...)` for the diagnostics branch is followed by a second `cliError` relying on `never` (`index-graph.ts:215-225`); with a non-exiting `process.exit` mock it would double-print. Test host uses a throwing sentinel; no real-world issue.
3. LOW (test): spec scenario "native-crash" is exercised with `resource-limit` only; add a native-crash case (behaviour identical).
4. LOW (docs): docs/cli/cli-reference.md says exempt files "must still pass gitignore, excludePaths, and binary detection" for `graph.largeFilePaths` but omits `allowedPaths` (spec lists `allowedPaths`; docs/guide/configuration.md has it correctly). Cosmetic.

Resolved since previous run: anchoring of root-level snippet entries, YAML quoting of snippet entries, docs field types (`largestSkippedForSize` / `sizeExemptAnalysed` arrays of objects), docs failure-cause names and warning text now match code and spec.

### Missing tests

- Cap test with a total above the 25-entry result cap verifying N uses the total (partly implied by the code).
- Native-crash cause rendering.
- Snippet escaping end to end through `formatTextIndexResult` for a path containing `*`/`[` (unit-tested on helpers only).

### Summary counts

Requirements: 2 added (Size-skip summary and hint, Worker diagnostics presentation) + 1 modified (CLI reference documentation). Implemented 3, Partial 0, Missing 0, Contradicted 0. Discrepancies: 0 HIGH, 0 MEDIUM, 4 LOW.

---

## cli:graph-stats

### Requirements Summary

| Requirement / scenario                                                                                                                                                                                                  | Status                                                                                                     | Evidence                                                                                                                                                                                                                                                                                                 | Test                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Text renders `coverageCompleteness` with warnings; `complete-with-warnings` prints `coverage: complete with warnings (N file(s) skipped: file-too-large)` plus hint about `graph.maxFileBytes` / `graph.largeFilePaths` | Implemented                                                                                                | `packages/cli/src/commands/graph/stats.ts:119-127` (N from `coverageWarnings` entry `file-too-large`, 0 if absent)                                                                                                                                                                                       | graph-stats.spec "labels a graph with size skips as complete with warnings and shows the hint" |
| `complete` prints no warning                                                                                                                                                                                            | Implemented                                                                                                | branch only for `complete-with-warnings`                                                                                                                                                                                                                                                                 | "prints no warning line for a complete graph"                                                  |
| `incomplete` / `unknown` keep existing diagnostics                                                                                                                                                                      | Implemented (unchanged lines; `Symbol absence cannot be proven` also gated on `coverageComplete !== true`) | `stats.ts:128-142`                                                                                                                                                                                                                                                                                       | No new test; pre-existing stats tests cover incomplete                                         |
| A graph with warnings MUST NOT be labelled plainly complete                                                                                                                                                             | Partially / ambiguous                                                                                      | The pre-existing line `Coverage complete: true` (`stats.ts:118`) is still printed for `complete-with-warnings` because the aggregate flag stays `true` (docs/cli/cli-reference.md:1570-1577 says so explicitly); the warning line follows it and "Symbol absence cannot be proven" is added (`:133-142`) | Test asserts the warning line and hint, not the absence of a plain-complete label              |
| JSON/TOON expose `coverageCompleteness`, `coverageWarnings` unchanged, no hint text, no presenter recomputation                                                                                                         | Implemented                                                                                                | `output(health, fmt)` passes whole health (`:161`)                                                                                                                                                                                                                                                       | json test "exposes the fields unchanged in structured output without hint text"; no toon test  |

### Discrepancies

1. MEDIUM (spec ambiguity): `Coverage complete: true` and `coverage: complete with warnings (...)` appear together in text mode.
   - Spec wrong? The scenario says the output "does not describe the coverage as plainly complete"; the `Coverage complete:` line is a raw boolean flag, not a description, and the spec keeps the aggregate flag unchanged, so the spec can be read as satisfied. The spec could say explicitly that the boolean line stays or is suppressed/qualified.
   - Code wrong? A reader scanning output sees `Coverage complete: true`, which contradicts "MUST NOT be labelled as plainly complete". Fix: print `Coverage complete: true (with warnings)` or omit it when `coverageCompleteness === 'complete-with-warnings'`, and assert it in a test.
2. LOW: the `N` in the warning line falls back to `0` when the `file-too-large` warning is missing from a `complete-with-warnings` result (no other warning codes are rendered). Harmless today (single warning code) but other future codes would be silently dropped.
3. LOW (docs): docs/cli/graph.md:235-240 and docs/cli/cli-reference.md:1570-1577 describe the behaviour correctly and consistently with code; no discrepancy, noted for completeness.

### Missing tests

- Assertion that no plain-complete label accompanies warnings (see discrepancy 1).
- TOON output of `coverageCompleteness` / `coverageWarnings`.
- Explicit test for `incomplete` and `unknown` text output after the change.
- `complete-with-warnings` with an empty `coverageWarnings` array.

### Summary counts

Requirements: 1 added (Coverage completeness presentation). Implemented 0 fully, Partial 1 (labelling ambiguity), Missing 0, Contradicted 0. Discrepancies: 0 HIGH, 1 MEDIUM, 1 LOW.

---

## Docs and global-spec consistency

- docs/guide/configuration.md: both keys documented at project and workspace level (type, 262144 default, `0`, replace vs append, exemption does not bypass excludePaths/allowedPaths/gitignore/binary). Matches specs. One nuance: spec says the config exposes the field as absent and the code graph applies the 256 KiB default; docs list `262144` as the "Default", which is accurate from the user's view.
- docs/cli/graph.md and docs/cli/cli-reference.md: satisfy the modified "CLI reference documentation" requirement and the new documentation scenario (fields, default, `0`, scope, large-file example, summary, failure causes). Cause names and warning text match code.
- New exports `formatSize`, `escapeGitignorePattern`, `toLargeFilePathsEntry`, `yamlScalar`, `formatTextIndexResult` have JSDoc; they are exported for tests only.

## Overall counts (this partial)

| Severity | Count                                                         |
| -------- | ------------------------------------------------------------- |
| HIGH     | 0                                                             |
| MEDIUM   | 1 (graph-stats "Coverage complete: true" next to the warning) |
| LOW      | 8 (config 2, config-loader 1, graph-index 4, graph-stats 1)   |

Requirements: 8 covered (config 3, config-loader 1, graph-index 3, graph-stats 1); 7 implemented, 1 partial, 0 missing, 0 contradicted.

---

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

---

# Partial compliance report: isolated-index-worker, get-graph-health, run-index-project-graph

Change: bound-indexer-ast-resource-lifecycle. Audit date 2026-10-27. Read-only; implementation is uncommitted in the working tree.
Merged specs read via `changes spec-preview`. Delta scope: worker (modified: Validated IPC lifecycle, Trusted injected task module, Typed failure classification; added: Child output capture, Activity and silence watchdog, Typed worker events, Child runtime options), health (added: Coverage completeness with warnings), SDK (modified: Progress callback passthrough, Result passthrough; added: Typed event passthrough). Unchanged requirements were checked only for consistency.
Test run during the audit: `vitest` on `packages/code-graph/test/infrastructure/isolated-index-worker` plus `get-graph-health.spec.ts` gave 91 pass / 0 fail. `packages/sdk/test/orchestration/run-index-project-graph.spec.ts` gave 20 pass / 0 fail.

---

## 1. code-graph:isolated-index-worker

### Requirements Summary (delta requirements)

| Requirement                         | Core obligations                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validated IPC lifecycle (mod)       | Activity message type; version-bearing protocol id; version mismatch = protocol failure; single terminal; envelopes internal                                                                                                                     |
| Trusted injected task module (mod)  | Task gets (input, progress emitter, activity announcer); the announcer may be ignored                                                                                                                                                            |
| Typed failure classification (mod)  | Closed `cause` set (start-failed, task-contract, task-error, protocol, cancelled, native-crash, resource-limit, exited); fallback to exited/signal cause; diagnostics = last activity + stdout/stderr tails; errors extend `SpecdCodeGraphError` |
| Child output capture (new)          | Pipe stdout/stderr; bounded 16 KiB tail each; UTF-8 with replacement; release at end; never forwarded to host streams, progress or events; failure diagnostics only                                                                              |
| Activity and silence watchdog (new) | Child rate-limits ordinary announcements to 4/s, mandatory always forwarded; supervisor tracks last item and last message time; 10 s silence gives `worker-silent`, repeated at most once per 10 s; watchdog never kills the child               |
| Typed worker events (new)           | `onEvent` with kinds activity, worker-silent, stale-lock-recovered; arrival order; `onWarning` text kept; no receiver = no change                                                                                                                |
| Child runtime options (new)         | `--expose-gc` through fork execArgv; host execArgv preserved                                                                                                                                                                                     |

### Implementation Status

| Requirement                   | Status      | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validated IPC lifecycle       | Implemented | `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts` (`GRAPH_INDEX_PROTOCOL = 'specd.graph-index.v2'`, `isChildMessage` with exact keys for `activity`, item length 1..4096); `supervisor.ts` `onMessage` (invalid or other-version message -> `protocolFailure`; message after a terminal -> protocol failure that replaces a pending result)                                                                                                                           |
| Trusted injected task module  | Implemented | `isolated-index-worker-child.ts` `runTask` passes `(taskInput, sendProgress, announce)`; `application/ports/isolated-graph-index-runner.ts` `GraphIndexTask` has 3 params; `cli/src/graph-index-task.ts` uses it                                                                                                                                                                                                                                                                               |
| Typed failure classification  | Implemented | `classify-failure.ts` (precedence: typed error classes, then forwarded signal, then OOM regex on stderr, then SIGSEGV/SIGBUS/SIGILL/SIGABRT or exit 134/Windows codes, then `exited`); `domain/errors/isolated-graph-index-errors.ts` (new abstract `GraphIndexWorkerError` with `diagnostics`/`withDiagnostics`, all 8 error classes extend it); `supervisor.ts` `attach()` adds cause, lastActivity{item, agoMs}, stdoutTail, stderrTail; `domain/value-objects/graph-index-worker-types.ts` |
| Child output capture          | Implemented | `supervisor.ts` fork `stdio: ['ignore','pipe','pipe','ipc']`, `OutputTail` (16384 bytes, `TextDecoder` non-fatal), `dispose()` and listener removal in `finalize`; nothing is written to host streams. Extra: waits up to 1 s after exit for the streams to close so a final OOM report is captured                                                                                                                                                                                            |
| Activity and silence watchdog | Implemented | `child-announcer.ts` (250 ms spacing, mandatory bypass, 4096-char truncation, empty item dropped, no sends after terminal); `supervisor.ts` silence interval (1 s tick, 10 s threshold, repeat gate via `lastSilentWarnAt`, `unref`, stopped at terminal) running in the supervisor                                                                                                                                                                                                            |
| Typed worker events           | Implemented | `supervisor.ts` emits `activity`, `worker-silent {item                                                                                                                                                                                                                                                                                                                                                                                                                                         | null, silentForMs}`, `stale-lock-recovered`; `onWarning`text still emitted; types exported from`src/index.ts`and`src/public.ts` and re-exported by the SDK |
| Child runtime options         | Implemented | `supervisor.ts` builds `execArgv = hostExecArgv (+ '--expose-gc' only if absent)` and passes it to `fork`                                                                                                                                                                                                                                                                                                                                                                                      |

Unchanged requirements that were checked and are consistent: lock release in every terminal path (SIGBREAK and process exit handlers, idempotent `finalize`, `settle` for send failure and no-IPC), no `process.exit` in worker source (only `process.exitCode`), published ESM entry and dist tests (`dist.spec.ts`), native-teardown fixture (`built-napi-teardown-task.mjs`).

### Discrepancies

| #   | Severity | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Spec wrong or code wrong                                                                                                                                                                                                                                               |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Low      | Internal spec inconsistency about output exposure. The requirement text says captured output "SHALL appear only in the diagnostics of a failure", and `worker-silent` "carries no captured output". The verify scenario "Output is captured and not forwarded" says the tails are "available only through failure diagnostics **and the worker events**". The code exposes tails only through `error.diagnostics`, and no event carries them.                                                                                                                                    | Spec wrong (verify.md wording). If events were meant to carry tails, the code is wrong, but the requirement text and the `GraphIndexWorkerEvent` design say otherwise.                                                                                                 |
| W2  | Low      | "The watchdog MUST NOT terminate the child". When the host `onEvent` handler throws (during a silence tick, and also on an `activity` event), the supervisor sets a `GraphIndexProgressHandlerError` terminal and calls `terminate()` (`supervisor.ts`, silence interval and `onMessage` activity branch). The watchdog itself never kills the child, but a throwing receiver can end the run from a watchdog tick. This mirrors the existing `onProgress` handler semantics and is covered by a test ("converts throwing onEvent handler into GraphIndexProgressHandlerError"). | Spec silent. Either the spec should state that a throwing receiver is a protocol-class failure (as the classification doc comment already says), or the code should swallow receiver errors from the observability-only watchdog path. Recommend a spec clarification. |
| W3  | Info     | Rate limit boundary. The throttle is "at least 250 ms between ordinary messages", so a closed 1 s window can contain 5 messages (t=0, 250, 500, 750, 1000). For "five hundred items within one second" the maximum is 4 (or 5 only if the window spans exactly 1000 ms inclusive). Matches the scenario as worded.                                                                                                                                                                                                                                                               | Neither. Informational.                                                                                                                                                                                                                                                |
| W4  | Info     | Unspecified implementation details: item truncation at 4096 chars, empty items dropped, 1 s stream-close grace after exit, and a forwarded signal taking precedence over OOM evidence in the `cause`.                                                                                                                                                                                                                                                                                                                                                                            | Spec could document them. Not a defect.                                                                                                                                                                                                                                |
| W5  | Info     | Failures before a child exists (fork throws, lock busy) have no `diagnostics`. This agrees with "Every failure produced after the child started" (tested by "does not attach diagnostics to contract error thrown before fork").                                                                                                                                                                                                                                                                                                                                                 | None.                                                                                                                                                                                                                                                                  |

### Test Coverage

| Requirement / scenario                                                                       | Test                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity messages accepted before terminal, not treated as progress                          | `supervisor.spec.ts` "routes activity messages to onEvent in order and does not emit progress"                                                                                                       |
| Protocol version mismatch is a protocol failure                                              | `supervisor.spec.ts` "treats a message of another protocol version as a protocol failure..."; `protocol.spec.ts`                                                                                     |
| Activity message with extra fields rejected                                                  | `protocol.spec.ts` "validates activity message envelope shapes"                                                                                                                                      |
| Task receives announcer; two-parameter task still runs                                       | `dist.spec.ts` and the fixtures (`built-valid-task.mjs`, `built-gc-observation-task.mjs`); `cli/test/graph-index-task.spec.ts`. The two-parameter case is exercised implicitly by the older fixtures |
| Segfault = native-crash; forwarded signal = cancelled; OOM = resource-limit; fallback exited | `classify-failure.spec.ts`, plus supervisor tests for SIGSEGV, forwarded signal, OOM and exited                                                                                                      |
| Diagnostics identify last activity and tails                                                 | `supervisor.spec.ts` "attaches diagnostics with cause, last activity, and stdio tails..."                                                                                                            |
| Output captured, not forwarded; bounded tail; invalid UTF-8; buffers released                | "never writes the captured child output to the host streams"; `output-tail.spec.ts` (16 KiB bound, multibyte cut, dispose); "detaches child listeners and disposes tails upon settlement"            |
| Rate limiting; mandatory never withheld                                                      | `child.activity.spec.ts`                                                                                                                                                                             |
| Silence warning naming item; repeat gate; message resets; never terminates                   | `supervisor.spec.ts` (fake timers): "emits worker-silent after 10s...", "keeps warning about a silent child but never terminates it"                                                                 |
| Events in arrival order; stale lock also as text; no receiver                                | "emits typed stale-lock-recovered event alongside warning text", activity ordering test, existing runs without `onEvent`                                                                             |
| Child can request GC; host execArgv preserved                                                | `dist.spec.ts` "exposes globalThis.gc..." (real fork); `supervisor.spec.ts` "configures fork with --expose-gc exactly once, preserves host execArgv..."                                              |

### Missing Tests

- M-W1 (Low): "The watchdog works while the child is blocked" is verified only with fake timers and an inert fake child. There is no real forked child that blocks synchronously for more than 10 s. Structurally the watchdog lives in the supervisor, so the risk is low, but the scenario is not demonstrated end to end.
- M-W2 (Low): "Invalid UTF-8 is replaced" is tested through a multibyte boundary cut in `output-tail.spec.ts`. There is no test with arbitrary invalid byte sequences (for example 0xFF) or a 1 MiB write through a real child.
- M-W3 (Low): There is no end-to-end (real fork) test that child output is not leaked to the host streams. Only a fake child and `process.stdout.write` spies are used.
- M-W4 (Low): The "Mandatory announcements never withheld" end-to-end path (a built task calling `announce(..., {mandatory:true})` and the supervisor recording it as last item) is covered only at unit level (announcer plus fake supervisor).
- M-W5 (Info): No test for a `worker-silent` event after the stale-lock event in one run (combined ordering scenario). Each is tested separately.

### Summary counts (isolated-index-worker)

Requirements in delta: 7. Implemented: 7. Verify scenarios in delta: 31, all with some coverage (4 only at unit level, see Missing Tests). Discrepancies: 0 High, 0 Medium, 2 Low (W1, W2), 3 Info. Missing tests: 4 Low, 1 Info.

---

## 2. code-graph:get-graph-health

### Requirements Summary

Delta requirement "Coverage completeness with warnings": `GetGraphHealthResult` gains `coverageCompleteness` (complete | complete-with-warnings | incomplete | unknown) and `coverageWarnings` ([{code:'file-too-large', count}]). `incomplete` when aggregate coverage is incomplete (parse-failed, partial, or integrity mismatch); `unknown` when coverage is not assessable; `complete-with-warnings` when complete and warnings are non-empty; otherwise `complete`. `coverageComplete` is unchanged (true for complete-with-warnings). Only `unsupported` + `file-too-large` raises a warning; other unsupported reasons and excluded records must not.

### Implementation Status

| Item                                                           | Status      | Location                                                                                                                                                                                            |
| -------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types `CoverageCompleteness`, `CoverageWarning`, result fields | Implemented | `packages/code-graph/src/application/use-cases/get-graph-health.ts` (types, and `deriveCoverageCompleteness`); exported from `src/index.ts`, `src/public.ts` and the SDK barrel                     |
| Derivation rules                                               | Implemented | `deriveCoverageCompleteness(complete, facts)`: `null` -> unknown/[]; `false` -> incomplete/[]; else count of `Unsupported` with `reason === 'file-too-large'` -> complete-with-warnings or complete |
| Applied on both result paths                                   | Implemented | the latched-stale early return and the main return both spread the derivation                                                                                                                       |
| `coverageComplete` unchanged                                   | Implemented | `readCoverageHealth` still computes `complete` only from parse-failed/partial/inconsistent                                                                                                          |
| Producer of the reason                                         | Consistent  | `index-code-graph.ts` writes `reason: 'file-too-large'` for size skips (3 sites); `index-event.ts` uses the same literal                                                                            |
| Default provider fallback                                      | Implemented | `composition/code-graph-provider.ts` fallback health returns `coverageCompleteness: 'unknown'`, `coverageWarnings: []`                                                                              |
| Consumers                                                      | Updated     | `cli/src/commands/graph/stats.ts` (plus its tests, `project/status.spec.ts`, `project-dashboard.spec.ts`)                                                                                           |

### Discrepancies

| #   | Severity | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Spec wrong or code wrong                                                                                                                                                                                                                                                                                                         |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Low      | The requirement defines `coverageWarnings` as the ordered list of `{code,count}` where count is the number of `unsupported`/`file-too-large` records, without conditioning it on completeness. The code returns `[]` whenever completeness is `incomplete` or `unknown` (so a graph with one parse failure plus two size skips reports no `file-too-large` warning), and the test "lets parse failures dominate the warnings" asserts `[]`. The type doc comment says "empty unless completeness has warnings". The verify scenario "Parse failures dominate" asserts only `incomplete` and `coverageComplete=false`. | Ambiguous. If the spec intends the count to be always reported, the code is wrong (consumers lose the skip count when parse failures exist; the count is still available through `coverage.summary.reasons`). If the intent is "warnings only on the complete path", the spec text should say so. Recommend clarifying the spec. |
| H2  | Info     | A never-indexed graph (no `lastIndexedAt`) gives `complete: null`, hence `coverageCompleteness: 'unknown'`. This is consistent with "coverage cannot be assessed", but no scenario names it.                                                                                                                                                                                                                                                                                                                                                                                                                          | None.                                                                                                                                                                                                                                                                                                                            |

### Test Coverage

`packages/code-graph/test/application/use-cases/get-graph-health.spec.ts` (lines about 455-535) covers all 5 delta scenarios: size skips give complete-with-warnings with `{file-too-large, 3}` and `coverageComplete=true`; only indexed gives complete/[]; no-language-adapter plus excluded gives complete/[]; parse-failed plus size skips gives incomplete and `coverageComplete=false`; unassessable coverage gives unknown and `coverageComplete=null`. CLI stats rendering tests exist (`graph-stats.spec.ts`).

### Missing Tests

- M-H1 (Low): The latched-stale early-return path (`knownStaleSinceLastIndex` true) is not asserted for `coverageCompleteness`/`coverageWarnings`.
- M-H2 (Low): No test that an integrity mismatch (indexed fact without a persisted node, `GRAPH_CONTENT_INCONSISTENT`) yields `coverageCompleteness: 'incomplete'`. The existing integrity test targets `coverageComplete`/reasons.
- M-H3 (Info): The `partial` status is not used in a completeness scenario (only `parse-failed`).
- M-H4 (Info): The provider-fallback default (`unknown`/`[]`) in `code-graph-provider.ts` has no direct assertion.

### Summary counts (get-graph-health)

Requirements in delta: 1. Implemented: 1. Scenarios: 5, all covered. Discrepancies: 0 High, 0 Medium, 1 Low (H1), 1 Info. Missing tests: 2 Low, 2 Info.

---

## 3. sdk:run-index-project-graph

### Requirements Summary

- Delta: Typed event passthrough (new). Optional `onEvent` forwarded in order and untransformed to `IndexProjectGraph` (`file-activity`, `file-skipped`, `resource-disposal-failed`). It does not carry the isolated-worker events. It is additive. Both event families and the failure diagnostics types must be exported from the curated SDK surface with complete member-level documentation.
- Delta: Result passthrough (mod). The result matches `IndexProjectGraph`, including `filesSkippedForSize`, `largestSkippedForSize`, `sizeExemptAnalysed`.
- Delta: Progress callback passthrough (mod, text unchanged apart from re-statement). The `(percent, phase)` signature must not change.
- Unchanged but checked: orchestration and force-only recovery, lock out of scope, repair lifecycle passthrough.

### Implementation Status

| Item                                                       | Status                   | Location                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onEvent` on `RunIndexProjectGraphInput`, forwarded as is  | Implemented              | `packages/sdk/src/orchestration/run-index-project-graph.ts` (`...(input.onEvent !== undefined ? { onEvent } : {})` into `indexProjectGraph.execute`); `code-graph/src/application/use-cases/index-project-graph.ts` forwards to `IndexCodeGraph` options; `index-code-graph.ts` calls the receiver (listener exceptions are logged and swallowed)                                                                          |
| `onProgress` signature unchanged                           | Implemented              | The type is still `IndexProgressCallback`                                                                                                                                                                                                                                                                                                                                                                                  |
| Worker events not on this receiver                         | Implemented structurally | Worker events are produced only by `runIsolatedGraphIndex` (`supervisor.ts`); `cli/src/graph-index-task.ts` routes non-activity index events through `emitProgress({event})` and `file-activity` through the announcer                                                                                                                                                                                                     |
| Result passthrough                                         | Implemented              | `{...result, fullRebuild, fullRebuildReason}`; the size-skip fields are produced in `index-code-graph.ts` (about line 2190) and typed in `domain/value-objects/index-result.ts`                                                                                                                                                                                                                                            |
| Public export of both event families and diagnostics types | Implemented              | `packages/sdk/src/index.ts` exports `IndexEvent`, `FileActivityEvent`, `FileSkippedEvent`, `ResourceDisposalFailedEvent`, `IndexEventReceiver`, `SizeSkippedFile`, `SizeExemptFile`, `GraphIndexTaskAnnouncer`, `GraphIndexWorkerEvent`, `GraphIndexFailureCause`, `GraphIndexWorkerDiagnostics`, `GraphIndexWorkerError` and the other worker errors, `CoverageCompleteness`, `CoverageWarning`, `DEFAULT_MAX_FILE_BYTES` |
| Member-level docs                                          | Mostly                   | `index-event.ts` documents every member. `graph-index-worker-types.ts` documents each union variant, but the individual fields of the `activity` and `worker-silent` variants (`kind`, `item`, `silentForMs`) and the nested `lastActivity.item`/`agoMs` have no per-member docs; they are described only in the variant or parent comment                                                                                 |

### Discrepancies

| #   | Severity                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Spec wrong or code wrong                                                                                                                                                                                                          |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Medium (pre-existing, outside this change's delta) | The spec says the SDK requests recovery "if, and only if, `input.force` is true" and that the scenario "Non-forced ... open failure is not retried" holds. The code's `recoverOpenFailure` returns true for a non-forced run when `error.reason === 'SCHEMA_INCOMPATIBLE'` (`if (input.force !== true && error.reason !== 'SCHEMA_INCOMPATIBLE') return false`). The code also has a separate `GraphDerivationMismatchError` path that recreates the store and re-indexes with no force. The test "recreates and rebuilds an incompatible schema shape without --force" (spec file line about 249) codifies this. Because the derivation-mismatch retry reuses `withOpenGraphProvider` with the same `recoverOpenFailure`, a second recreate is theoretically reachable, against "exactly one recovery ... without further retry". Not touched by this change (diff for this file is 4 lines). | Likely spec stale or incomplete (the behavior is intentional and tested), but the spec text does not allow it. Alternatively the code violates the force-only guarantee. Needs a spec update (or a separate change) to reconcile. |
| S2  | Low                                                | "Complete documentation, including every member" for the worker event and diagnostics types is only partly met (see Implementation Status). The `GraphIndexWorkerEvent` variant fields and `lastActivity` nested fields lack per-member TSDoc.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Code (docs) incomplete relative to the spec wording.                                                                                                                                                                              |
| S3  | Info                                               | `runIndexProjectGraph` forwards `onEvent` by reference. "Arrival order" and "without transformation" hold trivially. Event delivery is synchronous, and a throwing receiver is swallowed by `IndexCodeGraph` (logged at debug). The spec does not state receiver-error behaviour. This differs from the isolated supervisor, where a throwing `onEvent` fails the run (see W2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Spec silent. Consider documenting.                                                                                                                                                                                                |

### Test Coverage

| Scenario                                                                        | Test                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer events reach the receiver in order, untransformed                       | `run-index-project-graph.spec.ts` "forwards onEvent to IndexProjectGraph" (identity check only, not an ordering run). Ordering and content tests live in `code-graph/test/application/use-cases/index-code-graph.events.spec.ts` |
| Omitting the receiver changes nothing; `onProgress` unaffected                  | "omits onEvent when not provided while keeping onProgress functional"                                                                                                                                                            |
| Progress callback keeps its signature                                           | "forwards onProgress to IndexProjectGraph" (existing)                                                                                                                                                                            |
| Size-skip fields passed through                                                 | "passes through the three size-skip result fields"                                                                                                                                                                               |
| Event types exported                                                            | "exports new worker errors and lifecycle types from SDK root" (runtime values only) plus `packages/guide/test/integration/sdk-catalog.spec.ts` and `cli/test/commands/guide-sdk/guide-sdk.spec.ts` (guide generation)            |
| Orchestration, hooks, explicit provider, subset, recovery scenarios (unchanged) | Existing tests in the same file (lines about 109-360)                                                                                                                                                                            |

### Missing Tests

- M-S1 (Low): "Worker events are not part of this receiver" has no test (neither a type-level test nor a check that `runIndexProjectGraph` never emits `activity`/`worker-silent`/`stale-lock-recovered`).
- M-S2 (Low): "Event types are exported" is not verified at type level (type-only exports are erased at runtime). The existing test checks only runtime exports, and nothing asserts TSDoc completeness of the member docs.
- M-S3 (Info): The SDK-level "Indexer events reach the receiver in order" test uses a mock `IndexProjectGraph` and an identity assertion, not an ordered sequence of `file-activity` then `file-skipped`.
- M-S4 (Info): There is no test for a second recreate on the derivation-mismatch path (S1).

### Summary counts (run-index-project-graph)

Requirements in delta: 3 (1 new, 2 modified). Implemented: 3. Scenarios in delta: 8 (indexer events, worker events not on receiver, omit receiver, types exported, progress signature, size-skip passthrough, plus the two existing). All covered except the type-level or negative ones listed. Discrepancies: 0 High, 1 Medium (S1, pre-existing, outside the delta), 1 Low (S2), 1 Info (S3). Missing tests: 2 Low, 2 Info.

---

## Consistency with global and dependent specs

- `code-graph:index-project-graph` / `code-graph:indexer`: `onEvent` and the `file-too-large` coverage reason are produced and consumed consistently (SDK, code-graph, CLI task).
- `code-graph:staleness-detection`: stale-lock recovery is only consumed by the supervisor, with no pid logic (an existing source-grep test enforces this).
- `code-graph:sqlite-graph-store`: lease release on exit and SIGBREAK is retained (`onProcessExit`, `onSigbreak`).
- Dependency direction: the worker has no dependency on `@specd/sdk` or `@specd/cli`. The SDK imports only from `@specd/code-graph`, and the CLI task imports types from `@specd/sdk`.

## Overall totals (three specs)

| Severity | Discrepancies                           |
| -------- | --------------------------------------- |
| High     | 0                                       |
| Medium   | 1 (S1, pre-existing, outside the delta) |
| Low      | 4 (W1, W2, H1, S2)                      |
| Info     | 5 (W3, W4, W5, H2, S3)                  |

Missing tests: 8 Low (M-W1..M-W4, M-H1, M-H2, M-S1, M-S2) and 6 Info (M-W5, M-H3, M-H4, M-S3, M-S4, plus M-W5 combined ordering counted once = 5).
