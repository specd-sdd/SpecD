# Batch A, round 3 — focused audit of the `ready` spec-consent exemption

Scope: selectAutomaticRecovery (packages/core/src/domain/services/change-validity.ts:186-205) and its callers. Read-only audit.

## Verdict on the fix

CORRECT and consistent with callers. Condition is `isBrokenConsent(spec) && isAfter(state,'designing') && state !== 'ready'`.

- States returning to designing: pending-spec-approval, spec-approved, implementing, verifying, done, pending-signoff, signed-off, archivable, archiving. Matches the delta text "only from states after ready". Not from drafting/designing/ready.
- Signoff (isAfter done) and workflow-redesign (isAfter designing) branches are untouched, as the delta claims.
- Callers: change-validity.ts:163 (evaluateChangeValidity), reconcile-change-validity.ts:494 (recomputes after projection changes; uses the same fn, so ready exemption applies after in-flight staling too), invalidate-change.ts:403 (forceRecoveries). change.recover() (change.ts:959) is only invoked from reconcile-change-validity.ts:666 with the verdict recovery, so no caller can now request ready->designing for spec-approval.
- Tests: packages/core/test/domain/services/select-automatic-recovery.spec.ts covers ready stale/revoked => null, all later states => designing, designing/drafting no-op, valid/absent/not-required ignored, signoff and redesign unaffected, spec priority. approve-audit-2.spec.ts:154-226 covers reconcile in ready (stays, idempotent, no transition event) and renewal after returning to ready. Verify scenarios "Stale consent stays in ready until it is renewed" and "Stale consent after ready still returns to designing" (core:change) are both covered.

## Findings

### F1 [MEDIUM] core:get-status spec text still says stale consent routes to designing unconditionally (SPEC wrong)

Merged spec lines: requirement text "unless required stale spec consent or an explicit redesign requires designing" (~line 166), "Required stale spec consent has recovery priority and yields committed designing guidance" (~205), scenario "Non-task pending review routes..." AND "required stale spec consent routes to designing regardless of preserve" (~293), scenario "Preserve routes artifact review..." AND "required stale spec consent instead routes to designing" (~596). In `ready` no recovery is committed and status stays ready with the approve-spec action (this is exactly core:lifecycle-engine scenario "Stale spec approval in ready resolves through the check"). Fix: qualify with "from a state after ready" in those four places. Code is right.

### F2 [MEDIUM] core:invalidate-change spec says forced spec revocation always returns to designing (SPEC wrong, outside the five audited specs)

specs/core/invalidate-change/spec.md:57 "A forced spec-approval revocation returns the change to designing". From `ready` it now revokes consent and stays in ready (forceRecoveries target = change.state, invalidate-change.ts:410; recovery null). Needs the same "from states after ready" qualification; also the guard text at :49 ("recovery target") is fine. Not covered in any of the five assigned specs, so check whether it is in this change's delta set.

### F3 [LOW] forceRecoveries ignores the effective manual policy (CODE gap, edge case)

invalidate-change.ts:403-409 hardcodes `{artifacts:'none', workflow:'preserve'}` and artifactReviewRequired=false. Before the fix, a valid-spec-consent `ready` change reported target `designing` for any policy, which matched reality under workflow `redesign`. Now with `--policy workflow=redesign` (or a project default of redesign) invalidating from `ready` with valid consent: the guard reports target `ready`, but the reconciler (change.invalidationPolicy / intent.policy) selects workflow-redesign => `designing`. The reported recovery can therefore differ from what is committed. Also affects implementing etc.? No: those still map to designing for spec gate; signoff gate under redesign similarly reports `done` while redesign would return to designing (pre-existing). Fix: pass effective policy and review flag, or document the guard as consent-only targets. No test covers forced invalidation from `ready`.

### F4 [LOW] Untested: forced invalidation from `ready` with valid consent

invalidate-change.spec.ts:396 only tests implementing. Needed scenarios: ForceInvalidationRecovery target `ready` for spec gate (guard error `recoveries`), and forced execution from ready stays in ready with automaticReturn null and consent revoked.

### F5 [LOW] docs/core/domain-model.md:205 stale

"If the change was not already in designing, a transitioned event rolling back to designing is appended" — no longer true from `ready` (and the recover path is a recovery-only edge, not an invalidated-event side effect). Add the ready exemption.

### F6 [INFO] RECOVERY_ONLY_TRANSITIONS['spec-approval'].ready (change-state.ts:60) is now unreachable

No caller can select it; change.recover() would still accept it if called directly. Harmless defense-in-depth; either keep (documented as topology only) or remove with a core:workflow-topology/change note. core:workflow-topology has no wording about it.

### F7 [INFO] Redundant clause

`state !== 'ready'` plus isAfter(state,'designing') is correct but `ready` is the only excluded after-designing state, intent is documented in the code comment. No action.

## Counts

HIGH 0, MEDIUM 2 (F1, F2), LOW 3 (F3, F4, F5), INFO 2 (F6, F7). No code defects in the new exemption itself.
