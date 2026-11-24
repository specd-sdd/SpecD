# Batch D (round 11) - independent bug hunt (final)

## CONFIRMED

### D1 MEDIUM - forceRecoveries preview disagrees with reconciler when a consent gate is disabled but a valid projection exists

- invalidate-change.ts:395-400 (consentToRevoke) + 441-456 (forceRecoveries) vs reconcile-change-validity.ts:539-548 (fieldAfter returns 'not-required' when the gate is off => no recovery) and approvalField (change-validity.ts).
- consentToRevoke keys off `change.specApproval?.status === 'valid'` regardless of `approvals.spec`; forceRecoveries then passes 'revoked' to selectAutomaticRecovery, predicting `designing`. The reconciler, with the gate configured off, still persists the revocation (pushRevocation) but computes specApproval = 'not-required' so NO recovery is committed.
- Reproduced with scratch matrix (480 combos: state {designing,ready,implementing,verifying,done} x valid {spec,signoff} x gates on/off x artifacts {none,surgical,downstream,global} x workflow {preserve,redesign}; preview from non-forced run's InvalidateRequiresForceError.recoveries vs state after forced run): 48 mismatches, ALL with approvals.spec=false and a valid specApproval, states implementing/verifying/done, all policies. Example: state=implementing, approvals {spec:false,signoff:\*}, preview=[{spec->designing}] actual state stays implementing, spec revoked. Zero mismatches with the gate on. Signoff-gate-off analogue is by code symmetry (signoff recovery only fires after 'done'; pending-signoff/signed-off not reachable via plain transition in my harness: "Cannot transition from 'done' to 'pending-signoff'") => suspected, not reproduced.
- Side effect: with the gate off, a valid-but-unrequired consent still forces `--force`, and the message tells the user the change will return to designing when it will not.
- Fix: in consentToRevoke / forceRecoveries pass 'not-required' for gates whose configured approval is off (this.\_approvals), or filter gates by this.\_approvals.

### D2 LOW - `change edit` text output drops `nextAction.guidance` that JSON/toon carries

- packages/cli/src/commands/change/edit.ts:240-262 (appendEditGuidance prints only target/command/reason; its param type has no guidance) vs JSON path (edit.ts ~188-200 spreads projectCliNextAction incl. `guidance`) and sibling commands status.ts:445, invalidate.ts:215, verification.ts:281 which all print `guidance:` when command is null. text vs json divergence; when command=null the text shows `command: (none)` with no hint.

### D3 LOW - public API: exported ChangeValidityVerdict / InvalidateChangeResult reference unexported types

- core/src/domain/services/index.ts:105-108 and sdk/src/core-reexports.ts:719 export only AutomaticRecovery and ChangeValidityVerdict. ChangeValidityVerdict's members use ProjectionChange, ValidityBlocker, ArtifactReviewTarget, FingerprintInputFailure, ProjectionStatus; InvalidateChangeResult (exported, sdk-reexported) exposes ProjectionChange[] and ValidityBlocker[]. None of those five names is exported from @specd/core or @specd/sdk (grep of all index.ts: 0 hits; ForceInvalidationRecovery, InvalidateChangeResult, AffectedArtifactFile are exported). Consumers get structurally-typed values they cannot name (the CLI works around it with its own PublicProjectionChange in \_validity-present.ts:22). Not a compile break.

## SUSPECTED (read-traced, not reproduced)

### S1 LOW-MEDIUM - \_mergeBlockers ORs skippability across targets by check id

- get-status.ts:1034-1049. transitionSkippable is keyed only by check.id and OR-ed over every failing candidate of every target; a blocker for target B (locked) reports isSkippable=true if the same check id fails on target A with skippable=true (e.g. schema-composed bindings that differ per target). Result: a bypassFlag (--skip-checks <id>) offered for a transition where validateSkipChecks will reject it with CheckNotSkippableError. Needs a schema with per-target skippable divergence for the same check id; the shipped TRANSITION_BINDINGS only mark implementing-related checks skippable, so not hit with std schema. Archive/transition separation (the claimed fix) is correct; only intra-transition is merged. Key should be target+id.
- Also dedupe key at get-status.ts:1093/1107 is code:message; two checks with the same code+message collapse to one blocker (first wins, label/checkId of the other lost). Theoretical.

### S2 LOW - transition skipChecks validated after reconcile mutation

- transition-change.ts:~207 reconcile.execute (may persist projections / refresh implementation tracking) runs before validateSkipChecks (~265). A bogus/unskippable --skip-checks id therefore still lets the pre-reconcile persist; and if the reconcile commits a recovery the user gets ReconciledOperationBlockedError and the bad id is never reported. Effective bindings are state-dependent so the skippable check must follow, but the unknown-id (UnknownCheckError) half could be validated first. Matches the "flags validated before mutation" concern; effect is benign (reconcile is idempotent, would have run on any attempt).

### S3 LOW - status text hides OVERLAP_CONFLICT when review.reason==='spec-overlap-conflict', JSON does not

- packages/cli/src/commands/change/status.ts:~401-406 filters the blocker for text only; json/toon (status.ts ~598 blockers.map(projectCliBlocker)) keeps it. Intended for the invalidation-review case, but a live archive-predicate OVERLAP_CONFLICT coexisting with that review reason would be invisible in text. I could not construct a state where both exist (archive predicates only run at state archivable; invalidation by overlap returns the change earlier), hence suspected.

### S4 LOW - transition.ts repair path can mask the original error

- transition.ts ~545: status.execute() inside the catch for repair-guide errors is not guarded; if it throws, the outer handleError reports that error instead of the CheckPredicateFailedError (original swallowed).

### S5 LOW - signoff-gate-off analogue of D1 (see D1) not reproduced (pending-signoff unreachable in harness).

### S6 LOW (perf/robustness) archive-change.ts

- \_materializeImplementationLinks (1401-1469) calls this.\_listWorkspaces.excludePathsFor(workspace) per link inside the loop; hoist per workspace. guardDetails (1490-1515) does peer.changeName on array items without null-guard (throws TypeError from a logging helper at archive-change.ts:431-439 if a custom spec.overlap check ever emits null peers; details come from domain check so not reachable today).

## CHECKED, NOTHING FOUND

- archive-change.ts debug logging: payloads are change/spec names, check ids, counts, error messages; no config/secret/env, no content bodies, no large objects (specIds list and skip set only). Only per-iteration logs are per-binding hooks (<=3) and per-spec "selected tracked artifact file" (bounded by specs x artifacts, cheap). specIdOfError is null/primitive safe. Duplicate preflight-failed log in two catch blocks is intentional (different step).
- postHookValidityBlocksArchive (1577-1583): consistent with reconciler fields; the only skippable archive checks are spec.overlap and impl.linksInScope, neither validity-related, so skipChecks cannot bypass it. 'attempt-active' verification correctly blocks.
- \_nextActionAfterArchiveOverlap: OVERLAP_CONFLICT only emerges from archive-scope binding (check-bindings.ts spec.overlap applicability archive-only) and archiveChecks run only at state 'archivable', so it cannot rewrite nextAction in a non-archivable state; requires every blocker to be overlap.
- \_mergeBlockers families: drafted path never reaches it (draft result sets blockers directly); verification family yielding and droppedActions adoption traced and consistent with get-status-families tests.
- transition-change.ts early returns: designing->designing no-op happens after skipChecks validation (intended); reconcile state-change early exits throw ReconciledOperationBlockedError/InvalidStateTransitionError correctly; 'next' resolved after reconcile. Accepted window (a) not re-reported.
- CLI: edit/transition/status/approve/archive/invalidate/verification exit via CliExitError(1); JSON failure records carry state/blockers; projectCliBlocker drops raw isSkippable (bypassFlag only) everywhere I read; raw core fields leaking: only intent/action are passed through intentionally (documented in help schema).

## INVALIDATE PREVIEW MATRIX (item 3)

Scratch: /private/tmp/claude-501/-Users-monki-Documents-Proyectos-specd-worktrees-feat-lifecycle-transitions-ux/d6514280-9950-4b20-a585-df403cd3147e/scratchpad/r11/matrix.spec.ts (+vitest.config.ts, matrix-out.txt). 480 runs, 0 harness errors, 48 mismatches, all D1 (spec gate off + valid specApproval). Gate-on rows for all 4 artifact policies x 2 workflow policies x states designing..done: preview target == committed state in every case. Not covered: pending-signoff / signed-off states (not reachable by plain transition in harness) and verification/drift-combined fixtures.

## TEST QUALITY (10 sampled)

1. families: 'revoked sign-off one blocker with approve-signoff action' - kills family-drop removal; mutation 'always keep both' fails (length 1). Strong.
2. families: verification loop (3 codes) toHaveLength(1)+checkId - kills dropping the yield. Strong.
3. families: 'keeps approval.signoff verification failure when verification.current does not fail' - kills making yieldsToVerification unconditional. Strong.
4. families: 'keeps stale spec consent and failing sign-off as two' - asserts only count + checkId presence, not codes/messages; mutation that swaps SIGNOFF\_\* into spec-consent family would still give 2 only if... survives for code mislabel. Medium.
5. families: skippability from transition binding (line 264-312) - asserts matches.length>0 and every isSkippable===false; mutation 'always false' survives unless another test has the true case (get-status-audit covers true). Medium-weak locally.
6. reconcile-recovery: stale spec at ready no recovery - kills removal of the exemption. Strong.
7. reconcile-recovery: revoked spec at ready - mutation isBrokenConsent('revoked')=>false SURVIVES (ready exemption masks it); only invalidate audit kills it. Weak in isolation.
8. reconcile-recovery: one recovery per reconciliation (archivable->done->designing) - kills multi-recovery loop and priority swaps. Strong.
9. invalidate-policy-audit: 'previews one combined recovery' - both gates on, designing: mutation that drops the gates filter or hardcodes target 'designing' survives (no signoff-only / gate-off row). This is exactly the hole D1 lives in. Weak.
10. invalidate-policy-audit: idempotent repeat (spec-approval returns, history count) - kills duplicate recovery/persist. Strong. (The invalid-policy tests carry a stale comment "Real src gap (not fixed here)" although validateCommandShape now rejects; comment is misleading, tests are fine.)

## SUITE COUNTS

- core: 4091 tests, 4089 passed, 0 failed (2 skipped/todo), 1288 suites, success=true.
- cli: 1760 tests, 1760 passed, 0 failed, 455 suites, success=true.
  (json reporter outputs: scratchpad/r11/core.json, cli.json)

## PRIORITIZED

1. D1 MEDIUM confirmed (invalidate preview vs reconciler with gate off).
2. S1 LOW-MEDIUM suspected (per-target skippability OR).
3. D2 LOW confirmed (edit text drops guidance).
4. D3 LOW confirmed (unexported member types of exported verdict).
5. S2-S6 LOW suspected.
   No HIGH defects found.
