# Batch C — lifecycle (attempt 15 audit, 2026-10-19)

Focused run: core vitest (lifecycle-engine, get-status, invalidate-change, transition-change, count-tasks specs) = 221 pass / 0 fail.

## core:invalidate-change

### Requirements Summary

New requirement "Next action follows lifecycle guidance": nextAction after automatic recovery MUST come from evaluateLifecycle for the recovered state under the sovereign schema; with verifying disabled never /specd-verify nor `verification start`. Plus unchanged requirements (policy, targets, force guard, reconciler, sovereign schema, output contract).

### Implementation Status

- ✅ D-IC1 RESOLVED: `invalidationNextAction` (invalidate-change.ts, bottom of file) calls `evaluateLifecycle(change, schema, {approvals, validity: verdict, checksByTarget: {}})` and spreads `lifecycle.nextAction`, overriding only `reason`. No `/specd-verify` literal remains in the file. Approvals injected through constructor (invalidate-change.ts ctor param `approvals`) and wired in composition/use-cases/invalidate-change.ts (`resolver.config.approvals`, lines ~30-56).
- ✅ Behavior with verifying disabled + pending-review artifact -> `/specd-design`: matches spec. lifecycle-guidance.ts:74 `review.required -> /specd-design` (and phaseCommand done/signed-off branch with `!verifyingEnabled`, lifecycle-guidance.ts ~:152-165, returns design when review.required). Spec only requires "from lifecycle guidance" and "not verify"; scenario 1 ("command comes from lifecycle guidance for done") is satisfied since guidance legitimately returns design while an artifact is pending review.
- ✅ No-recovery path returns cognitive "Review the reported blockers" with command null (spec scopes the requirement to "invalidation that triggers an automatic recovery").

### Discrepancies

- LOW: spec "Config-based factory delegates through resolveInvalidateChangeDeps" lists only changes/actor/schemaProvider as resolved deps; code additionally resolves `approvals` (+ reconcile/resolveChangeSchema). Spec incompleteness (A) vs. impl fine (B); non-blocking.
- LOW: the "Recovery with verifying disabled" test exercises the pending-review branch (/specd-design); the pure guidance-for-`done` branch (sign-off command / archive) after invalidation with no pending review is not tested (policy `none` + force sign-off revocation would hit it). Non-blocking.

### Test Coverage (invalidate-change.spec.ts 'recovery next action follows lifecycle guidance', :447-493)

- Recovery with verifying disabled never recommends verification: covered (:477-486; asserts automaticReturn.to=done, command '/specd-design', not verify, not 'verification start', reason).
- Recovery with verifying enabled routes to /specd-verify: covered (:488-492).
- Remaining scenarios (policy, target, force, sovereign schema, order, hasDrift): unchanged, pass.

### Missing Tests: none blocking.

### Summary: HIGH 0 / MEDIUM 0 / LOW 2. D-IC1 resolved.

## core:transition-change

Unchanged since attempt 14 (all PASS there; D-TC1/2/5 resolved). Re-checked: no `/specd-verify` literal in transition-change.ts (grep); `committedRecoveryError` uses evaluateLifecycle; tests pass (part of 221). LOW carried: committed-recovery test asserts only `!== '/specd-verify'`. HIGH 0 / MEDIUM 0 / LOW 1.

## core:lifecycle-engine

- ✅ Resolutions confirmed: lifecycle-guidance.ts:54-61 verification renewal gated by `verifyingEnabled` and `isAtOrAfterVerificationBoundary(state, schema, approvals)`; only remaining `/specd-verify` literals (:121,133,140,148,170,193) are guarded by `nextHop.targetStep==='verifying'`, state `verifying`, or the `verifyingEnabled` branch (done/signed-off returns design/signoff/archive when disabled, :~152-165).
- ✅ Test gap "blocked done with real reconciler": now covered end-to-end at get-status.spec.ts:1648-1711 ('GetStatus with verifying disabled and the real reconciler': makeRealReconcile, done + signoff gate -> `specd changes approve signoff`, SIGNOFF_REQUIRED blocker, no verification blockers once signed off). GetStatus calls evaluateLifecycle with reconciled verdict. The lifecycle-engine.spec.ts-level tests (domain/services/lifecycle-engine.spec.ts:~255-298) still use injected validity into resolveLifecycleCommand — acceptable because scenario is verified via GetStatus; weak only in location.
- ✅ Test gap "noncanonical workflow[] order": covered at test/domain/services/lifecycle-engine.spec.ts:~310-345 (rows done, verifying(disabled), implementing, ready; implementing/done commands != /specd-verify; availableSteps order ['ready','implementing','done']).
- LOW: that noncanonical test checks `implementing` and `done` only (scenario also names `archivable`) and asserts only "not /specd-verify", not the derived command. Weak, non-blocking.
- LOW (carried, out of scope): invalidate-verification.ts keeps own boundary list (`nextFrom`) and unguarded `/specd-verify` for recovery.to==='done'; spec core:invalidate-verification not in this change (design.md "Third Post-Verification Revision" out of scope). Interp A: ok/out of scope; B: follow-up debt.
- LOW (carried): phaseCommand keys command matrix on literal state names.
  HIGH 0 / MEDIUM 0 / LOW 3.

## core:get-status

Unchanged vs attempt 14: bindingsByTarget-based skippability (execute-matching-predicates.ts, get-status.ts \_mergeBlockers), `--skip-checks <id>` text; tests pass. New real-reconciler describe (get-status.spec.ts:1648) passes. LOW carried: OR-ed skippability across targets. HIGH 0 / MEDIUM 0 / LOW 1.

## core:count-tasks

Unchanged: sovereign schema via ResolveChangeSchema (count-tasks.ts:45-52), no fallback; tests pass. HIGH 0 / MEDIUM 0 / LOW 0.

## Totals: HIGH 0 / MEDIUM 0 / LOW ~7 (all non-blocking). No new/changed-behavior scenario lacks test evidence.

BATCH VERDICT: PASS
