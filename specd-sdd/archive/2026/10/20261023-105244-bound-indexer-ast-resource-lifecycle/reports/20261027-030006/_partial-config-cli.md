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
