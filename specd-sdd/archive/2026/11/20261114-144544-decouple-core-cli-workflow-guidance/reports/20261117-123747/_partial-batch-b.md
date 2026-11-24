# Batch B audit (round 4) - transition-checks, transition-change, invalidate-change, approve-spec, approve-signoff, archive-change

Method: merged spec-preview read, implementation read (core use cases, check-bindings, reconciler), targeted test review; vitest on invalidate-change*, archive-change-links-audit, transition-change-ready-audit, approve*, check-bindings: 121 pass / 0 fail. Coverage was targeted (round-3 items plus high-risk requirements), not an exhaustive scenario-by-scenario sweep; scenario titles do not match test titles one-to-one so untested-scenario claims are limited to those named below.

## Round-3 items

(a) `ready` carve-out wording: FIXED. transition-change spec lines (spec-approval and reconciliation requirements), transition-checks "Shared validity verdict" + action requirement, invalidate-change force-recovery wording all state: stale/revoked consent after `ready` returns to `designing`; in `ready` no recovery and change stays in `ready`. Code agrees (`selectAutomaticRecovery` in domain/services/change-validity.ts:193-197 excludes `ready`). Tests: transition-change-ready-audit.spec.ts, approve-audit-2.spec.ts:210, invalidate-change-ready-audit.spec.ts.

(b) invalidate-change.ts: FIXED. `forceRecoveries(ctx.change, revoke, effectivePolicy, targets.length > 0)` (invalidate-change.ts:~164-170, 396-418) uses the effective policy; guard and `reconcileAfter` run inside one `_reconcile.mutate` (consent read from the post-pre-pass change). Tests: invalidate-change-ready-audit.spec.ts:213/228/243/267 (preserve stays in ready, redesign -> designing, effective-policy preview, no mutation without force).

(c) archive-change.ts `_materializeImplementationLinks`: FIXED. Omits out-of-codeRoot and unknown-workspace links when `skipChecks` includes `impl.linksInScope`; otherwise throws CheckPredicateFailedError (skippable from resolved binding, code IMPLEMENTATION_STATE, from/to of archive). @throws JSDoc present (archive-change.ts:1350). Tests in archive-change-links-audit.spec.ts:196-231 cover all four cases; post-hook guard tests at :234-300 cover artifactReviewRequired and signoff broken.

(d) transition-change.ts JSDoc: FIXED for execute (@throws list matches throw sites incl. HappyPathNextUnavailableError, ReconciledOperationBlockedError, hook/skip errors). See B-L2 for a residual constructor doc nit.

(e) check-bindings hook rows `skippable:false`: FIXED. check-bindings.spec.ts:19-26 and 37-44 assert `skippable === false` for `hook.pre`/`hook.post` in both transition and archive tables.

## New / remaining findings

B-M1 (MEDIUM, code vs spec ambiguity) archive-change.ts:1358-1392. If a schema disables `impl.linksInScope` via `archiveChecks` (explicitly permitted: archive-change spec "A schema MAY disable the check..."), the check is not evaluated, `skipChecks` cannot contain it (not bound), yet `_materializeImplementationLinks` still throws CheckPredicateFailedError for any out-of-codeRoot / unknown-workspace link with `skippable:false` (binding not found). Result: an archive that can neither pass nor be bypassed, contradicting "disabled = not evaluated". Fix: treat "binding absent (disabled)" like bypassed (omit links), or spec should state that materialization failure is unconditional. No test covers the disabled case.

B-L1 (LOW, code) invalidate-change.ts:164-170 `artifactReviewRequired` preview = `targets.length > 0`, but the reconciler's verdict (change-validity.ts:136) is `reviewTargets.length > 0` over drifted + pre-existing pending-review non-task artifacts. Edge: override workflow `redesign` (persisted `preserve`) with `artifacts: none` and an already `pending-review` non-task artifact, forced revocation of consent from a state after `designing`: preview says no move, reconciler commits `designing`. Very narrow; spec only requires "effective policy" so this is a residual divergence, not a spec violation per se.

B-L2 (LOW, doc) transition-change.ts:136-160 constructor JSDoc: `@param reconcile` says "When supplied ..." and has no @throws, but the reconciler is mandatory at runtime (throws InvalidCompositionFactoryArgumentsError, correct per spec). Signature keeps `reconcile?` optional. Update JSDoc (add @throws, drop "when supplied"); consider making it required in the type.

B-L3 (LOW, doc) approve-signoff.ts:84-90 @throws lacks `VerificationInProgressError` (thrown at :170 for an active attempt without completion; spec requires this distinct error). Code and spec agree; JSDoc incomplete.

B-L4 (LOW, spec internal contradiction) transition-change spec "Persistence" requirement lists "artifact validation clearing for `verifying -> implementing`" among mutations applied in the serialized mutation, while "Implementation-only retry from verifying" and Constraints say `verifying -> implementing` MUST NOT clear unchanged artifact validation. Code (transition-change.ts:418-428) does not clear: matches the latter. Spec wording in Persistence is stale; remove that clause.

B-L5 (LOW, test gap) archive post-hook guard `postHookValidityBlocksArchive` (archive-change.ts:1482): the `specApproval` branch and the `verification` non-valid branch are not directly tested (verification path is covered indirectly by the predicate re-run; artifactReviewRequired and signoff branches are tested).

B-I1 (INFO, spec vs code) archive-change spec states the use case "MUST call `change.assertArchivable()`"; code performs an inline state check (archive-change.ts:372) after reconciliation and throws the same InvalidStateTransitionError. Behavior equal; wording could say "validate".

B-I2 (INFO, spec vs code) transition-change spec "Transition delegation" says `change.transition(effectiveTarget, actor)`; code calls `change.transition(effectiveTarget, actor, schema, approvals)` (transition-change.ts:~424). Spec signature stale.

B-I3 (INFO) "Transition to designing from any state" spec says TransitionChange delegates review reopening to the reconciler inside the serialized transition; code relies on the pre-transition reconcile plus `change.transition`, with no extra reconciler call in the mutation. Consistent with "redesign does not revoke consent by itself"; no discrepancy found, noted because the spec wording implies an in-mutation reconciler hop.

## Checked and consistent (no finding)

- approve-spec / approve-signoff: gate guard order (disabled -> load -> schema -> actor), single reconciler.mutate, state eligibility from `boundFromStates`, no transition on any path, InvalidStateTransitionError `to` informational, verification error distinctness (NotFound / InProgress / Stale with host-neutral message and `changeName` / Mismatch), verifying-disabled bypass, legacy-unknown evidence -> stale. Tests present for each (approve-signoff.spec.ts, approve-consent-audit.spec.ts, approve-audit-2.spec.ts).
- transition-checks bindings: approval.spec from ready/pending-spec-approval/spec-approved; approval.signoff from done/pending-signoff/signed-off to archivable; verification.current rows (verifying, done, pending-signoff, signed-off) plus archive row; governance flags explicit; no CLI flags/commands embedded in core messages (grep over checks, errors, services, use cases clean).
- transition-change: input contract, reconcile-first, committed recovery -> ReconciledOperationBlockedError with nextAction, `next` resolution + HappyPathNextUnavailableError, skipChecks validated against resolved bindings, skippable from resolved bindings, post-hook reconcile + predicate re-run, persistence inside `changes.mutate`, skill-hop signoff invalidation sources (done/signed-off/archivable).
- invalidate-change: consent guard on post-pre-pass consent, force semantics, `ready` behavior.

Known/accepted, not re-reported: missing-reconciler TypeError in InvalidateChange/ApproveSpec; draft ifModifiedSince dead code.

Counts: HIGH 0, MEDIUM 1, LOW 5, INFO 3.
