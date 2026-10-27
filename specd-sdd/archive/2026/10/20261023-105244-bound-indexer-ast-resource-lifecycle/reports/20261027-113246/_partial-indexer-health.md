# Compliance re-audit: code-graph:indexer and code-graph:get-graph-health (change bound-indexer-ast-resource-lifecycle)

Scope: deltas changed since report 20261027-090321, checked against the uncommitted working tree. Read-only.

Method note: `changes spec-preview bound-indexer-ast-resource-lifecycle ...` fails with ENOENT on `manifest.json` (the change directory `specd-sdd/changes/20261023-105244-bound-indexer-ast-resource-lifecycle/` has no manifest, and the change is absent from `changes list`). The merged state was therefore read from the delta files (`deltas/code-graph/indexer/*.delta.yaml`, `deltas/code-graph/get-graph-health/*.delta.yaml`) on top of `specs/code-graph/{indexer,get-graph-health}/`. Unrelated to compliance, but the tooling cannot preview this change as it stands.

Tests run in packages/code-graph (vitest): `index-code-graph.failed-targets.spec.ts`, `get-graph-health.spec.ts`, `index-code-graph-package-resolution.spec.ts`: 43 pass / 0 fail. `index-project-graph-integration.spec.ts`, `index-code-graph-incremental.spec.ts`, `index-code-graph.size-limit.spec.ts`: 48 pass / 0 fail.

## Status of older findings

| Id                                                       | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3 (no in-process cancellation path)                     | RESOLVED (spec clarified) | Requirement "Parser resource lifecycle" now states: "The indexer has no cooperative abort of its own. An in-process run ends early when a host callback (such as the progress callback) throws, and an isolated run is cancelled by terminating the child; the close rules above apply to every such exit." Code: per-file `finally` closes the epoch (`index-code-graph.ts` ~1393-1411) and the outer `finally` closes the run epoch (~2237-2243). Test: throwing `onProgress` in `index-code-graph.parser-resources.spec.ts`. Matches. Remaining test gap M4 is moot. |
| D5 (lookup of a size-skipped file "reports not indexed") | STILL OPEN (Low)          | Requirement "Per-file size limit" still says "A lookup addressed to such a file SHALL report it as not indexed". `file-too-large` occurs in src only in `get-graph-health.ts`, `index-code-graph.ts`, `index-event.ts`, `index-options.ts`. No lookup path (symbol, file, outline, reference resolution) distinguishes "skipped for size" from "not found". Health half is implemented and tested. Either the sentence needs an owner spec/consumer or a lookup behaviour is missing.                                                                                   |

## Per-spec results

### code-graph:indexer (focus: changed or added requirements)

Requirements Summary

1. Index result (modified): adds `diagnostics: { filePath, message }[]` for package-resolution and re-export linking problems (identity collision, inaccessible workspace root, adapter that failed to prepare or link); `errors` only for files or specs that failed to produce their indexed content.
2. Indexed-input observation capture (modified): success means the generation commits, regardless of `errors` or `diagnostics`; observations for every produced resource; failed resources get no observation (health: `OBSERVATION_MISSING`); latches cleared on commit; only a non-committing run leaves latches and observations unchanged.
3. Retry of failed targets (added): a normal incremental run reconsiders every target whose last outcome is a failure (`parse-failed` coverage, or reported error with no observation); persisted hashes, coverage hashes and observations MUST NOT authorize treating it as unchanged.

Implementation Status: all three implemented, with the discrepancies below.

Push-site classification (`index-code-graph.ts`)

| Line       | Site                                                         | Class                                                       | Verdict                                                                                    |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 886        | Hashing or stat of a discovered file fails (non-forced diff) | `errors`                                                    | Correct as a per-file failure, but see D8 (coverage not marked, possible duplicate entry). |
| 1059       | Workspace code root inaccessible for package resolution      | `diagnostics`                                               | Correct (spec names it).                                                                   |
| 1119, 1122 | Package identity failure for an adapter or manifest          | `diagnostics`                                               | Correct.                                                                                   |
| 1140       | Package identity collision                                   | `diagnostics`                                               | Correct (spec scenario).                                                                   |
| 1391       | Pass 1 analysis failure                                      | `errors` plus coverage `parse-failed` / `analysis-failed`   | Correct.                                                                                   |
| 1476       | Adapter package-resolution preparation failed                | `diagnostics`                                               | Correct.                                                                                   |
| 1495       | Adapter re-export linking failed                             | `diagnostics`                                               | Correct.                                                                                   |
| 1568       | Pass 2 import resolution failure for a file                  | `errors` plus `markStageFailed('import-resolution-failed')` | Correct.                                                                                   |
| 1648       | Pass 2 relation build failure for a file                     | `errors` plus `markStageFailed('relation-build-failed')`    | Correct.                                                                                   |
| 1899       | Spec indexing failure                                        | `errors`                                                    | Class correct; see D6 for the observation filter.                                          |

Checks requested

- Pass-2 failures mark parse-failed: yes (`markStageFailed` at 995-1004, called at 1569 and 1649). It reuses `fileHashes.get(...)`, which is empty on forced and fingerprint-mismatch runs (the hashing loop only runs in the non-forced branch), so the persisted coverage hash is `undefined` there. The retry decision checks the status, not the hash, so this is harmless.
- Observations skip failed targets (files and specs): files yes (`failedTargets.has(resourceId)` at 2005); specs only partly, see D6.
- No remaining gate on `errors.length`: confirmed. `clearGraphStaleLatch: true` and `indexedWorkspaces` are unconditional (2113-2114); the observation block is unconditional. No `errors.length`, `errors.some` or `result.errors` gate exists in code-graph, sdk or cli src (the CLI only prints the count and entries).
- Incremental retry correctness: the diff step (905-915) sends a `ParseFailed` target with an unchanged hash to `changedFiles`. No infinite loop: each normal run retries once, and a success replaces the coverage and records the observation (test 3). `filesRemoved` is counted only from `deletedSet`, so retried files do not drift it; `filesSkipped` excludes them; `filesIndexed` counts them only when they succeed (a retry that fails again is not counted). Side effect: while a failure persists, `changedFiles` is non-empty on every run, so `semanticRefreshRequired` is true, dependents are re-closed and reprocessed (`collectAffectedFileClosure`), and `toRemove` is non-empty, so search indexes are rebuilt every run (see D7).
- Forced and fingerprint-mismatch paths: every discovered path is put in `newFiles`, so failed targets are retried naturally; failed pass-1 files get `parse-failed` coverage; stale latches are cleared; observations skip failed targets. Remaining caveat (D9, pre-existing).
- Diagnostics do not block capture: package-identity-collision scenario is satisfied (diagnostic recorded, `errors` empty, observations captured, latches cleared).
- A run that does not commit keeps latches: the observation, coverage and latch writes all go through the bulk write session, and any throw triggers `rollback()` and rethrow. Matches (infrastructure failure not tested, see Missing Tests).

Discrepancies

- D5 (Low): see above, still open.
- D6 (Medium): failed specs are not reliably excluded from observations. `failedTargets` is built from `errors[].filePath`. For spec failures the push is `{ filePath: repoSpec.name.toString() }` (line 1899), while spec observations use `resourceId: specId = "${ws.name}:${repoSpec.name.toString()}"` (line ~1778/1825). The two strings differ, so the filter `!failedTargets.has(observation.resourceId)` (1996) never matches a failed spec. A spec that throws after its filesystem observations were pushed (for example in `readPersistedState` or `createSpecNode`) keeps its observations, contrary to "A failed resource has no observation" and "failed targets get no observation (files AND specs)". Fix: push `filePath: specId` for spec failures (and keep the report path consistent with file entries, which are workspace-prefixed), or compare against both forms. Reach is narrow (the failure must happen after the observation push), and the retry still normally occurs through `persistedStateChanged`, but a retained `spec-lock.json` observation can make the spec look unchanged.
- D7 (Low/Info): a persistent parse failure forces a full dependents reprocess, reference-facts reload and search-index rebuild on every normal run (see "Incremental retry correctness"). This follows from the requirement ("MUST NOT authorize treating such a target as unchanged") and is bounded, not a loop. Worth a note in design; no spec change needed.
- D8 (Low): the hash/stat failure branch (line 886) is a per-file `error` but the target gets no `parse-failed` coverage. If the target had an earlier hash, it is in none of `newFiles`, `changedFiles`, `skippedFiles`; it is not re-analysed, keeps its previous coverage (for example `indexed`), is excluded from observations, and is retried only because hashing runs on every non-forced run. When there is no earlier hash it goes to `newFiles`, fails again in pass 1 and `errors` holds two entries for the same path. Spec requires failures to be "in `errors` and in coverage as `parse-failed`". Suggested: call `markStageFailed` there (or skip the pass-1 retry duplicate).
- D9 (Medium, pre-existing, not introduced by the delta, noted because the delta removes the `errors.length === 0` gate on observation capture): on forced and fingerprint-mismatch runs `fileHashes` is never filled (it is only filled in the non-forced branch, lines 881/883), and the observation loop uses `fileHashes.get(id) ?? existingArtifactHashes.get(id)` (2003). For a file that changed, the observation records the previous persisted hash; for a file that is new to the store (including a forced run on an empty store) no hash is available, so no observation is written and health reports `OBSERVATION_MISSING`. `git show HEAD` shows the same expression, so this predates the change; verified by code reading only, no test exercises it. If the forced path is meant to leave a fully observed graph, pass-1 should record the computed `hash` into `fileHashes`.
- N2 (Info): the CLI prints `errors` only (`cli/src/commands/graph/index-graph.ts` 279, 321); `diagnostics` is not surfaced there. Owned by the CLI specs, not this one.
- N3 (Info): a file that fails in pass 2 has already been counted in `filesIndexed` by pass 1 and is also listed in `errors`.

Test Coverage

- `index-code-graph.failed-targets.spec.ts` (3 tests): failing file leaves latches cleared, `parse-failed` coverage and no observation for it (scenario "A file that fails does not keep the graph stale"); non-forced retry of a failed file with unchanged content, only that file re-analysed, failure stays in `errors`; retry that succeeds gives non-`parse-failed` coverage and an observation. These cover the three "Retry of failed targets" scenarios.
- `index-code-graph-package-resolution.spec.ts`: collision, skipped workspace, identity or prepare exceptions are asserted in `result.diagnostics`; success paths assert `errors` empty. Covers diagnostic classification for sites 1059, 1119/1122, 1140, 1476 and the prepare path.
- `index-project-graph-integration.spec.ts`: logical collision diagnostics in the result; health after size skips (see below).
- Older coverage for the other indexer requirements is unchanged (see report 20261027-090321).

Missing Tests (indexer)

- M9 (Medium, matches D6): no test for a failing spec (errors entry and no spec observation) and no assertion on the `filePath` form of spec errors.
- M10 (Low): no test for a pass-2 failure (import resolution or relation build) producing `parse-failed` coverage, an `errors` entry, no observation and a retry on the next run. Only pass-1 failures are exercised.
- M11 (Low): no test of the forced run and fingerprint-mismatch run with a failing file (retry, coverage, latch clearing); no assertion that observations after a forced run carry the new hash (D9).
- M12 (Low): no test that a non-committing run (store failure at commit) leaves latches and previous observations unchanged (scenario "A run that does not commit keeps the latches").
- M13 (Low): no test of the hash/stat failure branch (D8), or of a retry that does not drift `filesRemoved`, `filesSkipped` or `filesIndexed` counts across consecutive runs with a persistent failure.
- M14 (Info): no test that `parse-failed` files with unchanged hash trigger dependents' reprocessing (D7).
- Earlier open gaps unchanged: M1 (multi-chunk retention), M5, M6 (tied to D5), M7.

### code-graph:get-graph-health

Requirements Summary

1. Efficient scope assessment (modified): a coverage record with status `unsupported` and reason `file-too-large` is a terminal outcome, not an indexed member, so a fresh index with skips is reported current (not `FILESET_CHANGED`); a file that grows past the limit after being indexed MUST still be reported as a membership change.
2. Coverage completeness with warnings (added, unchanged since the previous audit): `coverageCompleteness`, `coverageWarnings`.

Implementation Status: both implemented.

- `get-graph-health.ts` ~587-592 filters `fact.status === 'unsupported' && fact.reason === 'file-too-large'` out of `coverageLocators` before comparing with `visibility.currentInputs`. Visibility already applies the size gate (`graph-input-visibility.ts`, `createFileSizeGate`), so both sides omit skipped files.
- Grown file: its coverage is still `indexed` from the previous run, so its locator stays in `indexedLocators` but is absent from `currentInputs` (now oversized), giving `membershipChanged` and a stale workspace.
- Edge: if every coverage record of a workspace is a size skip, `coverageLocators` is empty and the code falls back to the file and document nodes, which are also empty in that case; the comparison stays consistent.
- `deriveCoverageCompleteness` returns `unknown`/`incomplete` with empty warnings, otherwise `complete-with-warnings` when size skips exist; applied on both result paths (latched-stale early return and main return).

Discrepancies: none new. Previous open items for this spec (H2 never-indexed graph is `unknown`, Info) are unchanged.

Test Coverage

- `index-project-graph-integration.spec.ts`: "does not report a changed file set right after an index that skipped a file for size" (also asserts `complete-with-warnings`); "reports a changed file set when an indexed file grows past the limit" (asserts `FILESET_CHANGED`). Both scenarios of the modified requirement are covered end to end.
- `get-graph-health.spec.ts`: completeness values, warning count, `incomplete` and `unknown` with empty warnings, no warning for other unsupported or excluded reasons.

Missing Tests (health)

- (Low) No unit-level test of the filter in `assessObservedContent` with a mixed workspace (some indexed, some skipped), and none for the edge where all coverage of a workspace is size skips. Integration covers the main behaviour.
- (Low, carried) latched-stale early return coverage assertions, integrity mismatch giving `incomplete` (M-H1, M-H2).

## Summary Counts

- Requirements audited: indexer 3 (Index result, Indexed-input observation capture, Retry of failed targets) plus confirmation of D3/D5; get-graph-health 2. All implemented; Index result and Retry fully, Observation capture with D6 and D9 caveats.
- Older findings: D3 resolved (spec clarified); D5 still open (Low).
- Open discrepancies in this audit: High 0, Medium 2 (D6 spec observations not filtered because the error path lacks the workspace prefix; D9 forced-run observation hashes, pre-existing), Low 2 (D5, D8), Info/Low 1 (D7), Info 2 (N2, N3).
- Missing tests: Medium 1 (M9), Low 5 (M10, M11, M12, M13, plus health unit gap), Info 1 (M14).
- Test status: 91 pass / 0 fail across the six spec files run.
