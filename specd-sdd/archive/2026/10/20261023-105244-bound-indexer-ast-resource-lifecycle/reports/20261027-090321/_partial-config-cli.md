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
