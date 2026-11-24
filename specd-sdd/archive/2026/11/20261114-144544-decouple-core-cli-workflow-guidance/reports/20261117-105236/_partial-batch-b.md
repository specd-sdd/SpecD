# Round 3 audit, batch B (read-only)

Change: decouple-core-cli-workflow-guidance
Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:approve-spec, core:approve-signoff, core:archive-change

Test run: vitest on archive-change, invalidate-change (3 files), approve-spec, approve-signoff, approve-audit-2, approve-consent-audit, check-bindings, select-automatic-recovery, transition-change specs. Result: 379 passed, 0 failed.

## Verification of the five round-2 follow-up fixes

1. archive-change.ts predicate re-run before the post-hook validity guard: HOLDS.
   - Code: archive-change.ts:465-505. Order is reconcile, state/recovery guard, re-run predicates, throw CheckPredicateFailedError for failures, then `postHookValidityBlocksArchive` throws InvalidStateTransitionError(change.state, 'archiving').
   - Spec (archive-change "Canonical validity reconciliation ..." paragraph) matches the code.
   - Tested: archive-change.spec.ts:3955 (stale verification after hooks gives CheckPredicateFailedError for verification.current with action start-verification, no mutate, no snapshot). archive-change.spec.ts:4062 covers the specApproval 'absent' branch of the guard (InvalidStateTransitionError, no archive).
   - `_materializeImplementationLinks` takes skippable from the resolved binding (archive-change.ts:1346-1347, 1361, 1376): HOLDS in code and matches the spec. NOT TESTED, see finding L1.
2. invalidate-change.ts single reconciler.mutate with the guard inside: HOLDS.
   - invalidate-change.ts:176-188. Guard reads ctx.change after the reconciler pre-pass. A throw inside `changes.mutate` persists nothing (fs change-repository.ts:386-404 persists only after `fn` resolves), so "no mutation without force" holds even though the pre-pass runs.
   - Policy values validated by isArtifactInvalidationPolicy / isWorkflowInvalidationPolicy (invalidate-change.ts:284-290) before any mutation. Tested in invalidate-change-policy-audit.spec.ts:287-342.
   - Fingerprint-stale consent needs no force: tested (invalidate-change.spec.ts:424). Already-stale history: tested (:447).
3. check-bindings.ts hooks declare `skippable: false` explicitly (transition hook.post/hook.pre, archive hook.pre/hook.post): HOLDS in code, matches transition-checks "Category A". Test gap, see finding L2.
4. transition-change.ts JSDoc: PARTIALLY WRONG, see finding L3.
5. change-validity.ts selectAutomaticRecovery excludes `ready` for spec consent: code and unit tests are consistent (select-automatic-recovery.spec.ts:15-17, approve-audit-2.spec.ts:210). BUT the specs still say the opposite. See finding M1 (the main remaining discrepancy).

## Findings

### M1 (MEDIUM, spec wrong / stale vs code): `ready` no longer recovers to `designing` on stale or revoked spec consent, and four specs still require it

Code: packages/core/src/domain/services/change-validity.ts:193-197 (`state !== 'ready'`). Behavior is deliberate (consent at `ready` could never be renewed otherwise) and tested, but not reflected in spec text. Spec statements now false:

- core:transition-change, Requirement "Spec approval is a check not a pending hop": "Reconciliation runs first, so stale required consent has already committed the return to `designing`". Scenario "Stale approval returns to design instead of parking": GIVEN required spec approval is stale at `ready`, WHEN forward transition is requested, THEN reconciliation commits `designing` recovery. Real behavior: change stays in `ready`, `approval.spec` fails with APPROVAL_STALE and action approve-spec. No test covers this scenario as written, and no test covers the new behavior at the TransitionChange level.
- core:transition-checks, "Check-declared host-neutral actions" (spec line about `approval.spec` action): "Stale or revoked consent has already returned the change to `designing`". Also "Shared validity verdict and recovery priority" item 1: "required stale or revoked spec approval returns immediately to `designing`" has no `ready` exception.
- core:invalidate-change, "Canonical gate-safe invalidation and recovery": "A forced spec-approval revocation returns the change to `designing`". From `ready`, forced revocation stays in `ready` (forceRecoveries target falls back to change.state, invalidate-change.ts:410). The InvalidateRequiresForceError `recoveries[].target` is therefore `ready`, not `designing`.
- Out of this batch but same root: core:change and core:get-status ("Required stale spec consent has recovery priority and yields committed `designing` guidance") and core:lifecycle-engine likely need the same carve-out. core:config line 523 already says the check fails with APPROVAL_REQUIRED while consent is "missing or stale" at `ready`, which agrees with the code.
  Recommendation: amend the specs (not the code) to carve out `ready`: stale/revoked spec consent in `ready` is reported by `approval.spec` and renewed in place with ApproveSpec; recovery to `designing` applies from later states. Add a TransitionChange-level test for stale consent at `ready`.

### L1 (LOW, untested scenario): archive materialization failure path

`_materializeImplementationLinks` throws CheckPredicateFailedError (impl.linksInScope, IMPLEMENTATION_STATE, from/to, skippable from binding) for unknown workspace (archive-change.ts:1354) and out-of-codeRoot (:1369). No test exercises either throw or the binding-derived `skippable` (archive-change.spec.ts:3608 and :4103 hit the predicate path, not materialization). Spec "File outside target workspace codeRoot fails archive" is covered only indirectly.
Related behavior note (INFO): these throws ignore `skipChecks: ['impl.linksInScope']` and are thrown with `skippable: true` when the binding is skippable, so a host may offer a bypass that cannot work for the out-of-codeRoot case. Spec says only that `skippable` comes from the binding, so this is spec-compliant, but worth deciding explicitly.

### L2 (LOW, test gap): hook bindings' explicit `skippable: false` not asserted

check-bindings.spec.ts:14-31 filters hook rows out with `!b.phase`, so the new explicit `skippable: false` on hook.pre/hook.post (transition and archive) is not asserted. A test that every spec in both tables declares `skippable` as a boolean would lock the fix.

### L3 (LOW, JSDoc wrong): transition-change.ts:197

`@throws {InvalidStateTransitionError} If the requested edge is not a legal protocol edge or ...`. An illegal edge fails `protocol.edge` and is thrown as CheckPredicateFailedError (spec "Shared runner errors propagate on transition": `protocol.edge` failure MUST NOT produce InvalidStateTransitionError). The only InvalidStateTransitionError sites are the committed-movement-without-recovery cases (transition-change.ts:237, 389). Fix: drop the "not a legal protocol edge" clause. The spec scenario "Invalid transition is rejected by entity" (entity-level throw) is unreachable via the use case, and is only the entity safety net.

### L4 (LOW, JSDoc incomplete): archive-change.ts:342-348

@throws omits ReconciledOperationBlockedError (thrown at :370 and :473 for committed recovery) and InvalidStateTransitionError for a blocked post-hook verdict. Item 1 listed "not in archivable or archiving" only.

### L5 (LOW, untested branches): postHookValidityBlocksArchive

Tests cover verification-stale (via predicate) and specApproval 'absent' (archive-change.spec.ts:4062). Untested: `artifactReviewRequired` (the spec's own example of "blocked validity that no failing predicate explains"), `signoff` not valid, and `specApproval`/`signoff` stale/revoked. Add at least the artifact-review case since the spec names it.

### L6 (LOW, ordering observation): pre-archive hooks run before an already-blocking verdict is detected

archive-change.ts:405-463. After the first reconcile, `artifactReviewRequired` (under policy `preserve`, state stays `archivable`) is not checked by any predicate, so user `run:` pre-hooks execute and only the post-hook guard (:503) rejects. Spec only mandates the post-hook re-check, so this is compliant, but side-effecting hooks can run for an archive that was already known to be blocked. Optional improvement: apply the same blocked-verdict check before hooks.

### I1 (INFO): fake recovery in next-action test

invalidate-change-next-action.spec.ts:198 uses a stubbed `recovery: { cause: 'spec-approval', from: 'ready', to: 'designing' }`, a transition the real reconciler can no longer produce after M1. Harmless, but use `implementing` or `verifying` as `from` to stay realistic.

### I2 (INFO): "no mutation without force" not asserted directly

invalidate-change.spec.ts:353-379 asserts InvalidateRequiresForceError twice but never that the stored change is unchanged (no events, same status) after the rejection. Behavior is correct by repository semantics; a state assertion would pin the spec scenario "Force is required only for current consent ... no mutation occurs".

### I3 (INFO): accepted items not re-reported

Missing-reconciler TypeError in InvalidateChange/ApproveSpec and ApproveSpec/InvalidateChange draft `ifModifiedSince` dead code: out of scope per instruction.

## Per-spec status

- core:transition-checks: no code defect found. Spec text wrong for M1 (recovery priority item 1, approval.spec action paragraph). Skippable table, Category A/B/C governance, archive exception, parking-source bindings, verification.current rows all match check-bindings.ts. L2 test gap.
- core:transition-change: code matches spec except M1 (requirement text and scenario "Stale approval returns to design instead of parking"). L3 JSDoc. Committed-recovery reporting (nextAction from evaluateLifecycle over evaluateLegalTargets, reason overridden), skip validation against resolved bindings, post-hook reconcile + rerun candidate, `skippable` from resolved bindings: all verified.
- core:invalidate-change: guard, policy validation, force semantics, nextAction projection verified. M1 (forced spec revocation at `ready`). I2.
- core:approve-spec: eligible states from boundFromStates('approval.spec'), no transition, recovery persisted on ineligible, InvalidStateTransitionError(from reconciled state, to 'ready') with incomplete-artifact reason: verified and tested. No new discrepancy beyond M1 (its Purpose and "renewed only in ready" text is consistent with the exemption).
- core:approve-signoff: verified (eligible states from bindings, verification error taxonomy, VerificationStaleError host-neutral with changeName, disabled-verifying path, whole-file implementation fingerprint). No discrepancy.
- core:archive-change: fix (1) verified; typed errors, skip validation, governance, Overlap guard, deferred archiving transition verified. L1, L4, L5, L6.

## Counts

HIGH 0, MEDIUM 1 (M1), LOW 6 (L1-L6), INFO 3 (I1-I3). All six round-2-follow-up fixes verified in code; fix 5 conflicts with spec text (M1); fix 4 incomplete (L3).
