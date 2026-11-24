# Round 13 batch D - independent bug hunt (verification-attempt-15)

No HIGH defects found. Test counts: see bottom (appended after suite run).

## CONFIRMED (reproduced)

### 1. MEDIUM-LOW (design inconsistency, fail-safe): `_mergeBlockers` skippability is per check id, not per blocker message, across targets

- packages/core/src/application/use-cases/get-status.ts ~1042-1068 (`transitionSkippable` keyed by `check.id`, AND over all targets).
- Scratch matrix (160 cases: {T only, A only, both} x skippable/locked x same/different message x 1/2 targets x verdict blocker present/absent; script at scratchpad/matrix.ts, calls the private method via prototype) -> 24 deviations from a per-message oracle:
  - 16 real: check bound on 2 targets with DIFFERENT messages, one target skippable and one locked: BOTH blockers get isSkippable=false (the skippable-target blocker is downgraded). Never in the unsafe direction (never reports skippable when locked). No lost or duplicated blockers in any case.
  - 8 are oracle artifacts (verdict blocker with no failing predicate stays its own entry - correct).
- Inconsistent with the sibling rule: transition vs archive with different messages keep separate per-source flags (test "archive failures use archive bindings only"), while multiple transition targets with different messages share one flag. Test get-status-merge-audit.spec.ts:230 is named "each attempt resolves its own binding" yet asserts the skippable-target blocker is `false`; the name contradicts the assertion. Either rename or key the map by `id+message`.
- Same message across transition+archive and across targets: AND correct in all 4x4 combos; no wrong flags; no lost/duplicated blockers.

## SUSPECTED / LOW

2. LOW archive-batch-snapshot.ts:81 - `manifest.changeName` dereferenced when building the log context. A manifest whose JSON parses to `null`/number/array (e.g. file containing `null`) throws a raw TypeError (not ArchiveOrphanBackupError, no recovery guidance); archive records a 'prepare' failure with a TypeError. Pre-existing at line 85 but the new log moved it earlier; no test.
3. LOW archive-batch-snapshot.ts:96-101 - manifest without `changeName` (valid object): classified 'foreign-abort', error message reads `for change "undefined"` and `ArchiveOrphanBackupError.changeName === undefined` against a `string` type. No test for this.
4. LOW archive-batch-snapshot.ts:51-59 - any readFile failure (EACCES, EISDIR, EIO) is logged and treated as `none-found` and the orphan is silently ignored; the log label is misleading. Pre-existing semantics, new label hides it.
5. LOW archive-batch-snapshot.ts:213 and 244 - `Logger.debug` unguarded: a throwing logger implementation inside the restoreBatch `catch` aborts the restore loop (remaining specs neither restored nor in `failedSpecIds`), and in `cleanup` throws after a successful archive move. Logger is a pino proxy and NullLogger by default, so only reachable with a hostile/buggy LoggerPort. No path info leaks in corrupt-manifest log/error (only specId, change name); the corrupt message says "Remove .specd-archive-backup" without the dir path (UX only).
6. LOW archive-batch-snapshot.ts:253-273 - manifest `existingFiles`/`createdFiles` entries are joined to specDir without containment check; a tampered matching-change manifest could write/delete outside the spec dir. Pre-existing, local-tamper only.
7. LOW archive-change.ts:596-603 - if `snapshot()` fails for spec N, specs 1..N-1 keep backups (no restore/cleanup in that catch); next run reports "Recovered orphan backup" and needs a second retry. Pre-existing design; matches "one reconciliation commits one recovery" spirit. Not new in round 13.
8. LOW approve.ts:`enrichApprovalFailure` (~236-260) - uses Reflect.defineProperty to overwrite own fields `state`, `blockers`, `nextAction` on the thrown error. `ReconciledOperationBlockedError` (core/application/errors) has exactly those readonly fields, so overwriting would replace raw core blockers with CLI-projected ones. Currently unreachable: only TransitionChange/ArchiveChange throw it and approve never does (verified by grep). Fragile if ApproveChange ever starts reconciling.
9. LOW CLI text divergences (no JSON/toon impact): `change edit` blocker lines are indented two spaces on stdout (" ! CODE — label: msg", " bypass: ..."), `approve` writes them unindented to stderr ("! CODE", " bypass: ..."), transition uses " bypass: ..." (two spaces after colon). Same data, three layouts.

## Public API widening (item 3) - nothing found

- ~36 added exports are all `type` exports (checked sdk core-reexports.ts diff and the 5 core index.ts diffs); the only added values are approveSpecAction/approveSignoffAction/startVerificationAction/refreshStatusAction (intended helper functions, domain/services/index.ts). No name collision (tsc --noEmit clean in core, sdk, cli), no circular export, SDK barrel includes every newly added core type (ProjectionStatus/AutomaticRecovery/... in a separate `export {type}` block - fine). SpecOverlapError / ArchiveDependencyMismatchError removal: no remaining src/test imports; specs/ still mention them but the change deltas (deltas/core/archive-change) cover it. Did not run a dts build (would write dist); no size data.
- Generic exported names `Blocker`, `NextAction` in SDK are broad but not colliding.

## run.spec.ts `.catch(` guard (item 4)

- Regex `/\.catch\(\s*\(\s*\)\s*=>/` over packages/cli/src/commands only. False positives: would match inside a comment or string literal (none today). False negatives (can miss the same swallowing): `.catch(_ => ...)`, `.catch((_e) => ...)`, `.catch(function...)`, empty `catch {}` blocks (edit.ts:192 overlap best-effort, approve.ts:236 enrich, guide, schema, spec/search...) and anything outside commands/ (handle-error.ts, helpers/). It guards the literal shape only. Allowlist is exact-count so a second use in transition.ts fails the test (good).
- transition.ts:536 `.catch(() => undefined)` followed by `if (status === undefined) throw err` is correct: original error preserved.

## Stray / untracked (item 6, not deleted)

- Repo root: `0` (0-byte file, likely a shell redirect accident), EXPLORATION-checks-gates-getstatus.md, EXPLORATION_ARCHIVE_LINK_REMEDIATION.md.
- Untracked REAL source needing `git add`: packages/cli/src/guidance-presenter.ts, packages/core/src/domain/services/find-blocking-parent.ts (+ ~46 new test files incl. the audit specs).
- Untracked specd-sdd/changes/\* (6 change dirs incl. .specd-exploration.md) - expected workflow state.
- Tracked deletions: core errors spec-overlap-error.ts, archive-dependency-mismatch-error.ts, test spec-overlap-error.spec.ts.

## Test quality (item 7), 10 reviewed

1. archive-batch-snapshot.spec.ts logger tests (none-found/matching/foreign/corrupt): strict toEqual on none-found/corrupt, kills outcome-swap mutants. SURVIVORS: corrupt test does not assert error `isCorrupt`/message; matching test does not assert backup removal/restore side effects in same test; `snapshot started/completed` logs and `restore started.specIds` (reversed order) unasserted; no test for null/missing-changeName manifest (item 2/3).
2. "carries the change name in created-file/restore/cleanup logs": only `[0]` of each message and `toMatchObject({change})`; mutating `manifest.changeName` to `changeName` in recordCreatedFile is equivalent so fine; extra context fields can regress freely.
3. "restore failure log": good (forces real copy failure).
4. get-status-merge-audit.spec.ts AND table (210-228): kills `&&`->`||` and `existing.isSkippable && own` -> `own` mutants. Good.
5. get-status-merge-audit.spec.ts:230: name contradicts assertion (see #1); pins the over-conservative behavior as correct.
6. get-status-merge-audit.spec.ts:195 "archive failures use archive bindings only": passes with either per-source maps or AND; pins different-message separation only.
7. invalidate-change-gates-audit.spec.ts (disabled gate tests): covers force/no-force/re-enable; consent-not-restored is specified. Not inspected for event ordering mutants beyond title level.
8. transition.spec.ts:2093 toon test: asserts only result/error/checkId/hint substrings; `checkId: spec.overlap` is satisfied by the error block alone, so dropping `blockers`/`nextAction` from the toon record survives. Exit code never asserted (runFailing swallows rejection with `.catch(() => {})`, test file line 1963), so a regression to exit 0 or a thrown TypeError survives.
9. change-edit.spec.ts guidance tests: JSON/text covered; automaticReturn null vs undefined semantics ('(none)' text, `null` json) consistent with readAutomaticReturn (checked source).
10. run.spec.ts guard: see item 4 above.

## Checked, nothing found

- `_mergeBlockers` lost/duplicated blockers: none in 160 cases. Verdict-blocker vs predicate dedupe by key correct; archive-only failures with archiveBindings lacking the id resolve to locked (false), safe.
- archive-change.ts changeName threading: all 4 call sites pass `change.name` / `changeName` (strings); composition wrapper forwards all args; noop port has parameterless methods (compatible); mocks in tests with no params are fine at runtime.
- Logging calls: Logger is a static proxy over a NullLogger default; no awaits, no control-flow impact under normal impls.
- CLI: reconciled-blocked paths in transition/archive emit json/toon via projectReconciledOperationBlocked and exit 1 (CliExitError(1)); text path writes repair guide to stderr and exits 1. edit/approve use projectCliBlocker (isSkippable replaced by bypassFlag) for json/toon; raw core fields not leaking there.

## Suite counts (single run each)

- core: 291 files passed, 4139 tests passed + 2 todo, 0 failures (213s).
- cli: 115 files passed, 1749 tests passed, 0 test failures, BUT vitest exited 1 with 1 "Unhandled Error": `[vitest-pool] Failed to start forks worker for packages/cli/test/commands/project/status.spec.ts ... Timeout waiting for worker to respond` (388s run, import 403s: machine load while core/cli/tsc ran). Infrastructure flake, not an assertion failure; status.spec.ts itself was counted among the 115 passed files. Re-run in isolation to confirm if CI strictness matters.
- tsc --noEmit clean in core, sdk, cli.
