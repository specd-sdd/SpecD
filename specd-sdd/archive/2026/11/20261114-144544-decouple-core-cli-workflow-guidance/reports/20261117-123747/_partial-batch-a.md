# Round 4 audit, batch A (core:lifecycle-engine, workflow-topology, workflow-model, get-status, change)

Counts: HIGH 0, MEDIUM 2, LOW 5, INFO 3.
Targeted core test run (domain, get-status\*, reconcile-change-validity, approve-audit-2, transition-change-ready-audit): 1155 pass, 0 fail.

## Round-3 items

(a) FIXED. Spec wording carves out `ready` consistently:

- core:get-status "Returns lifecycle context", "Approval, verification, and fingerprint status projection" and scenario "Stale spec consent in ready stays in ready".
- core:lifecycle-engine "Next hop derives from candidate evaluation" and scenario "Stale spec approval in ready resolves through the check".
- core:change "Spec-consent recovery is requested only from states after ready" and scenarios "Stale consent stays in ready until it is renewed" / "Stale consent after ready still returns to designing".
- Code: `selectAutomaticRecovery` (packages/core/src/domain/services/change-validity.ts:195) requires `isAfter(state,'designing') && state !== 'ready'`. Unit tests in test/domain/services/select-automatic-recovery.spec.ts (including redesign policy still acting in ready) and approve-audit-2.spec.ts:183/210 (renewal in ready, no recovery, idempotent reconcile) pass.

(b) FIXED for the three named docs. docs/core/domain-model.md:205, docs/core/use-cases.md:469, docs/guide/workflow.md:109 and :358 all state the carve-out. BUT see M1: other docs/specs still carry the old wording.

## Findings

### MEDIUM

M1. Residual docs still say spec-consent recovery fires "when the state is later than designing" (no ready carve-out). Docs wrong (code is right):

- docs/guide/configuration.md:813 ("Required stale spec approval still returns the change to `designing` when the state is later than `designing`").
- docs/adr/0028-materialized-validity-reconciliation.md:46 (same sentence; ADR may be intentionally historical, then add a superseding note instead of editing).
  M2. Published specs outside this batch contradict the carve-out (spec wrong vs code, or needs a delta in this change):
- specs/core/edit-change/spec.md:93: "A required spec approval made stale by scope change SHALL cause an immediate return to `designing` even when preserve". From `ready` the code never returns to designing.
- specs/cli/change-edit/spec.md:39 ("it SHALL report `designing` even when the workflow policy is preserve"), same issue.
- specs/core/transition-checks/spec.md:210 ("required stale or revoked spec approval returns immediately to `designing`") lacks "after ready".
- specs/cli/change-status/spec.md:73 and specs/cli/change-transition/spec.md:42 ("routes through designing and ready") are only imprecise (no ready case).
  These are not in batch A, but they are the same round-3 wording class; confirm whether other batches or deltas cover them.

### LOW

L1. core:change verify scenario "Current consent is required only when enabled" (verify.md; spec text line "THEN progress is blocked and recovery returns through design and renewed ready approval") still implies recovery through design when the stale approval is observed in `ready`. Reword to "consent is renewed in ready (after design when the change was in a later state)".
L2. Drain-state lists duplicated outside core:workflow-topology, contrary to "drain-state accessors exist so consumers never keep their own lists" (spec Module requirement):

- packages/core/src/domain/services/build-schema.ts:810 own `DRAIN_STATES` set (could use `isDrainState`).
- packages/core/src/domain/services/transition-checks.ts:196 `deliveryState()` maps drain states to anchors implementing/archivable (topology's `drainAnchorOf` says ready/done +offset), a second, different anchor table used by `classifyAlong`.
- packages/core/src/domain/value-objects/change-state.ts HAPPY_PATH_NEXT lists drain states (it is a domain constant, arguably fine).
  Behavior is currently correct; this is drift risk only.
  L3. spec/code naming: core:workflow-model "Step check declarations" calls the orchestrator bypass input `skippedCheckIds`; that name exists only on `LifecycleVerdictInput` (lifecycle-verdict.ts:66). `TransitionChange`/`ArchiveChange` inputs are `skipChecks` (transition-change.ts:295). Spec should say "the orchestrator's bypass input (`skipChecks` for use cases, `skippedCheckIds` for the verdict)". Same in the core:transition-checks delta line 164.
  L4. packages/core/test/application/use-cases/transition-change-audit.spec.ts:197 uses a stubbed recovery `{cause:'spec-approval', from:'ready', to:'designing'}` which the real reconciler can no longer produce (selectAutomaticRecovery excludes ready). Fixture is misleading; use `implementing` as the source.
  L5. `approval.spec` check (packages/core/src/domain/checks/approval-spec.ts) returns `APPROVAL_STALE` with message "Spec approval is stale" for both stale and revoked; ValidityBlocker has `APPROVAL_REVOKED` and `pushConsentBlocker` may emit it, so status can show two different codes/messages for a revoked consent. Spec scenario allows "APPROVAL_REQUIRED or APPROVAL_STALE" so it is compliant, but revoked is not distinguished.

### INFO

I1. RECOVERY_ONLY_TRANSITIONS (change-state.ts:58-82) still lists `ready: 'designing'` for causes `spec-approval` and `workflow-redesign`. `spec-approval` from ready is now unreachable (harmless; `workflow-redesign` from ready is still valid). Could drop the spec-approval/ready entry for clarity.
I2. workflow-topology: all requirements and scenarios verified against packages/core/src/domain/services/workflow-topology.ts (canonical order, bedrock throws, ready/approvals throw, drain exits from table only, nextWorkflowStep drain rule, no exported internals). No discrepancy.
I3. core:workflow-model delta (requires/taskCompletion as checks, skippable wording, hook wording, spec dependency list) matches code (createWorkflowTaskCompletion, skipHookPhases, WorkflowStepCheckDeclaration with skippable).

## Untested or weakly tested scenarios

- core:get-status "Stale spec consent in ready stays in ready": no GetStatus-level test with a stale approval in `ready` asserting `blockers` carry approve-spec action AND `nextAction.action` = approve-spec with `intent` null. Partial coverage only: lifecycle-verdict.spec.ts:1235 (evaluateLifecycle with stubbed check result), approve-audit-2.spec.ts:210 (reconcile, no recovery), transition-change-ready-audit.spec.ts. get-status.spec.ts:1590 stubs reconciler with a stale verdict for a recovery from `implementing` only. Severity LOW.
- core:workflow-topology "Disabled verifying never requires verification evidence end to end": covered by get-status.spec.ts:1665 and archive-change.spec.ts:366 (real reconciler); not located as one combined implementing->done->archivable->archive flow. INFO.

## Verified without discrepancy

- lifecycle-guidance.ts contains none of the forbidden references (approval.spec/signoff, verification.current, boundFromStates, activeSpecApproval/Signoff, validity.specApproval/signoff, pending-\* names, nextHop.reason). Intent null cases (a)(b)(c) match code (lifecycle-guidance.ts intentForStateAndHop). Hop-failure selection matches spec (lifecycle-evaluation.ts selectHopFailures; drain positions via pipelinePosition).
- resolveLifecycleNextHop: ready with blocked forward candidate -> targetStep ready, mechanical, reason without approval wording; drain rule generic; archiving restore guidance.
- core:change VALID_TRANSITIONS table matches spec (forward exit first; no edges into drain states; designing re-entry).
- get-status schema-failure degradation, SCHEMA_IDENTITY_MISMATCH details, archive predicate execution only in `archivable`, overlap nextAction handling present.
