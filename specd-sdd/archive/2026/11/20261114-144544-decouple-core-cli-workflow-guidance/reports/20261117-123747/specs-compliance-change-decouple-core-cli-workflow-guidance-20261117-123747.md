# Specs compliance — change decouple-core-cli-workflow-guidance (round 4)

Mode: delegated (attempt verification-attempt-6). Static audit after the round-3 remediation.

| Batch | Specs                                                                                                  | Result                          |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| A     | lifecycle-engine, workflow-topology, workflow-model, get-status, change                                | 0 high, 2 medium, 5 low, 3 info |
| B     | transition-checks, transition-change, invalidate-change, approve-spec, approve-signoff, archive-change | 0 high, 1 medium, 5 low, 3 info |
| C     | 6 cli:change-\* specs, error-handling-conventions, skill-templates-source                              | 0 high, 4 medium, 6 low, 4 info |

# Detailed findings

---

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

---

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

---

# Round 4 audit, batch C (cli:change-status/transition/invalidate/verification/archive/approve, error-handling-conventions, skill-templates-source)

Scope: read-only. Merged spec+verify read via `changes spec-preview`. Code compared against packages/cli/src, core/src, skills/templates and tests. CLI test run: `vitest run test/commands/change test/error-hints.spec.ts test/handle-error.spec.ts` = 646/646 pass. Core src grep for flags/commands/slash commands/input-name phrasing in non-comment code: clean. Project-wide specs (architecture, conventions, testing, docs, etc.): no contradictions found.

## Round-3 items

| Item                                                                  | Verdict                                     | Evidence                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| H1 ReconciledOperationBlockedError repair guide (transition, archive) | FIXED                                       | guidance-presenter.ts:364-418 (`projectReconciledOperationBlocked`, `reconciledRepairGuideLines`, `isReconciledOperationBlocked`); transition.ts:458-477; archive.ts:181-199; test reconciled-blocked.spec.ts (text + json for both). Text has committed state, blockers, `repair guide:` with state/return/target/command | guidance/reason, no `error:` line. JSON: state, automaticReturn, projected blockers, nextAction (intent/action/command/guidance). |
| H2 shared.md.tpl nextAction docs                                      | FIXED                                       | shared.md.tpl:144-160 lists all 7 fields and the command-null rule; asserted in packages/skills/test/template-lifecycle-consent.spec.ts:20-45.                                                                                                                                                                             |
| M1 transition --help actionType                                       | FIXED                                       | transition.ts:367-369; `dist` help output confirmed; test reconciled-blocked.spec.ts "help lists actionType".                                                                                                                                                                                                              |
| M2 status --help emitted fields                                       | FIXED (see M-C3 for descriptions)           | status.ts:151-204 lists validity, verification, invalidation, implementationTracking, approvalGates, lifecycle.checks/checksByTarget, displayStatus, hasDrift; test status.spec.ts:2247.                                                                                                                                   |
| M3 invalidate blocker projection + single force hint                  | FIXED                                       | invalidate.ts:225,247; cli-audit-round-2.spec.ts:136,149.                                                                                                                                                                                                                                                                  |
| M4 one bypass line per skippable blocker                              | PARTIAL                                     | Works in the non-CheckPredicateFailedError branch (transition.ts:222-226, tested). NOT done in the CheckPredicateFailedError branch, see M-C1.                                                                                                                                                                             |
| L1 deps.consistent hint non-skippable only                            | FIXED                                       | error-hints.ts:182-187 (`isSkippable !== true`); archive.ts:223-234; transition.ts:198-215; error-hints.spec.ts.                                                                                                                                                                                                           |
| L3 archive passes effective skipHooks                                 | FIXED                                       | archive.ts:135-139; test reconciled-blocked.spec.ts "archive skip hooks".                                                                                                                                                                                                                                                  |
| L4 approve error line first                                           | FIXED functionally (see M-C2 for line form) | approve.ts:156-169; approve-failure.spec.ts:133.                                                                                                                                                                                                                                                                           |
| L5 verification-invalidate blockers via projectCliBlocker             | FIXED                                       | verification.ts:253-271 (text), 294-303 (json); cli-audit-round-2.spec.ts:267.                                                                                                                                                                                                                                             |
| L6 approve enrichment tolerates read-only props                       | FIXED                                       | approve.ts:236-251 `Reflect.defineProperty`; approve-failure.spec.ts:166.                                                                                                                                                                                                                                                  |

## Findings

### MEDIUM

**M-C1 (code vs spec) transition CheckPredicateFailedError repair guide emits only the failed check's bypass, not one `bypass:` per skippable blocker.**
packages/cli/src/commands/change/transition.ts:150-158 lists every `status.blockers` entry (`! CODE ...`) and 198-205 prints a single `bypass:` for `cpErr.skippable`. The per-blocker loop (222-226) exists only in the `else` branch (non-CPFE errors). Spec cli:change-transition "Invalid transition error" (every skippable blocker listed in the repair guide MUST get its own `bypass:` line) and scenario "Every skippable blocker gets a bypass line" are violated when the error is a CPFE and fresh status carries additional skippable blockers (e.g. failed `impl.linksInScope` plus blocker `spec.overlap`). Test reconciled-blocked.spec.ts "prints one bypass line per skippable blocker" uses InvalidStateTransitionError, so the CPFE path is untested. Fix: also loop blockers in the CPFE branch (dedupe against `cpErr.checkId`).

**M-C2 (spec vs code, pick one) approve failure text blocker line form.**
Spec cli:change-approve: blockers MUST print as `! <CODE> — <label>: <message>` "in the same form as status". Code approve.ts:179-183 prints `blocker: <CODE> — <label>: <message>` (plus `  bypass:`); also `next action: <command>`, `guidance:`, `reason:` are flat, unindented. Tests (approve.spec.ts:279, approve-failure.spec.ts:155) pin `blocker: ...`. Either change code and tests to `! CODE — label: message`, or relax the spec wording. Ordering requirement (error first, then state, blockers, next action) is satisfied.

**M-C3 (spec vs code) status `--help` fields do not all carry descriptions.**
Spec cli:change-status "Output format" says the schema MUST describe each field it lists; verify scenario "Help schema lists every emitted field" ends with "every field it lists carries a description". status.ts:151-204 describes only some fields (validity, verification, invalidation, checks, approvalGates, displayStatus, hasDrift, etc.); name, state, specIds, schema, description, schemaWarnings, blockers, nextAction, specDependsOn, artifactDag, review, lifecycle sub-fields mostly have no description. Test status.spec.ts:2247 only checks field names, never descriptions. Either add descriptions (and an assertion) or narrow the spec to "newly listed fields".

**M-C4 (code gap) transition does not render the `CHECK_NOT_SKIPPABLE` hook hint.**
error-hints.ts:171-177 defines the rule `CHECK_NOT_SKIPPABLE` (hook._ checks) scoped to `change.transition` and `change.archive`. Archive reaches it through `handleError`. Transition catches `CheckNotSkippableError` as a repair-guide error (transition.ts:93-110), and `writeTextRepairGuide` (137-231) and the JSON `structuredHint` (488-500) only resolve `HAPPY_PATH_NEXT_UNAVAILABLE` / CPFE hints. So `change transition x ready --skip-checks hook.pre` prints no "use --skip-hooks" hint, and core no longer embeds it (error-handling-conventions: "every command that can surface that code ... matching CLI hint"). Test gap: transition.spec.ts:1709 only asserts the message for `protocol.edge`; no transition test for hook._ hint. Fix: resolve `resolveCliErrorHint(err.code, {command:'change.transition'}, {checkId})` for CheckNotSkippableError in both text and JSON.

### LOW

**L-C1 (code vs spec ambiguity) transition JSON/TOON failure record carries no error identity.**
transition.ts:501-518: record has blockers/nextAction/hint/state/validity from fresh status, but no `code`/`message`/failed `checkId`. For `UnknownCheckError`, `CheckNotSkippableError`, `InvalidStateTransitionError` or a CPFE whose blocker is absent from fresh status, machine consumers cannot tell why it failed (text prints the code at 180). Spec lists the field set without code/message, so this is a spec gap; consider adding `error: {code, message, checkId?}` to spec and code. Also for a skippable CPFE the JSON `hint` is absent (hint only for non-skippable or HappyPath); bypass is only visible via `blockers[].bypassFlag` when the blocker exists, whereas archive JSON (via handleError) does emit the bypass hint.

**L-C2 (code) reconciled text repair guide omits blocker `action`.**
Spec says text shows blockers projected through the CLI blocker projection (label, checkId, action, bypassFlag). guidance-presenter.ts:385-418 prints code/label/message, `check:`, `bypass:` only; blocker `action` command/guidance (as verification invalidate does at verification.ts:263-270) is dropped in text. JSON includes `action`. Also real ValidityBlocker (change-validity.ts:33-49) has no `label`/`checkId`/`isSkippable`, so in production the label/check/bypass lines never appear; tests inject them with `as never`. Not wrong, but the scenario with "skippable blocker" is not reachable from core today.

**L-C3 (code) `--skip-hooks` skip reason is coarse.**
\_check-progress-presenter.ts:69-72 reports `--skip-hooks` for both hook.pre and hook.post whenever any phase is skipped (`skipHooks = skipHookPhases.size > 0`, transition.ts:427, archive.ts:138). With `--skip-hooks pre`, a `hook.post` skip caused by "no hooks configured" would be labelled `--skip-hooks`. Spec only requires the user-skip reason; consider per-phase mapping.

**L-C4 (code) parseFormat after mutation.**
invalidate.ts:132 and approve.ts:56/110 call `parseFormat` after the mutating use case, so `--format xml` fails after the approval or invalidation was persisted. cli:change-verification requires format validation before mutation for its commands (which does it, verification.ts:97,114,132); approve/invalidate specs are silent, but the same hazard exists. Transition and archive validate early.

**L-C5 (code) verification mismatch guidance ordering.**
verification.ts:350-355 writes the guidance sentence to stderr before `cliError`'s `error:` line (the opposite of the approve L4 rule). No spec requirement; consistency only.

**L-C6 (code) invalidate success next action ignores overlap bypass suffix.**
invalidate.ts:146 `projectCliNextAction(rawNextAction)` does not pass blockers, unlike status/transition, so an `OVERLAP_CONFLICT` skippable blocker never appends "Use --skip-checks ... to archive anyway." Spec only requires it for status; INFO-level inconsistency.

### INFO

- reconciled-blocked.spec.ts archive skip-hooks test builds `CheckPredicateFailedError('x.y','X','boom','X_FAILED',...)`, swapping `checkCode` and `message` (signature: id, label, code, message). transition.spec.ts:1973 also passes `('spec.overlap','Checking spec overlap','OVERLAP_CONFLICT','Specs overlap',...)`, which is the correct order. Harmless fixture nit.
- Status drafted help: `schema` is documented with `artifactDag` as always present; drafted output omits it (spec-conformant) but help does not mark it active-only.
- Archive `--help` does not document the failure/reconciled record shape (spec does not require it for archive).
- Status help lists top-level `availableTransitions`/`availableSteps` as "legacy"; active output does not emit them (conformant; comment is ambiguous).

## Untested scenarios

- cli:change-transition: "Every skippable blocker gets a bypass line" with a CheckPredicateFailedError (see M-C1); `--skip-checks hook.pre` hint on transition (M-C4); JSON reconciled failure includes `from`/`to` (not asserted); skippable `deps.consistent` generic-bypass for transition text (transition.spec.ts:1418 covers the bypass line; no assertion that the dependency-extraction hint is absent).
- cli:change-status: help descriptions (M-C3); "Pipeline follows canonical order" at JSON level is covered at status.spec.ts:1612/1657.
- cli:change-archive: json-mode reconciled record (covered), `--skip-hooks` reason (covered); no test that the archive reconciled text guide omits `error:` was checked beyond shared test (covered in reconciled-blocked.spec.ts).
- cli:change-approve: text failure with `guidance:` line and unlabelled next action in text mode (JSON covered at approve-failure.spec.ts:100); frozen-error case for Reflect.defineProperty returning false.
- skills:skill-templates-source: covered (template-lifecycle-consent.spec.ts).

## Counts

HIGH 0, MEDIUM 4 (M-C1..M-C4), LOW 6 (L-C1..L-C6), INFO 4. Round-3: H1, H2, M1, M2, M3, L1, L3, L4, L5, L6 FIXED; M4 PARTIAL (see M-C1).
