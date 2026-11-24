# Specs compliance report — decouple-core-cli-workflow-guidance (round 10)

Mode: delegated (attempt verification-attempt-12).

## Summary

| Batch                                                                                                                                     | HIGH | MEDIUM                      | LOW                       | INFO |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------- | ------------------------- | ---- |
| A core:get-status, lifecycle-engine, change, workflow-model                                                                               | 0    | 0                           | 1 (low-medium)            | 2    |
| B core:edit-change, create-change, archive-change, transition-change, transition-checks, invalidate-change, workflow-topology, approve-\* | 0    | 1                           | 8                         | 3    |
| C CLI specs, error-handling, skills, docs sweep                                                                                           | 0    | 1                           | 2                         | 2    |
| D adversarial code review (whole change)                                                                                                  | 0    | 1 (confirmed) + 1 suspected | 5 confirmed + 3 suspected | 0    |
| Total                                                                                                                                     | 0    | 3 confirmed (+1 suspected)  | 16                        | 7    |

Auditor test runs: core 4069/4071 (2 todo), cli 1752/1752, skills 183/183, 0 failures. Lead gates before the audit: build 13/13, typecheck 26/26, lint, prettier, test 25/25, code-graph corpus count 126.

## Detailed Findings

---

# Round 10 partial batch A: core:get-status, core:lifecycle-engine, core:change, core:workflow-model

Read-only audit. Scratch probe (outside repo): scratchpad/probe.spec.ts, results in scratchpad/probe-out.txt.

## Tests run

- core: test/application/use-cases/get-status\*, test/domain/services, test/application/checks, test/domain/checks: 820 passed / 0 failed (210 suites).
- core: test/application/services (lifecycle-guidance etc.): 80 passed / 0 failed.

## core:get-status (changed: Identifies blockers merge paragraph, 2 scenarios)

Spec (get-status spec.md line ~189): verdict blocker and failed check merge only when code AND gate match: APPROVAL*\* <-> approval.spec; SIGNOFF*_ <-> approval.signoff; VERIFICATION\__ <-> verification.current; merged entry carries check message/label/checkId/action. Scenarios: same-gate merge; different gates (SIGNOFF_STALE vs approval.spec APPROVAL_STALE) not merged.

Implementation: get-status.ts:419-452 (VALIDITY_TWIN_CODES + validityTwinCode), \_mergeBlockers 997-1120. Verified.

Producible blocker codes

- Verdict (change-validity.ts ~565-640): ARTIFACT_DRIFT, ARTIFACT_REVIEW_REQUIRED (never pair: right), APPROVAL_REQUIRED/STALE/REVOKED, SIGNOFF_REQUIRED/STALE/REVOKED, VERIFICATION_REQUIRED/IN_PROGRESS/STALE.
- Checks that can share a code: approval.spec (APPROVAL_REQUIRED/STALE/REVOKED, gate spec): maps 1:1, right. approval.signoff emits APPROVAL_REQUIRED, APPROVAL_STALE (also for revoked), and VERIFICATION_IN_PROGRESS/REQUIRED/STALE (gate signoff). verification.current emits VERIFICATION_REQUIRED/IN_PROGRESS/STALE and VERIFICATION_VALIDITY_UNAVAILABLE (no verdict twin: correct). Other checks (impl._, hook._, deps, overlap, etc.) have their own codes, no verdict twin.
- Spec-vs-signoff confusion is fixed: verdict SIGNOFF_STALE no longer collapsed with approval.spec APPROVAL_STALE (probe + audit test 'keeps stale spec consent and a stale sign-off failure as two blockers').

Real-fixture probe (done state, signoff gate on, stubbed verdict via reconcileAs):

1. signed + stale verification -> ONE blocker VERIFICATION_STALE "Verification evidence is stale", checkId verification.current, action start-verification. No duplicate. (The approval.signoff VERIFICATION_STALE failure has the same code+message as verification.current's so it dedupes by key, and the verdict twin is absorbed.) Good.
2. signed + attempt-active -> single VERIFICATION_IN_PROGRESS (same reason, identical message). Good.
3. signed + absent verification -> TWO blockers: VERIFICATION_REQUIRED "Completed verification is required before signoff" (checkId approval.signoff, no action) and VERIFICATION_REQUIRED "Completed verification is required" (verification.current, start-verification). Duplicate for the same condition.
4. revoked signoff -> TWO blockers: APPROVAL_STALE "Signoff is stale" (approval.signoff, approve-signoff) AND SIGNOFF_REVOKED "Sign-off is revoked" (no checkId/action).
5. unsigned + stale verification -> two distinct blockers (approval.signoff APPROVAL_REQUIRED, verification.current VERIFICATION_STALE): correct, distinct conditions.

So the answer to the specific question: a VERIFICATION\_\* from approval.signoff does not twin with the verdict blocker, but in the realistic stale/in-progress cases the user still sees ONE blocker (message equality + verification.current twin). The duplicate appears only for absent verification (message wording differs) .

Implementation Status: implemented, tests pass.

## Discrepancies

- MEDIUM-LOW (LOW-MEDIUM) D1: revoked sign-off is reported twice with contradictory codes. domain/checks/approval-signoff.ts:36-47 maps status 'revoked' to APPROVAL_STALE "Signoff is stale", while verdict says SIGNOFF_REVOKED; table in get-status.ts:430-434 has no pairing for SIGNOFF_REVOKED (only APPROVAL_REVOKED <-> SIGNOFF_REVOKED, which approval.signoff never emits). Probe case 4. Violates "MUST merge into one public blocker" for the same condition. Fix: emit APPROVAL_REVOKED from approval.signoff for revoked (and keep table), or map APPROVAL_STALE also to SIGNOFF_REVOKED when verdict says revoked. Not covered by tests (tests cover only stale and absent).
- LOW D2: signed sign-off with absent verification yields duplicate VERIFICATION*REQUIRED blockers (probe case 3), because approval.signoff's VERIFICATION_REQUIRED message ("...before signoff") differs from verification.current's and it is not a twin. Edge state (verification required, sign-off valid, verification absent) but the merge key relies on message text equality for cases 1-2 (fragile: reword either message and stale/in-progress would duplicate too). Suggest pairing approval.signoff VERIFICATION*_ by code via a dedupe on (code, checkId-set) or dropping the VERIFICATION\__ fallbacks from approval.signoff since verification.current is bound on the same edges (check-bindings.ts:118-141).
- LOW D3: ordering dependence in \_mergeBlockers (get-status.ts:1074-1085): twin replacement requires !merged.has(key); if a non-twin check (approval.signoff) already inserted the same key first, verification.current falls into the 'existing' branch and only copies the action. Works today (probe 1,2) but the verdict twin disappears only incidentally.
- INFO D4: spec sentence says sign-off codes SIGNOFF\_\* "pair with the approval.signoff check" but the check's own failure codes are APPROVAL_REQUIRED/APPROVAL_STALE (mapped through the table). Spec should state the code mapping (APPROVAL_REQUIRED->SIGNOFF_REQUIRED, APPROVAL_STALE->SIGNOFF_STALE) and that revoked is reported as stale by the check, or code should be changed (see D1).

Missing tests: revoked sign-off (D1); signed sign-off with absent/stale/in-progress verification asserting exactly one verification blocker (D2/D3; get-status.spec 'raises no verification blocker...' covers only verifying-disabled); verification.current VERIFICATION_VALIDITY_UNAVAILABLE not merged; verdict APPROVAL_REVOKED vs approval.spec revoked merge.

Discriminating power of new tests: audit test 'keeps stale spec consent and a stale sign-off failure as two blockers' discriminates the old code-only merge (would collapse to 1 entry). 'reports a missing sign-off once' discriminates (verdict SIGNOFF_REQUIRED absorbed by approval.signoff APPROVAL_REQUIRED, which a code-only match would not). 'routes a blocked done to the sign-off action' (get-status.spec.ts:1690) asserts single approval.signoff blocker with action, no SIGNOFF_REQUIRED, intent null: discriminating. Verified passing.

## core:lifecycle-engine (new scenarios: blocked ready without action -> no intent; stale verification at archivable -> verify)

- lifecycle-guidance.ts:88-100 (resolvePhaseIntent: verification boundary -> 'verify' when validity.recovery === null and verification stale/absent/attempt-active), 147-190 (intentForStateAndHop falls through to null for blocked ready since nextHop.targetStep === state and not a drain state), 59 (action only from failed hop check, supersedesIntent). Matches scenarios; tests lifecycle-guidance.spec.ts:384 and 399 (plus 414 archive when current). Pass. No discrepancies. INFO: 'attempt-active' also routes verify at archivable (not in scenario; consistent with spec intent).

## core:workflow-model (new text)

- gm flag: spec step 5 'gm' matches count-tasks.ts:57-58. OK.
- hasTasks: artifact-type.ts:145 default false; requiresTaskCompletion validation uses hasTasks at buildSchema (spec ln 91, 186) - consistent with earlier rounds.
- hook.pre along any except recovery: check-bindings.ts:150-158 (applicability along '\*', exceptAlong ['recovery']); enforced at lifecycle-verdict.ts:794 and evaluate-transition-predicates.ts:33. hook.post forward only per spec. OK.
- taskCompletion at archive scope: workflow-task-completion.ts:57-95 iterates steps with non-empty requiresTaskCompletion, first failing result wins, skip when none; binding scope archive at check-bindings.ts:~228. Matches spec ln 104. Side note LOW/INFO: archive-scope skip/pass detail includes byArtifact; fine. Transition binding also has exceptAlong recovery for workflow.taskCompletion and one more check (check-bindings.ts:40-47) that spec text does not mention explicitly (INFO).
  No HIGH/MEDIUM discrepancies.

## core:change

No round-10 changes touching it found; spot-checked via test pass (820/0). No new discrepancies.

## Counts

HIGH 0, MEDIUM 0 (D1 rated LOW-MEDIUM; treat as MEDIUM if "MUST merge" is strict), LOW 3 (D1, D2, D3), INFO 2 (D4 + taskCompletion binding note). Missing tests: 4 groups.

---

# Partial batch B (round 10) - spec-compliance audit

Specs: core:edit-change, create-change, archive-change, transition-change, transition-checks, invalidate-change, workflow-topology, approve-spec, approve-signoff. Read-only. Focus: round-10 changes + new-problem hunt. approve-spec, approve-signoff and workflow-topology were not changed in round 10 and were not re-audited in depth (only build-schema's isDrainState import was checked for cycles: none).

Test run: `npx vitest run` in packages/core: 4071 tests, 4069 passed, 0 failed, 2 skipped/todo; 1278 suites, 0 failed.

## Requirements summary (changed ones)

### core:edit-change / core:create-change - "Seed specDependsOn"

Spec now: seed from persisted state only (`readPersistedState`, spec-lock.json); unknown workspace / missing spec / no persisted state => `[]` for edit, no entry for create; no metadata.json fallback. Merged verify has the replaced scenarios (persisted seeds, existing snapshot not overwritten, absent state => empty with "metadata.json not consulted"; create: "Absent persisted state seeds no dependency entry").
Code: `_shared/load-persisted-spec-depends-on.ts` reads only `repo.readPersistedState`; EditChange `_executeScopeEdit` seeds only for new ids without an existing entry; CreateChange seeds only when `source !== 'empty'`. MATCHES.
Factory deps: `resolveEditChangeDeps` resolves changes, listWorkspaces, actor, schemaProvider, resolveChangeSchema, refreshImplementationTracking, reconcile - matches spec list. `EditChange` ctor `reconcile` is now a required positional (type). All construction sites: `composition/use-cases/edit-change.ts:105` (only src site), kernel.ts:443 via createEditChange(resolveEditChangeDeps), tests (edit-change.spec.ts helper passes `makeObservingReconcile`). cli/sdk/mcp/code-graph never construct EditChange directly (sdk only re-exports types). `isEditChangeDeps` requires `'reconcile' in value`; covered by composition/mandatory-validity-reconciler.spec.ts. MATCHES.

### core:archive-change

- Archivable guard ordering: code archive-change.ts:362-390 resolves schema, reconciles, state guard (InvalidStateTransitionError / ReconciledOperationBlockedError on committed recovery) BEFORE `executeMatchingPredicates` (:419, failFastOn schema.nameMatch). Spec text and scenario "Change not in archivable state" match; `assertArchivable()` inside mutate at :586. MATCHES.
- ArchivePreflightError: no occurrence in any of the 9 merged previews (spec+verify), nor in packages/_/src, packages/_/test, docs, apps. Only baseline `specs/core/archive-change/{spec,verify}.md` still name it (replaced by the change deltas; expected pre-archive). Remaining `'ARCHIVE_PREFLIGHT'` is only a Logger `code` string (archive-change.ts:536,558). MATCHES.
- ContentHasher plain Error: thrown in `services/resolve-sealed-archive-depends-on.ts:59` (message identical to spec). Spec sentence and JSDoc (@throws {Error} archive-change.ts:359, :986) match; test `archive-change-audit.spec.ts:493` asserts `constructor === Error`. MATCHES.
- Debug logging: see Discrepancies D1-D5 (entry-by-entry comparison).
- @throws of ArchiveChange.execute (:343-359) vs real throw sites: ChangeNotFound(:366), SchemaNotFound/IdentityMismatch (ResolveChangeSchema), InvalidStateTransition (:389,:492,:515), Unknown/NotSkippable (validateSkipChecks), CheckPredicateFailed (throwArchivePredicateFailure), ReconciledOperationBlocked (\_archiveRecoveryError), HookFailed (throwHookFailed), ArchiveArtifactMissing/ParserNotRegistered (:827-848,:1239), ArchiveBatchRestore (:1143), ArchiveOrphanBackup (batch snapshot adapter), DeltaApplication/ArtifactParse (parsers), plain Error (hasher). Complete; no phantom entries.

### core:transition-change / core:transition-checks - renamed scenarios

transition-change merged verify: "Parked spec approval rejects a target without a protocol edge" (:984) and "Parked signoff ... protocol edge" (:991) exactly once each; old "...non-drain target" titles absent. "Stale approval returns to design instead of parking" (:368, modified body: stale in implementing) and "Stale approval at ready stays in ready and the check blocks" (:375) once each. "Backward skill hop from a post-verification state invalidates sign-off in the mutation" (:622) once. No duplicate scenario titles in the whole merged preview (uniq -d empty).
transition-checks merged verify: "skipHookPhases all still runs predicates" (:771) once; old "Skip-hooks still runs predicates" absent from merged preview (remains only in baseline specs/ file). Test: transition-change.spec.ts:2812 "still fails incomplete tasks when skipHookPhases is all" (asserts workflow.taskCompletion INCOMPLETE_TASKS) - discriminates.
TransitionChange.execute @throws (:196-205) vs throw sites (:213,:231,:239,:255,:383,:391, \_throwPredicateFailures:511,525, hook failures, entity transition inside mutate): complete and accurate.

### core:invalidate-change - Approval guard

Spec: guard evaluated inside the same serialized reconciler mutation, from projection status after the reconciler pre-pass; consent valid-by-projection but stale per fingerprint recovers without force; preview computed with effective policy. Code invalidate-change.ts:~171-195 does exactly this (`consentToRevoke(ctx.change)` inside `_reconcile.mutate`; `forceRecoveries(..., effectivePolicy, ...)`); throwing inside mutate aborts the single `changes.mutate` so "no mutation occurs" holds. Tests: invalidate-change.spec.ts:424 (stale per fingerprint), :447, invalidate-change-ready-audit.spec.ts:243/:299. MATCHES.

## Implementation status

All round-10 spec changes are implemented. No HIGH/MEDIUM correctness gaps found in code vs spec for items (1)-(5) except the debug-logging coverage below.

## Discrepancies

- D1 [MEDIUM] Archive debug logging, "overlap and readOnly guard outcomes - spec IDs checked; overlap entries or readOnly workspaces". The only ArchiveChange log is archive-change.ts:442 `named archive predicates complete` with `overlapCount` + `invalidatedChanges`; no spec IDs checked, no readOnly workspace outcome (spec.overlap / workspace.readOnly checks have no Logger calls).
- D2 [LOW] "pre-archive hooks - start and completion (step, phase, skipped phases)". Logs at :453/:470 carry `change`, `checkId`, boolean `skipped` only; no `step`, `phase`, or skipped-phase list. Also :470 completion log does not report failure/skip.
- D3 [LOW] "tracked artifact selection ... direct vs delta-backed". :830 logs `artifactId`, `filename` but no direct/delta flag (derivable from filename only).
- D4 [LOW] "persisted metadata generation start and completion per spec (or skip reason)". :688-701 logs only for stale specs; `continue` at :685 (no published state) and non-stale specs emit no skip-reason log. Also "metadata generation completed" duplicates "force materialization completed".
- D5 [LOW] "Failure diagnostics: spec ID and artifact basename when failure is spec-scoped" and "each entry MUST use structured fields (change, specId, step, phase)". `publication preflight failed` logs (:535,:557) have `code`/`message` only (no `change`, no `step`, no `specId`/artifact); duplicated message text for prepare-plan vs preflight failure.
  Entries verified present: prepare-plan counts (:527), full-batch preflight completion (:551), deferred transition (:588 change+actor), staged publication start/completion (:605/:630), archive repo call (:657/:663), lifecycle rollback (:1130), partial restore (:1138), recorded failed attempt with step/commitStarted/message (:1164), after-persist start/completion (:709/:738); adapter-owned (archive-batch-snapshot.ts): orphan check, snapshot start/complete, recordCreatedFile, restore start/complete/failed, cleanup.
- D6 [LOW] No test asserts any ArchiveChange debug log entry (only archive-change-batch-restore.spec.ts touches Logger), so D1-D5 cannot be caught by tests.
- D7 [LOW] Spec scenario wording (transition-change verify :984-996): "WHEN it requests `implementing` THEN transitions ... AND requesting `spec-approved` fails" reads sequentially (second request from `implementing`) though the tests (transition-change.spec.ts:640-680) issue each request from the parked state. Reword as two separate requests from the same parked state.
- D8 [LOW] Test title edit-change.spec.ts:190 "seeds newly added specs from persisted dependencies before metadata fallback" still implies a metadata fallback that the spec says does not exist (body is fine, includes a conflicting metadata.json).
- D9 [LOW] transition-change.ts:498-499 `void change; void schema` in `_throwPredicateFailures` - dead parameters left after removing `_mapFailedPredicate`; drop params instead.
- D10 [INFO] EditChange ctor `reconcile` is required by type only; unlike TransitionChange/ArchiveChange (:277, transition-change.ts:178 throw InvalidCompositionFactoryArgumentsError) there is no runtime guard for JS callers. Spec edit-change does not require one; factory-level guard exists via `isEditChangeDeps`.
- D11 [INFO] `ArchiveChange` records the composition-time plain Error (missing ContentHasher) as a failed 'prepare' archive attempt (`_recordArchiveFailure`), polluting history with a programming error; spec only says it is the sole generic Error.
- D12 [INFO] Create-change/edit-change seeding tests are characterization tests: the loader has no metadata fallback in HEAD, so they would not fail against a pre-round-10 code state; they guard against re-introducing the fallback, not a fix. Same for the ArchiveChange error-propagation tests.

## Test discrimination (item 6)

- archive-change-audit.spec.ts: stale-after-hooks test (calls>=2, CheckPredicateFailedError verification.current + start-verification params) fails if predicates were not rerun before the blocked-validity throw; "no predicate fails" test pins InvalidStateTransitionError and not ReconciledOperationBlockedError, state still archivable; no-hasher test pins plain `Error` constructor; delta ArtifactParseError identity test. Discriminating.
- transition-change-audit\*.spec.ts: blockedBy recursion, Change.transition args, committed recovery guidance (design intent / signoff action), parked `next`, missing verdict (VERIFICATION_VALIDITY_UNAVAILABLE), missing reconciler ctor failure. Discriminating.
- edit-change.spec.ts seeding tests (:190,:223,:256,:287): the "no persisted state ignoring metadata.json" test would fail if a metadata fallback existed (returns shared/metadata). Discriminating against a fallback.
- create-change.spec.ts:396 seeds-no-entry-ignoring-metadata: same.
- composition/use-cases/edit-change.spec.ts: asserts every dep including reconcile via identity against resolver getters and that config/deps forms build working use cases; fails if reconcile/resolveChangeSchema missing from deps. Discriminating.
- build-schema.spec.ts:1142 it.each constructor/toString/**proto**: fails with `in VALID_TRANSITIONS` (inherited keys pass), passes with Object.hasOwn. Discriminating.

## Missing tests

- No test that a non-archivable change whose checks would fail schema.nameMatch (or any predicate) reports InvalidStateTransitionError first (state-guard-before-predicates ordering; archive-change.spec.ts:264 and :4661 only cover plain state error / skip-id ordering). Note nameMatch is largely shadowed by ResolveChangeSchema's identity mismatch error thrown earlier.
- No test for stale/revoked (vs absent) spec approval at `ready` committing no recovery (transition-change.spec.ts:521 covers only missing consent).
- No tests for archive debug logging entries.

## Counts

Requirements newly checked in detail: 9 changed items. Discrepancies: HIGH 0, MEDIUM 1 (D1), LOW 8 (D2-D9 incl. D6/D7/D8/D9), INFO 3 (D10-D12). Core tests: 4069/4071 passed, 0 failed.

---

# Partial batch C (round 10, read-only)

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Test results

- `@specd/cli` vitest (json reporter, full run, no flakes): 115 files, 453 suites, 1752 tests, 1752 passed, 0 failed.
- `@specd/skills`: PASS 183, FAIL 0.

## Round-10 item verification

1. `isCheckPredicateFailed` (guidance-presenter.ts:192) matches instanceof or name. Used by transition.ts (100, 219, 549) and archive.ts (193). No other CLI/mcp/sdk consumer does `instanceof CheckPredicateFailedError`; sdk only re-exports. `transition.ts:101,137` still use `instanceof CheckNotSkippableError || name ===` inline (same dual semantics, not via shared helper). Name-only tests exist: transition.spec.ts:2026/2394, archive.spec.ts:1013, handle-error.spec.ts:515. OK.
2. Blocker projection: status (text + json + toon + drafted json 622/367), approve (232), invalidate (247), verification (299), transition failure record (558), edit (edit.ts:145,219) all use `projectCliBlocker`. No raw `isSkippable` emitted from any command; `status.ts:686` lifecycle.blockers are a different per-transition shape (transition/reason/blocking), unaffected. `handle-error` structured error metadata carries error-own `skippable` field (INFO, pre-existing, distinct from blockers). Prior-round claim that edit already projected is now true (edit.ts:219).
3. Docs verified against code: cli-reference status bypass text matches `resolveCliBypassFlag`/`blockerTextLines`; workflow.md approve-from-ready-or-legacy matches approve-spec.ts; errors.md TransitionFailureReason matches invalid-state-transition-error.ts:4-11; custom-checks.md repair-guide sample line order matches transition.ts 219-296 and `validityTextLines`. Archive "workspace.readOnly never skippable" consistent with docs/guide/workflow.md:263 and ADR 0030 (binding lock; I did not re-derive from registry source).
4. Wide sweep of docs/, guide, skills templates: no stale `isSkippable` exposure or CLI-command-in-core statements found; skills templates mention pending states only as drain.

## Discrepancies

- MEDIUM (missing test): no test asserts `change edit` json/toon blockers are projected (bypassFlag present, `isSkippable` absent, label/checkId kept). packages/cli/test/commands/change-edit.spec.ts blockers fixtures (136, 176, 213) have no checkId/isSkippable; only the --help test (752) mentions bypassFlag. Projection at edit.ts:145/219 is therefore unguarded.
- LOW (missing test): `change invalidate` has no test with `isSkippable` blockers (no isSkippable in change-invalidate.spec.ts); json projection at invalidate.ts:247 and text bypass line (blockerTextLines) unguarded. verification.spec.ts:428 only asserts nextAction.reason, not blockers[].isSkippable absence/bypassFlag.
- LOW: `change edit` text blockers (edit.ts:255) print `! code: message` without label or `bypass:` line, unlike status/invalidate/approve (blockerTextLines). Spec cli:change-edit does not require it, but inconsistent. Edit blockers come from validity, so skippable rarely applies.
- INFO: transition.ts:101/137 duplicate instanceof-or-name logic for CheckNotSkippableError rather than a shared helper (symmetry with item 1; behaviour correct).
- INFO: docs/core/errors.md describes TransitionFailureReason under "lifecycle transition" only; approve-spec also throws it for ineligibility (approve-spec.ts:120). Not wrong.

## Counts

HIGH 0, MEDIUM 1, LOW 2, INFO 2.
Per-spec implementation status: all nine specs implemented; no unimplemented requirements found this round.

---

# Batch D - adversarial code bug hunt (round 10, attempt 12)

Tests (vitest json, run once): core 4071 total / 4069 passed / 0 failed (2 not-run); cli 1752 / 1752 passed / 0 failed.
Scope read in depth: change-validity.ts (selectAutomaticRecovery, collectChangeReviewTargets), change-state.ts RECOVERY_ONLY_TRANSITIONS, Change.recover, reconcile-change-validity.ts (whole), invalidate-change.ts, get-status.ts (\_mergeBlockers, validityTwinCode, \_nextActionAfterArchiveOverlap), archive-change.ts (post-hook block, \_materializeImplementationLinks, postHookValidityBlocksArchive), transition-change.ts execute(), cli guidance-presenter.ts, status.ts, transition.ts repair guide. NOT read in depth: lifecycle-guidance.ts / lifecycle-evaluation.ts (do not exist under those names; logic lives in lifecycle-verdict.ts, only the next-action section was read), check-bindings.ts (only skippable flags grepped), CLI approve/archive/edit/invalidate/verification.

## CONFIRMED (traced fully)

1. MEDIUM - misleading bypass guidance: overlap + stale verification (or any other blocker)
   - core get-status.ts:1139-1156 `_nextActionAfterArchiveOverlap` replaces the verdict's nextAction with intent 'archive' whenever an OVERLAP_CONFLICT blocker exists, regardless of other blockers. Test get-status-audit.spec.ts:~370-420 pins this ("keeps the archive intent ... live overlap meets stale verification").
   - cli guidance-presenter.ts:~170 `projectCliNextAction` then appends "Use --skip-checks spec.overlap to archive anyway." to the reason when intent==='archive' and the overlap blocker is skippable.
   - Result: status tells the user to bypass overlap and archive while VERIFICATION_STALE (non-skippable, enforced again by archive-change.ts:514 postHookValidityBlocksArchive and by predicates) will still refuse. The user follows the hint, then fails. Fix: only override/append bypass when overlap is the sole blocking blocker; otherwise keep verdict nextAction (start-verification).

2. LOW/MEDIUM - public API gap: types in public signatures are not exported
   - `AutomaticRecovery` and `ChangeValidityVerdict` appear in public results (InvalidateChangeResult.automaticReturn, ReconciledOperationBlockedError.recovery, GetStatus validity, RecoveryTransitionTable in the exported change-state.ts) but grep of core/src/index.ts, sdk/src/core-reexports.ts and barrels finds no export (change-validity.ts is not re-exported). Consequence visible in CLI: \_validity-present.ts:422-442 `readAutomaticReturn(unknown)` duck-types, transition.ts uses `(status as { validity?: unknown })`, edit.ts uses `'automaticReturn' in result`. Type-unsafe casts exist only because the types cannot be named. Also `readAutomaticReturn` returns `undefined` for a malformed object, silently dropping a committed recovery from output (swallow).

3. LOW - transition early-return skips skip-check validation
   - transition-change.ts:262 `designing -> designing` returns `{change}` before `validateSkipChecks` (line ~298), so `--skip-checks bogus` is accepted silently there but rejected on every other hop. Harmless but inconsistent (unvalidated flag).

4. LOW - recovery not convergent in one reconcile (by-design priority, but observable)
   - change-validity.ts:186-214: priority spec consent > signoff (>done) > workflow-redesign. With spec gate off, signoff gate on, policy.workflow=redesign and artifact drift (which stales signoff), first reconcile moves archivable -> done only; `_apply` is single pass (reconcile-change-validity.ts:206-262, execute() calls it once), so the redesign return to designing happens on the NEXT status/transition call. `changes status` is therefore not idempotent for that change (state changes between two consecutive reads). test select-automatic-recovery.spec.ts pins the priority but nothing tests the two-call convergence. mutate() re-applies only when the operation did not call reconcileAfter.

5. LOW - public docs bundles still carry removed API (untracked/generated)
   - apps/public-web/.generated/api/{core,sdk}/classes/{SpecOverlapError,ArchiveDependencyMismatchError}.md and interfaces/LifecycleBlocker.md `bypassFlag`, LifecycleVerdictInput `bypassFlags`, plus .docusaurus registry. `git ls-files` shows these are NOT tracked, so build noise only; no action. No remaining src consumers of SpecOverlapError / ArchiveDependencyMismatchError in packages/_/src, docs, specs, skills templates, mcp, plugin-_. `bypassFlag` in cli/src is the CLI-rendered field (status.ts, edit.ts help text) - intended.

6. LOW - test fidelity: cli transition.spec.ts:2309-2319 uses check code 'SPEC_OVERLAP' for spec.overlap; the real code is 'OVERLAP_CONFLICT' (domain/checks/spec-overlap.ts:59). Test passes but documents an obsolete code.

## SUSPECTED (reasoned, not reproduced)

7. MEDIUM - commit-time TOCTOU in transition/archive
   - transition-change.ts:375-430: post-hook reconcile at 375 and predicate re-run at 393 happen outside the final `_changes.mutate` (420). The mutate only calls `freshChange.transition(...)` (state-legality) and never re-evaluates validity/drift/consent. A concurrent edit/invalidate between 393 and 420 (rerun predicates can be slow: hooks) can be overwritten by a forward transition on stale verdict. State legality still protects against concurrent state change. Same pattern in archive-change.ts (post-hook reconcile at ~498 then prepare plan/publish). Also `_refresh` in ReconcileChangeValidity.execute/mutate (line 132/151) runs outside the serialized mutate.

8. LOW/MEDIUM - \_mergeBlockers skippability crossing sources
   - get-status.ts ~1030-1046: for verdict (`reviewBlockers`) blockers the lookup is `archiveSkippable.get(id) ?? transitionSkippable.get(id)`. archiveSkippable is populated for EVERY archive binding (not only failing ones) whenever archiveChecks is non-empty, so in `archivable` a transition-origin verdict blocker with a checkId that also has an archive binding takes the archive binding's skippability (false is defined so it never falls back). Contradicts the in-code comment "the two sources never share a skippability verdict". Also archiveSkippable ORs duplicate bindings but `bindings.find` (first match) is used for transition. Needs a test with a check id that is skippable on transition and locked on archive (or vice versa).

9. LOW - forceRecoveries preview is per-gate independent (invalidate-change.ts:438-454): when both spec and signoff are valid and force is used, the actual single recovery is spec-approval -> designing, but the signoff entry previews `done`. Matches "independently" docstring, but the force error can under-report the real target for signoff.

10. LOW - invalidate-change.ts next action when recovery===null always intent null / 'cognitive' 'Review the reported blockers before advancing' even when verdict has no blockers (no review required). Cosmetic.

## Areas checked with NO defect found

- RECOVERY_ONLY_TRANSITIONS x ChangeState x cause: every state that selectAutomaticRecovery can return (isAfter designing, !ready for spec; isAfter done for signoff; isAfter designing for redesign) has an entry in the table, including legacy pending-spec-approval/spec-approved/pending-signoff/signed-off; `ready` correctly absent for spec-approval, present for workflow-redesign; Change.recover guards from/to mismatch. DELIVERY_AXIS contains all 12 ChangeStates. No hole found.
- persistConsequences recover is guarded by `change.state === recovery.from` (skips silently, but mutate re-evaluates); needsArtifactReview idempotent.
- CLI json/toon/text: status json drops isSkippable via projectCliBlocker (renders bypassFlag), text path uses same resolveCliBypassFlag; `checks`/`checksByTarget` raw passthrough (optionalCheckFields) carry CheckResult which has NO skippable/isSkippable field, so no raw leak. grep isSkippable/skippable in cli/src: only error-hints.ts, handle-error.ts (metadata, not output), archive.ts/transition.ts reading CheckPredicateFailedError.skippable to render hints. Draft status path hardcodes command:null (consistent).
- transition.ts repair guide: not-skippable vs skippable branches symmetrical; exit via isRepairGuideError.
- archive: `_materializeImplementationLinks` correct for disabled/bypassed/unknown-workspace cases; postHookValidityBlocksArchive only blocks on non-skippable gates (verification.current and approvals are not skippable), so bypass cannot be defeated for a skippable check.

## Test quality (10 judged; first 5 read fully, rest by assertion shape)

1. select-automatic-recovery.spec 'does not move done for stale sign-off' - STRONG; mutating `isAfter(state,'done')` to `>=` fails.
2. select-automatic-recovery 'keeps spec recovery ahead of sign-off' - STRONG (priority swap fails).
3. get-status-audit 'evaluates archive predicates ... skippable failure' - asserts isSkippable true and bypassFlag absent; survives mutation that makes ALL archive blockers skippable only if the binding says true (it does) - misses the cross-source case (#8).
4. get-status-audit 'keeps the archive intent ... overlap meets stale verification' - passes, but it PINS defect #1 (a regression guard for questionable behavior). Mutation: none; fix would require changing the test.
5. get-status.spec 'bypassFlag in blocker === false' (3 places) - weak negative; survives if core re-adds a differently named field (e.g. `bypass`).
6. cli transition.spec 'json failure carries error and bypass hint' - uses wrong code SPEC_OVERLAP (#6) but still exercises hint path; survives a mutation changing code mapping.
7. cli reconciled-blocked.spec / cli-audit-round-2.spec - ~17 and 10 `toContain` for 6/8 tests: substring assertions; survive reordering/duplication of lines (e.g. printing the bypass line twice, or command and guidance both) - MEDIUM weakness.
8. guidance-presenter.spec (9 its, 0 weak) - exact-value assertions; strong.
9. invalidate-change-ready-audit.spec / transition-change-audit-2.spec (0 weak assertions) - exact; strong by shape.
10. archive-change-audit.spec (8 its, 1 weak) - not individually read; no TOCTOU/concurrency test exists anywhere for #7 (concrete surviving mutation: remove the post-hook re-run or move transition before it - covered only by ordering tests if any).
