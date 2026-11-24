# Batch C — lifecycle (attempt 14 audit, 2026-10-19)

Prior report: reports/20261017-095914/\_partial-C-lifecycle.md (D-TC1, D-TC2, D-TC5, D-LE1, D-GS2, D-LE2, D-GS1).

## core:transition-change

### Requirements Summary

Flag/policy/recovery items re-verified: skip validation from resolved bindings; failure `skippable` from resolved bindings; `refreshImplementationTrackingBefore:false` skips only pre-evaluation refresh (post-hook always refreshes); committed-recovery nextAction from lifecycle guidance.

### Implementation Status

- ✅ Skip validation uses `effectiveBindings` only; registry `.has()` only for UnknownCheck: transition-change.ts:282-314 (no `registry.bindings()` lookup remains). D-TC2 RESOLVED.
- ✅ `candidate.bindings` passed into `_throwPredicateFailures`; both the collected branch (:573-592) and default branch (`bindings.find`, :661) derive `skippable` from resolved bindings. `TransitionCandidateEvaluation.bindings` exists (evaluate-transition-candidate.ts:~54).
- ✅ Pre refresh `!== false` (:216); post-hook reconcile `refreshImplementationTracking: true` unconditionally (:384-387). D-TC1 RESOLVED as spec drift fix (spec scenarios "Explicit opt-out skips only the pre-evaluation refresh" / "Post-hook refresh catches files changed by hooks" now state pre-only).
- ✅ `committedRecoveryError` (:747-775) uses `evaluateLifecycle` over reconciled change+schema+approvals; reason overridden; both call sites (:227, :392) pass schema/approvals. No `/specd-verify` literal. D-TC5 RESOLVED.

### Discrepancies

None HIGH/MEDIUM. LOW: committed-recovery test only asserts command `not '/specd-verify'` rather than the exact guidance command (test weakness, not a defect).

### Test Coverage (packages/core/test/application/use-cases/transition-change.spec.ts; 130/130 pass)

- Skip validation uses attempt's resolved binding: covered (:3022 "honors schema-declared skippable in skip validation"; :3013 negative case).
- Failure skippable from resolved binding: covered (:3035).
- Explicit opt-out skips only pre refresh: covered (:408-422, asserts calledOnce = post-hook only).
- Post-hook refresh catches hook-created files: covered (:2940-2966).
- Committed recovery verifying-disabled: covered, weak-ish (:179-224; command !== '/specd-verify', reason contains returned state). Verifying-enabled path asserted :175.
- Other scenarios unchanged from previous audit (PASS there).

### Missing Tests

None blocking. Optional: assert exact `command` equals lifecycle guidance for state `done` in the disabled-verifying recovery test.

### Summary

HIGH 0 / MEDIUM 0 / LOW 1. Prior D-TC1, D-TC2, D-TC5 resolved.

## core:lifecycle-engine

### Requirements Summary

Guidance requirement: commands from selected nextHop; verification renewal commands only when `verifying` enabled; blocked done/signed-off with verifying disabled resolves from the real blocker (sign-off, review, design) never `/specd-verify`; verification boundary derived from `resolveWorkflowPipeline` + `isWorkflowStepEnabled`, no hardcoded state lists.

### Implementation Status

- ✅ `isAtOrAfterVerificationBoundary(state, schema, approvals)` exported: lifecycle-verdict.ts:989-1002 (false when verifying disabled; drain-aware `pipelinePosition`). Old `verificationBoundary` removed (no references in src). Used by verdict (lifecycle-verdict.ts:954) and guidance (lifecycle-guidance.ts:54). D-LE1 RESOLVED.
- ✅ `resolveLifecycleCommand` takes `schema` (lifecycle-guidance.ts:33-41); inline state list gone; `verifyingEnabled` from `isWorkflowStepEnabled`.
- ✅ done/signed-off with verifying disabled (lifecycle-guidance.ts:~147-162): archivable→/specd-archive; designing/review→/specd-design; signoff gate & `validity.signoff !== 'valid'`→`specd changes approve signoff`; else /specd-archive. D-LE2 RESOLVED.
- ⚠️ phaseCommand still keys its command matrix on literal state names (drafting/ready/implementing/…); this is the "happy-path command matrix" the spec says belongs in guidance, not a boundary/state-membership list. LOW; spec arguably tolerates.

### Discrepancies

- LOW (scope note): `packages/core/src/application/use-cases/invalidate-verification.ts:137-144` `nextFrom` keeps a hard-coded boundary list (verifying, done, pending-signoff, signed-off, archivable, archiving) gated by `verifyingEnabled`. Design agreed decision 5 ("No hardcoded verification-boundary state list") and the lifecycle-engine guidance requirement concern guidance/verdict; `core:invalidate-verification` is NOT among this change's specs, and its own spec (specs/core/invalidate-verification/spec.md:39) enumerates `verifying, done, archivable, archiving` explicitly (code is a superset incl. pending-signoff/signed-off, which are drain states between done and archivable). Interpretation A (spec drift/ok): out of scope, spec lists states and "includes" is non-exclusive. Interpretation B (impl debt): should call `isAtOrAfterVerificationBoundary(state, schema, approvals)`; also its recovery branch `recovery.to === 'done' ? '/specd-verify'` (:159-160) is unguarded by verifyingEnabled (recovery to done with verifying disabled would route to /specd-verify) -> same family as D-TC5. Recommend follow-up change; not a blocker for this change.

### Test Coverage

- Disabled verifying routes forward to archive: covered (lifecycle-engine.spec.ts ~:120-165, :167-200).
- Blocked done verifying disabled never routes to verify: PARTIAL/weak. Test at lifecycle-engine.spec.ts:256-308 calls `resolveLifecycleCommand` directly with an injected `validity('stale')`; scenario requires `evaluateLifecycle` with the real reconciler/validity verdict (the very gap that hid the earlier bug). No test uses the real reconciler.
- Guidance verification boundary follows topology (noncanonical `workflow[]` row order, verifying disabled): MISSING a test with noncanonical row order (grep "noncanonical" returns none). `isAtOrAfterVerificationBoundary` unit tests exist (lifecycle-verdict.spec.ts:1209-1246: enabled/disabled/drain states) but not through guidance with reordered rows.
- Blocked done routes to real blocker: weak, same as above (sign-off/design/archive branches covered at the resolver level only).
- Tests run: lifecycle-engine + lifecycle-verdict specs 53/53 pass.

### Missing Tests

1. `evaluateLifecycle` (not `resolveLifecycleCommand`) for `done` with verifying disabled, signoff gate on, real validity verdict from `evaluateChangeValidity`/reconciler, no signoff -> command `specd changes approve signoff`.
2. Noncanonical-order `workflow[]` + verifying disabled: commands for implementing/done/archivable never `/specd-verify`.

### Summary

HIGH 0 / MEDIUM 0 / LOW 2 (invalidate-verification debt; matrix literals) ; test gaps: 2 scenarios weak/missing (see FAIL criteria below).

## core:get-status

### Requirements Summary

Blocker projection: `isSkippable`/`bypassFlag: '--skip-checks <checkId>'` only when the RESOLVED binding of the check for the evaluated candidate is skippable (including schema-declared); IMPLEMENTATION_STATE: only impl.linksInScope bypassable.

### Implementation Status

- ✅ `execute-matching-predicates.ts:253-307` returns `bindingsByTarget` from each candidate's `bindings`; GetStatus passes it (get-status.ts:704-709) to `_mergeBlockers` (:945-1004). Skippability = `bindings.find(b => b.check.id === check.id)?.skippable === true` per target; archive checks use `_archiveBindings`. No `checkRegistry.bindings()` lookup remains. D-GS2 RESOLVED.
- ✅ Bypass flag text `--skip-checks <id>` (get-status.ts:~1000, :1024) matches spec :181. D-GS1 RESOLVED (spec aligned).
- ✅ Verdict-precomputed `blocker.bypassFlag` is overridden by resolved bindings (:972-980).

### Discrepancies

- LOW: skippability is OR-ed per check id across targets (get-status.ts:966-969) and falls back to base `_transitionBindings` when a target has no entry (:957). A check skippable for one target but not another yields a bypassFlag on a deduped blocker for both. Spec says "for the evaluated candidate"; negligible in practice (blockers dedup by code+message). Impl-detail drift, not a defect.

### Test Coverage (get-status.spec.ts; 54/54 pass)

- Open-file IMPLEMENTATION_STATE no bypass: covered (:723-774).
- Links-in-scope keeps bypass: covered (:835-886).
- Schema-declared skippability drives bypass flag: covered (:779-830, impl.filesResolved skippable via schema).
- Archivable overlap bypass: covered (:1413, :1456).
- bypass flag text: covered (:1616-1639).

### Missing Tests

None blocking.

### Summary

HIGH 0 / MEDIUM 0 / LOW 1. D-GS1, D-GS2 resolved.

## core:count-tasks

Spec requirement: sovereign schema resolution (change.schemaName/version via ResolveChangeSchema), no default fallback.

- ✅ count-tasks.ts:45-52 resolves via `ResolveChangeSchema.execute({changeName, schemaName, schemaVersion})`; failure propagates (no try/catch).
- Tests: custom-workflow schema (count-tasks.spec.ts:18, :48 "propagates sovereign schema resolution failures without fallback counts"); 32/32 pass across count-tasks+invalidate-change specs. Counting scenarios (markdown-checkbox defaults, uppercase marker, unsafe pattern, empty content, no capability inference) covered, unchanged since previous PASS.
- Discrepancies: none. HIGH 0 / MEDIUM 0 / LOW 0.

## core:invalidate-change

Spec requirements: input contract/policy override, force guard, canonical reconciler-based recovery, output contract incl. "canonical blockers and next action", sovereign schema resolution, DAG traversal order.

- ✅ Schema from change (`ResolveChangeSchema`), failure precedes persistence; tests invalidate-change.spec.ts:158, :180. Reconciler-driven effects/blocker/projection output present (invalidate-change.ts:~165-173).
- ❌ MEDIUM D-IC1: `invalidationNextAction` (invalidate-change.ts:183-199) hard-codes `command: recovery.to === 'designing' ? '/specd-design' : '/specd-verify'`, bypassing lifecycle guidance. With `verifying` disabled (or recovery.to = `implementing`/`ready`/`archivable`), the result advertises `/specd-verify`, contradicting core:lifecycle-engine "Verification-renewal commands MUST only be recommended when verifying is enabled" and design S5/S6 / agreed decision 5 ("No hardcoded ... `/specd-verify` recovery command"). Same defect class as the resolved D-TC5, left in a sibling use case. Test locks it in: invalidate-change.spec.ts:435 expects `{targetStep:'done', command:'/specd-verify'}` (only the verifying-enabled shape is tested).
  - Interpretation A (spec drift): core:invalidate-change spec only says "canonical ... next action" with no command-resolution rule, so its own spec does not forbid it; drift would be resolved by adding a sentence "next action MUST be projected from lifecycle guidance (evaluateLifecycle)".
  - Interpretation B (impl bug, favoured): lifecycle-engine requirement is project-wide for recovery commands; fix = reuse `evaluateLifecycle(change, schema, {approvals, validity: reconciled.verdict, checksByTarget: {}})` as in `committedRecoveryError`. Not listed in tasks 38-40, so this is likely an unnoticed sibling.
- ⚠️ LOW (related): invalidate-verification.ts:137-161 (see lifecycle-engine section) has the same hard-coded boundary list and unguarded `/specd-verify` for `recovery.to === 'done'`; not a spec of this change.
- Test gaps: no scenario/test for disabled-verifying next action in invalidation result.
- Summary: HIGH 0 / MEDIUM 1 / LOW 1.

## Prior-failure status

D-TC1 resolved, D-TC2 resolved, D-TC5 resolved, D-LE1 resolved, D-LE2 resolved (code), D-GS1 resolved, D-GS2 resolved. New: D-IC1 (MEDIUM, sibling hard-coded `/specd-verify` in InvalidateChange). Test gaps: lifecycle-engine scenarios "Blocked done ... never routes to verify" / "routes to the real blocker" (real reconciler, via evaluateLifecycle) and "Guidance verification boundary follows topology" (noncanonical row order) lack end-to-end test evidence (only resolver-level injected-validity tests).

BATCH VERDICT: FAIL
(Reasons: D-IC1 MEDIUM non-compliance in core:invalidate-change; two lifecycle-engine new/changed-behavior scenarios without full test evidence. All previously-reported MEDIUM items in transition-change/get-status/lifecycle-engine are fixed.)
