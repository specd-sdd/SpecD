# Specs compliance report — decouple-core-cli-workflow-guidance (round 13)

Mode: delegated (attempt verification-attempt-15).

## Summary

| Batch                                                          | HIGH | MEDIUM                                    | LOW                       | INFO |
| -------------------------------------------------------------- | ---- | ----------------------------------------- | ------------------------- | ---- |
| A core:get-status, invalidate-change, lifecycle-engine, change | 0    | 1 (conservative, fail-safe)               | 5                         | 2    |
| B core archive/transition/edit/create, snapshot port           | 0    | 0                                         | 4                         | 2    |
| C CLI, error-handling, skills, docs                            | 0    | 0                                         | 3                         | 0    |
| D adversarial code review                                      | 0    | 0 (the same fail-safe item at medium-low) | 1 confirmed + 7 suspected | 0    |
| Total                                                          | 0    | 1 (same item reported by A and D)         | 13 + 7 suspected          | 4    |

Auditor test runs: core 4139 (2 todo), cli 1771, skills 183, guide 26, 429 targeted archive/transition/edit/create tests, scratch matrices of 160 and mutation runs (9 mutations, 8 killed): no lost or duplicated blockers and no over-permissive skippability. Lead gates before the audit: build 13/13, typecheck 26/26, lint exit 0, prettier, test exit 0 (25/25), code-graph corpus count 126.

## Detailed Findings

---

# Partial batch A (round 13, verification-attempt-15): core:get-status, core:invalidate-change, core:lifecycle-engine, core:change

Read-only audit. Scratch copy of core in the session scratchpad was used for mutations; repo untouched.

## Evidence run

- `pnpm exec vitest run` in packages/core: 1294 suites, 4141 tests, 4139 passed, 0 failed, 2 todo (includes lifecycle-engine, change, get-status, invalidate, reconcile suites).
- `tsc --noEmit` clean for core, sdk, mcp, cli.
- get-status-merge-audit.spec.ts: 13/13 pass; invalidate-change-gates-audit.spec.ts: 16 tests (3+1+1+1+2+1+1+1+1+4), all pass.

## 1. core:get-status — `_mergeBlockers` (get-status.ts ~1012-1190)

Requirements summary (changed): a blocker for a check failing in transition and archive contexts with the same code and message is a single blocker, skippable only if skippable in every context (AND). Archive failures judged only against archive bindings; transition failures against the binding applicable to that target's attempt.

Independent re-derivation of the code:

- Maps: `transitionSkippable` and `archiveSkippable` keyed by check id; per failing candidate value = `(applicable ?? sameCheck[0]).skippable`, ANDed into the per-source map. Archive map is additionally pre-seeded as AND over ALL archive bindings of that id (only when archiveChecks non-empty).
- Merge loop: first insertion carries the map value of the first source (transitions come first); a later same-key candidate sets `isSkippable = existing && ownSkippable` (only for `ownKey` merges, not anonymous-key absorption). Count of blockers: one per (checkId, code:message); none lost, none duplicated in all enumerated combinations (same/different message x transition/archive x skippable/locked x multiple targets).
- Combos verified (tests or reasoning): T skip/A locked -> false; T locked/A skip -> false; both skip -> true; both locked -> false; same id different messages across contexts -> each uses own source map (archive message follows archive bindings, transition message follows transition bindings); multi-target same message -> single blocker, AND across targets.

Mutation testing (scratch copy, spec files merge-audit + get-status.spec):

- M1 transition AND->OR: killed (3 tests)
- M2 `applicable ?? sameCheck[0]` -> `sameCheck[0]`: killed (2 tests)
- M3 merge `existing && own` -> `||`: killed (2)
- M4 -> own only: killed (1); M5 merge AND removed: killed (1)
- M7 `applicable` = first binding: killed (2)
- M8 archive candidate reads transition map: killed (1)
- M9 verdict-blocker resolves archive before transition: killed (1)
- M6 archive pre-seed AND -> OR (`archiveSkippable` over all archive bindings of an id): SURVIVES (79/79 pass).

Discrepancies:

- MEDIUM (design/behavior): skippability maps are keyed by check id only, so two blockers of the same check with DIFFERENT messages on different targets are ANDed together even though they are not merged. Test "each attempt resolves its own binding..." (merge-audit.spec.ts:230-240) codifies `['to verifying', false]` although that blocker's own binding (to verifying) is `skippable: true`; the test title says each attempt resolves its own binding, which the expected value contradicts. Direction is conservative (never over-permits skipping), but the blocker is reported locked purely because a sibling-message blocker of the same check id is locked. Either intended (then rename test and doc comment: "a merged blocker is skippable only when skippable on every target it appears on" is imprecise because these are not merged) or per-(id,message) map needed. get-status.ts:1050-1075 and 1160-1180.
- LOW: verdict blocker with a checkId and no failing transition predicate falls back to `archiveSkippable` (get-status.ts ~1117 `?? archiveSkippable.get(...)`), comment says verdict blockers are transition-origin; this binds an archive binding verdict to a non-archive blocker when archive checks exist. Edge case, no test.
- LOW: archive pre-seed AND over all archive bindings of an id (get-status.ts ~1043-1050) is redundant with, but different from, the per-candidate resolution used for transitions (no applicability filter); not covered by any test (M6 survives).
- INFO: JSDoc/param docs for `_mergeBlockers` fine.

Missing tests: (a) multiple archive bindings of one check id with differing skippability (kills M6); (b) same check id, different messages, across transition and archive; (c) verdict blocker with checkId + archive-only bindings.

Implementation status: implemented and tested; no HIGH.

## 2. core:invalidate-change (spec + verify merged via spec-preview)

Requirements summary (changed): guard and forced-revocation recovery preview consider only ENABLED gates; a valid consent of a disabled gate is revoked without force, never in `gates`/`recoveries`; recorded as one `approval-invalidated` event (revoked, `manual-invalidation`) and reported in `projectionChanges`; not restored if gate re-enabled (next reconciliation treats it as revoked and recovers: spec -> designing after ready, sign-off -> done after done; consent must be recorded again). New verify scenarios: disabled gate revoked without force/moves nothing; disabled signoff revoked in archivable; history recording; redesign still moves nothing; re-enable does not restore; preview lists only enabled gates; only signoff previews done.

Code confirmation (invalidate-change.ts:182-201): `revoke = valid.filter(enabled)`, `disabled = valid.filter(!enabled)`; throws only when `revoke` non-empty and no force; `reconcileAfter({revoke: force ? [...revoke, ...disabled] : disabled})`. Preview uses `selectAutomaticRecovery` with only enabled gates (`forceRecoveries`). Each scenario maps to a test: disabled spec x3 states (implementing/verifying/done), signoff-only listing, only-signoff preview, force mixed, combined preview x2, disabled signoff in archivable, history event + projectionChange, redesign/none no-move, re-enable (implementing -> designing, status stays revoked), legacy parking states x4 (pending-spec-approval, spec-approved, pending-signoff, signed-off).

Re-enable behavior per state (reasoned from `approvalField`, `selectAutomaticRecovery`, `RECOVERY_ONLY_TRANSITIONS`): revoked consent with gate now required -> `isBrokenConsent`. designing/drafting: no move. ready: no recovery (spec gate blocks leaving ready, consent renewed there). pending-spec-approval, spec-approved, implementing..archiving: designing (spec). signoff revoked: done and earlier no move; pending-signoff, signed-off, archivable, archiving -> done; spec wins when both. Recovery table entries match `isAfter` axis exactly; no gaps for legacy parking states.

Discrepancies:

- LOW: spec text "a change past the gated state recovers accordingly (spec consent to `designing` after `ready`, sign-off to `done` after `done`)" is accurate but omits that a change IN `ready` stays in `ready` (covered elsewhere in the same spec for forced revocation) and that "after ready" includes the legacy parking states; consider adding "while a change in `ready` stays there and consent is renewed". Also the verify scenario only covers `implementing`.
- LOW (test gap): re-enable is tested only for `implementing` and spec gate; sign-off re-enable (archivable -> done), `ready` (stays) and a legacy parking state are untested.
- INFO: with a mixed set (enabled valid + disabled valid) and no force, the guard throws and the disabled consent is NOT revoked (atomic reject); spec does not state this but it is consistent with "Without force, no mutation occurs".

Implementation status: implemented and tested; no HIGH or MEDIUM.

## 3. core:lifecycle-engine and core:change

No regression: full core suite green. `selectAutomaticRecovery` conditions (spec: broken consent, after designing, not ready; signoff: after done; redesign: artifactReviewRequired and after designing) are consistent with every key in `RECOVERY_ONLY_TRANSITIONS` (change-state.ts:58-84) incl. legacy parking states; `Change` applies recovery via `RECOVERY_ONLY_TRANSITIONS[cause][from]` (change.ts:961). Overlap override, intents and nextAction suites passed.
Discrepancies: none new. Implementation status: implemented.

## 4. Newly exported types (~36)

- Added to core domain/application barrels, core public.ts and sdk core-reexports.ts: ArtifactFileStatus, ReviewArtifactSummary, ReviewArtifactFileSummary, ValidityStatusProjection, ApprovalStatusProjection, VerificationStatusProjection, NextAction, Blocker, ProjectionStatus, ApprovalDecision, VerificationAttempt, CompletedVerification, ProjectionInvalidation, ValidityInvalidationCause, InvalidatedArtifactEntry, ArchiveFailedEvent, ArchiveFailureStep, DescriptionUpdatedEvent, ApprovalInvalidatedEvent, VerificationAttemptStartedEvent, VerificationCompletedEvent, VerificationInvalidatedEvent, ArtifactInvalidationPolicy, WorkflowInvalidationPolicy, InvalidationPolicyOverride, SpecApprovalFingerprint, ArtifactFingerprint, ImplementationFingerprint, ValidityFingerprint, FingerprintDifference, LifecycleActionIntent, BuiltInCheckActionKind, CheckAction, CheckOutcome, AutomaticRecovery, ChangeValidityVerdict, ArtifactReviewTarget, ProjectionChange, ValidityBlocker, FingerprintInputFailure; values approveSpecAction, approveSignoffAction, startVerificationAction, refreshStatusAction.
- Duplicate identifier scan (parsed all `export {}` blocks): core public.ts 760 names, sdk core-reexports.ts 723 names, zero duplicates in either; no type-vs-value collision. Names in core public not in sdk: pre-existing internal/composition ones (CountTasks\*, KernelBuilder, CheckBinding, etc.), none from the new set; sdk-only: CORE_VERSION.
- `tsc --noEmit`: core, sdk, mcp, cli all clean (cli/mcp `import type` consumers fine).
- LOW/INFO: `SpecOverlapError` and `ArchiveDependencyMismatchError` were REMOVED from core errors barrel, public.ts and sdk reexports (files deleted: packages/core/src/domain/errors/{spec-overlap-error,archive-dependency-mismatch-error}.ts, plus test spec-overlap-error.spec.ts). No remaining references in packages src/test; only stale generated docusaurus artifacts under apps/public-web/.docusaurus mention them. This is a public API removal (breaking for external consumers) in a "decouple error messages" change; confirm intended and covered by a spec/changelog.

## Counts

- HIGH 0, MEDIUM 1, LOW 5 (merge archive fallback, merge pre-seed untested mutation, spec text precision, re-enable test gap, removed error exports API break), INFO 2.
- Missing tests: 3 (get-status) + 1 group (invalidate re-enable per state).
- Mutations: 9 run, 8 killed, 1 survived (M6).

---

# Partial batch B (round 13) - archive/transition/edit/create + archive batch snapshot port

Tests run (pnpm --filter @specd/core exec vitest run): archive-batch-snapshot.spec, archive-batch-snapshot-port.spec, all archive-change*, transition-change*, edit-change*, create-change* suites: 14 files, 429 tests passed, 0 failed. `tsc --noEmit` on core: clean.

## 1. Port signature change (restoreBatch/cleanup gain changeName)

Implementations/wrappers/callers (all agree):

- port: core/src/application/ports/archive-batch-snapshot.ts (restoreBatch(specIds, publishOrder, changeName); cleanup(specIds, changeName))
- Fs adapter: core/src/infrastructure/fs/archive-batch-snapshot.ts (restoreBatch ~L170, cleanup ~L215) - uses the changeName arg
- Noop adapter: core/src/application/archive-batch-snapshot-noop.ts - fewer params (valid TS), snapshot already takes changeName
- composition wrapper: core/src/composition/use-cases/archive-change.ts:87-102 threads changeName for restoreBatch/cleanup/detectOrphans/snapshot
- callers: archive-change.ts:1161 (\_handleCommitFailure passes changeName), :703 (cleanup(batchSpecIds, change.name))
- tests/mocks: archive-change.spec.ts:3965 (vi.fn cast), archive-change-batch-restore.spec.ts:433 (class, fewer params), archive-change-audit.spec.ts, composition spec L87 calls with 'change'.
- No implementation/mock in sdk, mcp, cli, plugins, code-graph (grep: only core). packages/guide generated json has no signature text.
- Ordering unchanged: restore iterates reversed publishOrder; per-spec try/catch -> failedSpecIds; cleanup rm best-effort in try/catch, manifests deleted after; logging happens after, Logger.debug delegates to NullLogger/impl (no throw path in-tree).

## Requirements Summary (changed ones)

core:archive-change "Archive debug logging" (delta spec.md.delta.yaml:301-345): new bullets: preflight failure with phase plan|preflight and no hardcoded code; orphan outcome logged in every case incl. corrupt abort; before-persist completion only without fail-fast failure; restore start/per-spec failure/completion, cleanup, created-file logs carry change name.

### Entry-by-entry comparison

- guard outcomes (archive-change.ts:429-439) OK; named-predicates, before-persist start (:464) / completion (:484, after throwHookFailed at :482 so no completion log after fail-fast) OK
- prepare plan (:544) OK; plan failure log phase 'plan' (:552-559) and preflight failure 'preflight' (:578-585) with `...errorCodeField` = error's own string code only, specId via specIdOfError. OK
- orphan: none-found, corrupt-abort (logged before throw), matching-auto-restore, foreign-abort all logged (fs adapter detectOrphans). OK
- snapshot start/completed per spec OK; transitioning-to-archiving OK; tracked artifact selection OK (:874)
- commit: staged start/complete, recorded created file (change: manifest.changeName), archive call, cleanup completed (change: changeName arg) OK
- recovery: commit failure (\_recordArchiveFailure log step/commitStarted/message), restore started/failed/completed with change, rollback log, partial restore log OK
- post-commit: metadata, after-persist effects OK
- guardDetails (:1501): `details === undefined || details === null` guard, peers/specs arrays defaulted, element-type narrowed -> null-safe. Good. (A peers entry that is non-object is dropped.)
- Tests: archive-batch-snapshot.spec.ts L111-215 covers none-found, matching, foreign, corrupt-before-throw, change name in created-file/restore/cleanup/restore-failed logs; archive-change-audit.spec.ts covers plan vs preflight phase/code, before-persist completion after fail-fast (L1096), etc. Spies: both specs have `afterEach(vi.restoreAllMocks)` (audit L60, snapshot spec L15-16); no leak found.

## Implementation Status

- archive-change: implemented, passes. transition-change, edit-change, create-change: suites green (no regression); diffs are the in-scope refactor (transition-change.ts, edit-change.ts changed per change scope).

## Discrepancies

- LOW: No dedicated spec exists for the archive batch snapshot port/adapter (grep specs/: only specs/core/archive-change/spec.md mentions ArchiveBatchSnapshot; no core:archive-batch-snapshot). The port signature (changeName on restoreBatch/cleanup) is therefore specified only indirectly by the log requirement; not in-scope drift, but the contract is undocumented.
- LOW: Spec text (delta L332) says the change name in restore/cleanup/created-file logs is "taken from the batch manifest of the specs involved". Code: restore and cleanup use the explicit `changeName` argument (not the manifest); only recorded-created-file uses manifest.changeName. Behavior satisfies "carry the change name"; wording drifts. Suggest rewording to "the change name passed to the port (or the manifest's)".
- LOW: detectOrphans logs 'none-found' for ANY manifest read failure (e.g. EACCES), and logs nothing when the spec's workspace is unknown (`backupDir === null` -> continue) (fs/archive-batch-snapshot.ts detectOrphans). "Logged in every case" is true only for resolvable specs with ENOENT-or-readable manifests. Pre-existing semantics, minor misreporting.
- LOW: After 'matching-auto-restore' is logged, `_restoreSpec` failures propagate as raw fs errors (not ArchiveOrphanBackupError) and no failure log; pre-existing.
- INFO: Spec delta dropped the old "archivable guard pass" bullet; code has no such log either (consistent).
- INFO: errorCodeField formatting line (archive-change.ts:1538) exceeds 100 cols; prettier/lint may flag (not run).
- No HIGH/MEDIUM findings.

## Missing tests

- Noop adapter with new argument (trivial); orphan outcome for unknown-workspace spec and unreadable manifest not tested; no test asserting logging cannot make restore/cleanup throw.

## Counts

HIGH 0, MEDIUM 0, LOW 4, INFO 2. Tests: 429/429 pass (14 files).

---

# Partial batch C (round 13, verification-attempt-15)

Read-only audit. Specs: cli:change-status/-transition/-invalidate/-verification/-archive/-approve/-edit, error-handling-conventions, skill-templates-source.

## Test results

- `pnpm --filter @specd/cli exec vitest run`: 116 files / 1771 tests passed (no flakes; guide-sdk, change-deps, format-size all passed in the full run).
- `@specd/skills`: 16 files / 183 tests passed.
- `@specd/guide` test/integration/sdk-catalog.spec.ts: 26 passed.

## Requirements summary (changed in round 13)

cli:change-transition new rule (spec line 124) + scenario "Failing status read does not mask the original transition error" (line 461): when the fresh-status read fails while rendering a repair guide, print only the original error via the standard error path in text/json/toon, no repair guide, no blockers/nextAction/validity, exit 1.

- Implementation: transition.ts:533-537 `kernel.changes.status.execute(...).catch(() => undefined)`; `if (status === undefined) throw err` -> falls to outer `catch (err) { handleError(...) }` (transition.ts:582). Compliant in all three formats. Exit code via handleError = 1 (test asserts process.exit(1)).
- Test: transition.spec.ts:822-863 `it.each(['text','json','toon'])`. Passes.
  Other specs (status/invalidate/verification/archive/approve/edit/error-handling/skill-templates): no new discrepancies found in the round-13 diff; edit tests below.

## Item findings

1. Transition guard: OK (see above).
   - LOW (test strength): the 3-format test uses `InvalidStateTransitionError`, while the spec scenario is phrased with `CheckPredicateFailedError`. Both go through `isRepairGuideError` (transition.ts:93-107) and the same branch, so behaviour is identical; the test does not exercise the CheckPredicateFailed/structured-hint path.
   - LOW (test strength): the test only asserts `not.toContain('status exploded')` and the original message is present. It does not assert absence of repair-guide text, `blockers`, `nextAction`, or validity fields in json/toon, which the spec says MUST NOT appear. A regression that renders a half repair record without the status error text would pass.
2. run.spec.ts guard (lines 304-315): regex `/\.catch\(\s*\(\s*\)\s*=>/g`, allowlist `{transition.ts: 1}` is tight (actual count 1; only occurrence in src/commands, verified by grep). Graph commands use `.catch((err: unknown) =>` (impact/search/hotspots/stats/why) - correctly not flagged (they take the error).
   - Matches multi-line spacing (`\s*`). Comments are not stripped (a commented-out `.catch(() =>` would count; harmless, conservative).
   - LOW false negatives: `.catch(function () {...})`, `.catch(_ => ...)`, `.catch((_e) => ...)` / `.catch((_: unknown) => ...)` (unused parameter, still swallows), `.catch(noop)`, `try {} catch {}` is covered by the neighbouring test (line 262). Also only `src/commands` is walked, not `src/helpers`/`src/*.ts` (e.g. cli-cleanup.ts). Scope matches test title; INFO.
3. change-edit.spec.ts additions: new `describe('blocker projection')` (text label/bypass once, archive-intent suffix only for archive, json and toon projection without raw isSkippable, cross-format code parity), guidance tests with `command: null` + `guidance` in text/json/toon (lines ~374-460), readOnly workspace error (line ~605-617), renamed tests "renders the workspaces returned by core in JSON output (workspace added/dropped...)" with explicit comment that derivation is core-tested (lines 689-747). All pass; names now honestly describe CLI-only rendering. No discrepancy.
4. Port signature `restoreBatch(specIds, publishOrder, changeName)` / `cleanup(specIds, changeName)`: callers only in core: ports/archive-batch-snapshot.ts:20,25; infrastructure/fs/archive-batch-snapshot.ts:185,231; application/archive-batch-snapshot-noop.ts:30,41 (noop declares fewer params, TS-compatible); use-cases/archive-change.ts:703,1161; composition/use-cases/archive-change.ts:87-101. No usage in packages/cli/src, sdk/src, mcp/src (only unrelated `cli-cleanup.ts` `cleanup()`). docs/ has no reference. No break. INFO.
5. Guide catalog counts: guides-sdk.json catalog has 1751 entries (code-graph 245, core 697, schemas 5, sdk 803, skills 1) -> total 1751 matches; 1751-23 hand-written = 1728 matches. Specs asserting 1728/1751/'core - 685 topics'/'page 1 of 3 - 725 of 1728' (guide-sdk.spec.ts:111,367,386,460-469,541,550; sdk-catalog.spec.ts:164) all pass against the actual catalog (verified by running them; generator not run). Note: raw catalog `core` count is 697 vs 685 in the page-1 text; that is the api-scope subset rendered within the first 725 items (test passes), not a mismatch. INFO: guides-sdk.json shows -106281 lines in git diff (reformat to compact JSON) and guides.json 1 line; generated noise.
6. Docs sweep / git status:
   - No docs/ statement found contradicting the round-13 code. LOW/INFO: docs/cli/cli-reference.md (transition section ~line 158) does not mention the "status read failure keeps the original error" behaviour (docs omission only, not a contradiction).
   - Untracked files outside the obvious change scope (do NOT delete): repo root `EXPLORATION-checks-gates-getstatus.md` (119 KB), `EXPLORATION_ARCHIVE_LINK_REMEDIATION.md`, `0` (known). Also tracked-modified/deleted unrelated-looking: deletions of core/src/domain/errors/archive-dependency-mismatch-error.ts, spec-overlap-error.ts and core/test/domain/errors/spec-overlap-error.spec.ts (` D`, intentional core decoupling presumably). Other untracked: many `*-audit*.spec.ts` in packages/core/test and cli/test (agent-created audit tests, plausibly in scope), packages/cli/src/guidance-presenter.ts (+spec), packages/core/src/domain/services/find-blocking-parent.ts, packages/skills/test/template-lifecycle-consent.spec.ts, and five other change dirs under specd-sdd/changes/ (lifecycle-polish-followups, custom-checks-and-resilient-hooks, host-lifecycle-dispose, change-schema-fallback-cache, cross-workspace-implementation-links) that are not this change's.
   - Also noted: the guard in run.spec.ts allowlist comment matches code.

## Discrepancies

- No HIGH or MEDIUM.
- LOW: transition test does not assert absence of repair guide/structured fields nor use CheckPredicateFailedError (transition.spec.ts:822-863).
- LOW: `.catch` guard misses non-`() =>` swallowing forms and non-commands dirs (run.spec.ts:304-315).
- LOW: root-level EXPLORATION\*.md scratch files are untracked (cleanup is the caller's decision).

## Missing tests

- Strong negative assertions for json/toon failure record (no `blockers`/`nextAction`/`state`) when status read fails.
- CheckPredicateFailedError variant of the unmasked-error test.

## Counts

cli 1771/1771, skills 183/183, guide sdk-catalog 26/26. HIGH 0, MEDIUM 0, LOW 3, INFO 3.

---

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
