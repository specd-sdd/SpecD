# Batch A partial audit (round 7, verification-attempt-9)

Scope note: this pass focused on the three round-6 items and the recovery topology. For core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec and core:approve-signoff I only re-read the spec previews and spot-checked approve-spec; no new discrepancies were found, but this is NOT a full requirement-by-requirement re-audit of those six specs.

## Test run

`packages/core` full vitest: 4039 tests, 4037 passed, 0 failed, 2 todo (1270 suites, 0 failed suites). CLI tests were not run in this batch.

## Round-6 item 1: Policy-aware invalidation / recovery topology (core:change, core:lifecycle-engine)

Requirements Summary: every state later than a recovery target is a valid recovery source, including legacy parking states. Stale or revoked sign-off returns pending-signoff/signed-off/archivable/archiving to `done`. Stale or revoked spec approval returns pending-spec-approval/spec-approved (and later) to `designing`. `ready` is exempt from spec recovery only. A recovery must not fail on a parking source.

Implementation Status: COMPLIANT.

- `RECOVERY_ONLY_TRANSITIONS` (change-state.ts:58-88): signoff = {pending-signoff, signed-off, archivable, archiving} -> done. spec-approval = 9 states (pending-spec-approval ... archiving) -> designing. workflow-redesign = 10 states (ready ... archiving) -> designing. `Change.recover()` (change.ts:959-968) looks up this table and throws only if `from` or `to` mismatches.
- Independent derivation from `selectAutomaticRecovery` (change-validity.ts:186-205) over the 12-state `ChangeState` union:
  - spec-approval fires when state is after `designing` and not `ready`: pending-spec-approval, spec-approved, implementing, verifying, done, pending-signoff, signed-off, archivable, archiving. That is 9 states, and the table has exactly those 9.
  - signoff fires when state is after `done` in DELIVERY_AXIS: pending-signoff, signed-off, archivable, archiving. That is 4 states, and the table has exactly those 4.
  - workflow-redesign fires when the policy is redesign, review is required and state is after `designing`: ready plus the 9 above, which is 10 states. The table has exactly those 10.
  - Every (cause x state) combination reachable by the selector has a table entry. There are no gaps and no extra entries.
  - DELIVERY_AXIS contains all 12 states, so `indexOf` never returns -1.
- Spec scenarios 'Stale sign-off in pending-signoff recovers to done' and 'Stale approval in pending-spec-approval recovers to designing' match the tests. These are reconcile-change-validity.spec.ts:327 and :341, and both use the real reconciler. The sign-off test asserts `automaticReturn` {signoff, pending-signoff, done} and state `done`. The spec-approval test exists at :341; I confirmed its setup but did not read its tail assertions.

Test coverage:

- change-validity.spec.ts 'recovery topology coverage' (:356-405) is an exhaustive 12 states x 5 selections table, asserting `RECOVERY_ONLY_TRANSITIONS[cause][state] === recovery.to`.
- select-automatic-recovery.spec.ts covers the `ready` exemption and the priority rules.
- change-state.spec.ts has the RECOVERY_ONLY_TRANSITIONS.signoff toEqual check.
- reconcile-change-validity.spec.ts covers signed-off/archivable/archiving -> done as an it.each, plus the pending-signoff and pending-spec-approval cases.

Discrepancies / observations:

- LOW (spec wording): core:change says "every state later than a recovery's target is a valid recovery source". For the spec-approval cause, `ready` is later than `designing` but is deliberately not a source. The exemption paragraph two paragraphs above covers this, but the sentence is not qualified. The code matches the exemption. Suggest "except `ready` for spec-approval".
- LOW (test gap): the exhaustive table test is derived from the same selector, so it proves table completeness but not the exemption. The exemption is covered separately in select-automatic-recovery.spec.ts. This is acceptable.
- INFO: the reconciler-level tests do not cover spec-approval recovery from spec-approved, verifying, done, pending-signoff, signed-off, archivable or archiving. The table test covers these at the pure level.

## Round-6 item 2: shared helper collectChangeReviewTargets

Implementation Status: COMPLIANT.

- It is defined in domain/services/change-validity.ts:219-253. The semantics are: skip task artifacts and `skipped` files; drift is `hasDrift` or a hash mismatch against `validatedHash`; `pending-review` files that are not drifted become `direct` pending targets.
- It is used by reconcile-change-validity.ts:229 and by invalidate-change.ts:423 (`previewArtifactReviewRequired`). There is no remaining duplicate collection logic in either use case.
- Unit tests (change-validity.spec.ts:407-488) cover four cases: hash-only drift, pending-review as direct, task artifacts and skipped files ignored, and clean files or a null fingerprint.

Observations:

- INFO: a drifted `pending-review` file is reported only as drifted. The helper uses `continue`, so it is not double-counted. This is not asserted by a test. Suggest adding a test.
- INFO: invalidate preview returns true when any non-task request target exists, even under artifact policy `none`. This matches the "none still requires review" spec.

## Round-6 item 3: lifecycle-guidance.ts returns 'design' directly when artifactReviewRequired

Implementation Status: matches core:lifecycle-engine, but conflicts with core:get-status wording.

- Code is at `resolvePhaseIntent` in lifecycle-guidance.ts. When `validity.artifactReviewRequired === true && validity.recovery === null`, it returns 'design'. At HEAD this branch returned `phaseCommand(...)`, i.e. the current phase's command.
- Compliant: core:lifecycle-engine says guidance MAY read `artifactReviewRequired` to choose `'design'` for required review. The code contains no check ids, CLI strings or parking-state names, and the no-hardcoded-strings test passes.

Discrepancies:

- MEDIUM (spec inconsistency, code vs get-status): core:get-status says "The route is the current lifecycle skill under `workflow: preserve`" and the scenarios 'Preserve routes artifact review through the active skill' and 'Non-task pending review routes by policy and gate priority' say "workflow `preserve` retains the current-phase review route". The new code returns intent 'design' for any required artifact review with no recovery, including `implementing` under `preserve`. If `review.route` and `nextAction.intent` are meant to differ, the get-status text should say so. If they are not, the code and the get-status text disagree. The lifecycle-engine scenario 'Pending review under preserve stays out of forward progress' only requires that `targetStep` is not forward, so it is compatible with both readings. Resolve by aligning the get-status wording (preferred, since lifecycle-engine already names 'design') or by restoring the phase route.
- MEDIUM (precedence ambiguity): `resolvePhaseIntent` checks the 'verify' branch before the artifactReviewRequired->'design' branch. A change at or after the verification boundary with stale/absent verification, no recovery and non-task drift therefore yields 'verify' rather than 'design'. The lifecycle-engine text lists both but gives no precedence. Drift normally also stales verification, so this case is realistic: a user is told to verify while artifacts still need review. Either document the precedence in the spec or check review first. I found no test pinning either behavior.
- LOW (missing test): lifecycle-guidance.spec.ts has no direct test for artifactReviewRequired -> 'design' (with recovery null) or for the verify-vs-design precedence. Indirect coverage exists in get-status.spec.ts:1392 (overlap review -> 'design') and :1608 (recovery -> 'design'), which exercises the review.required and recovery paths but not the artifactReviewRequired branch itself. Suggest a resolveLifecycleIntent unit test with a synthetic verdict.

## Per-spec summary (batch)

- core:change: policy-aware invalidation and recovery compliant. Two LOW wording/test notes above.
- core:lifecycle-engine: compliant on guidance; precedence ambiguity noted (MEDIUM).
- core:get-status: MEDIUM wording conflict on the preserve route versus intent 'design'.
- core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec, core:approve-signoff: no regressions detected from round 4-7 changes in core tests (all pass). Approve-spec spec says eligible states come from `boundFromStates('approval.spec')` and consent never transitions; the use case header documents the same. Not independently re-audited requirement by requirement in this pass.

## Counts

HIGH 0, MEDIUM 2, LOW 3, INFO 3.
Core tests: 4037 passed / 0 failed / 2 todo of 4039.
