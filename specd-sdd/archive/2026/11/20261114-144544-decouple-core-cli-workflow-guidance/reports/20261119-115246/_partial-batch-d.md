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
