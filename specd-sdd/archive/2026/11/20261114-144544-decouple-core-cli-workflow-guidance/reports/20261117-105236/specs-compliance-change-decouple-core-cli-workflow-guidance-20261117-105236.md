# Specs compliance — change decouple-core-cli-workflow-guidance (round 3)

Mode: delegated (attempt verification-attempt-5). Static audit after the round-2 remediation and the ready-consent fix.

| Batch | Specs                                                                                                  | Result                          |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| A     | lifecycle-engine, workflow-topology, workflow-model, get-status, change                                | 0 high, 2 medium, 3 low, 2 info |
| B     | transition-checks, transition-change, invalidate-change, approve-spec, approve-signoff, archive-change | 0 high, 1 medium, 6 low, 3 info |
| C     | 6 cli:change-\* specs, error-handling-conventions, skill-templates-source                              | 2 high, 4 medium, 6 low, 4 info |

# Detailed findings

---

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

---

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

---

# Round 3 audit - batch C (CLI change-\* specs, error-handling-conventions, skill-templates-source)

Specs: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.
Method: merged spec+verify via `changes spec-preview`; read implementation and tests; ran `vitest` on `packages/cli/test/commands/change`, `error-hints.spec.ts` and `handle-error.spec.ts` (632 tests, all pass).

Counts: HIGH 2, MEDIUM 4, LOW 6, INFO 4.

## Round-2 fixes verified as holding

- transition.ts: check guidance and next-action command print together (`transition.ts:185-193`; `guidance:` and `command:` are independent lines). Test: `transition.spec.ts:2049`.
- transition.ts: the failed check's own code is printed from the caught error (`transition.ts:176`, `cpErr.checkCode`). Test: `transition.spec.ts:2067`.
- transition.ts: structured failure blockers go through `projectCliBlocker` (`transition.ts:479`). Raw `isSkippable` is never emitted. Test: `transition.spec.ts:2084`.
- status.ts: `projectArtifactStatuses` and `blockerTextLines` are shared by the drafted and active outputs (`status.ts:35-70`, drafted at 209-264). Tests: `status.spec.ts:2119-2200`.
- invalidate.ts: blockers go through `projectCliBlocker`. No hard-coded "Re-run with --force." sentence remains. The only `--force` text is the `INVALIDATE_REQUIRES_FORCE` hint resolved by `handleError`, so it prints once.
- error-hints.ts: the generic `DEPENDS_ON_OVERWRITE` rule (`error-hints.ts:~121`) and the `SPEC_NOT_INITIALIZED` hint are present. `VERIFICATION_STALE` is unconditional.
- approve.ts: `state:` line and `state` field are printed and returned on success. Help text puts the failure additions under `metadata`.
- Core: grep over `packages/core/src` (application, domain, composition) finds no CLI flags, `specd ...` syntax, slash commands, `force`, `skipChecks` or `allowOutOfScope` in non-comment code. The messages for `InvalidateRequiresForceError`, `DependsOnOverwriteError` and `HistoricalImplementationGuardError` say "explicit confirmation".
- Hint coverage: `HistoricalImplementationGuardError` is thrown only from draft and discard (hint scoped to those two, correct). `INVALIDATE_REQUIRES_FORCE` and `HAPPY_PATH_NEXT_UNAVAILABLE` each have one surfacing command.

## HIGH

### H1. ReconciledOperationBlockedError has no CLI rendering, in transition or archive (code wrong; spec scenario unmet)

- Spec: cli:change-transition "Validity-aware transition guidance". If reconciliation committed an automatic return, output SHALL show the new state, invalidated evidence, reason and current next action. Scenario "Committed recovery is not rendered as an edge error": output shows committed blockers and next action.
- Code: core throws `ReconciledOperationBlockedError` when reconciliation commits a return (`core/src/application/use-cases/transition-change.ts:229`, `:381`; `archive-change.ts:370`, `:473`).
  - `isRepairGuideError` (`cli/src/commands/change/transition.ts:89-106`) does not include it.
  - Archive handles only `CheckPredicateFailedError` (`archive.ts:171`).
  - Both fall to `handleError` (`handle-error.ts:~243`). Text output is `error: Cannot continue transition ... returned it to 'designing'. Follow the 'design' next action.` plus nothing else.
  - The message exposes a raw intent token ('design' or an action kind), not a command. There is no blockers, state or `command:` rendering.
  - JSON and TOON error metadata (via `extractErrorMetadata` getters) carries raw core `blockers` (including raw `isSkippable`) and a raw `nextAction` with no projected `command`.
  - This breaks the spec rule that raw `isSkippable` is not emitted and that the command is projected by the presenter.
- Tests: none in `packages/cli/test` (grep for `ReconciledOperationBlocked` or `RECONCILED_OPERATION` finds only core tests). The existing "validity-aware transition guidance" test (`transition.spec.ts:1459`) throws `InvalidStateTransitionError`, not the real core error. The `repair guide` path is therefore unexercised for the real committed-recovery error.
- Fix: treat `ReconciledOperationBlockedError` as a repair-guide error in transition, and render the same repair guide for archive (status reload plus `projectCliBlocker` and `projectCliNextAction`). Add a hint or presentation rule for `RECONCILED_OPERATION_BLOCKED`.

### H2. shared.md.tpl does not document `intent`, `action`, `guidance` or `command: null` (template wrong; spec scenario unmet)

- Spec: skills:skill-templates-source, requirement "In-place approval gates in workflow templates" (`shared.md.tpl` bullet: the shared `nextAction` documentation MUST describe `intent`, `action` and `guidance`, and state that actions without a command mapping yield `command: null` plus `guidance`). Scenario "Shared template documents command null with guidance".
- Code: `packages/skills/templates/shared/shared.md.tpl:146-153` lists only `targetStep`, `actionType`, `reason` and `command`.
  - It says command is "the exact CLI or skill command to run".
  - Grep for `guidance`, `intent` and `command: null` in `templates/shared` finds nothing relevant.
- Tests: none in `packages/skills/test` assert it.
- Fix: extend the "Next Action engine" section to document `intent`, `action` and `guidance`, state that `command: null` plus `guidance` means follow the guidance and never invent a command, and add a template contract test.

## MEDIUM

### M1. `change transition --help` omits `actionType` from the nextAction schema (code wrong)

- Spec: cli:change-transition "Command signature" says the `nextAction` shape MUST list `command`, `intent`, `action`, `guidance`, `actionType` and `reason`.
- Code: `transition.ts:366` lists `{ targetStep, command, guidance?, reason, intent, action? }`. No `actionType`, although `projectCliNextAction` emits it.
- Test: `transition.spec.ts:2156` checks only `intent|action|guidance|bypassFlag|hint` substrings, so it cannot catch this.
- Fix: add `actionType` to the schema and to the test term list.

### M2. `change status --help` schema is not "every field the structured output carries" (code wrong, or spec overstated)

- Spec: cli:change-status "Output format".
- Code: `status.ts` help (about lines 125-185) is missing fields that active JSON emits:
  - `invalidation?`, `validity?`, `verification?`
  - `implementationTracking?`
  - `approvalGates`
  - `lifecycle.checksByTarget` and `lifecycle.checks` (optional)
  - `artifacts[].displayStatus` (documented as optional but always set), `artifacts[].files[].displayStatus` and `files[].hasDrift`
- The spec's explicit list (blocker `bypassFlag` and `action`, nextAction fields, `schema.artifactDag` `optional`/`hasTasks`/`output`, lifecycle block) is satisfied.
- Fix: document the missing fields, or narrow the spec sentence.

### M3. Untested: invalidate blocker projection and "force guidance appears once" (test gap)

- Spec: cli:change-invalidate scenario "Blockers are projected and force guidance appears once".
- Code: `invalidate.ts:171-181`, `:245` is correct.
- Tests: `change-invalidate.spec.ts` has no test of `label`, `checkId` or `bypassFlag` on blockers, no check that raw `isSkippable` is absent, and no `bypass:` line. The refusal test (`:626`) only asserts the hint is present. It does not assert it appears exactly once or that "Re-run with --force." is absent. Grep for `bypassFlag|isSkippable|checkId` in that file returns nothing.

### M4. Transition text repair guide shows a bypass for only the first skippable blocker (code, minor spec drift)

- Spec: cli:change-transition "Validity-aware transition guidance": project `--skip-checks <checkId>` bypass hints from `blocker.isSkippable` and `blocker.checkId`.
- Code: `transition.ts:218-224` uses `status.blockers.find(...)`. Several skippable blockers produce one `bypass:` line. The `!` blocker lines also carry no bypass line, unlike status (`    bypass: --skip-checks X`). JSON carries `bypassFlag` per blocker, so the text and JSON outputs disagree.
- Also: a `bypass` line is emitted only if a skippable blocker exists in fresh status, which is fine.

## LOW

- L1. `error-hints.ts` rule `deps.consistent` (`commands: [change.transition, change.archive]`) has no `when: isSkippable === false`. In `transition.ts:195-201` and `archive.ts:194-200`, a skippable `deps.consistent` would get the deps hint instead of the generic bypass hint. The spec says the bypass hint is "identical in form for every skippable check; MUST NOT add check-specific variants". `deps.consistent` is normally non-skippable (so low risk). Add a guard.
- L2. Verification spec says `command` is "omitted (never null)" when `params.changeName` is missing. That sentence is scoped to the remediation, and code does omit `command` on blockers (`verification.ts:285-296`). But `nextAction.command` is emitted as `null` (`verification.ts:327`; asserted by the test at `verification.spec.ts:473`). Status uses `null`. The spec text is ambiguous about nextAction. Clarify in the spec.
- L3. Archive does not pass `skipHooks` to `createCheckProgressPresenter` (`archive.ts:46-51`), so `hook.pre` or `hook.post` skipped via `--skip-hooks` render as `⊘ ... (skipped: <core reason or 'not applicable'>)`, not `--skip-hooks`. The archive spec only shows `✓`/`✗` rendering, so spec and code differ (code is richer). Either pass `skipHooks` or document the skip marker in the archive spec.
- L4. Approve failure text (`approve.ts:~205-222`) writes `state:`, `blocker:` and `next action:` lines to stderr before the `error:` line (`handleError` runs after). It also omits blocker `label` and bypass. Layout is inconsistent with the `! CODE — label: message` form used by status, transition and invalidate. Not spec-required.
- L5. Verification `invalidate` blockers (text and JSON) are not projected through `projectCliBlocker`, so there is no `label`, `checkId` or `bypassFlag`. The verification spec does not require them. This is inconsistent with status and invalidate, but spec-compliant.
- L6. Approve failure handling does `Object.assign(err, { state, blockers, nextAction })` (`approve.ts:~195`). It would throw `TypeError` (unhandled, exit 3) for any error with getter-only `state`, `blockers` or `nextAction` (for example `ReconciledOperationBlockedError` or `HappyPathNextUnavailableError`). Current approve use cases do not throw those, so this is latent.

## INFO

- I1. Archive failure text omits the failed check's diagnostic code (`archive.ts:207-222`). The archive spec requires only check id, label and message, and the spec.overlap branch uses a hard-coded `error: cannot archive — spec overlap detected:` line. Transition prints the code. No spec violation.
- I2. `compile-context`, `get-project-context`, `get-spec-context` and `project-metadata-freshness` warnings embed agent names ("Launch specd-spec-context-optimizer agent"). `Host-Neutral Core Projections` forbids CLI commands, flags and slash commands. An agent name is none of these, so it is compliant. It is delivery-specific wording that could be tightened.
- I3. Active JSON status `artifactDag[].state` falls back to `'missing'` (`status.ts`, `artifactStatuses.find(...)?.displayStatus ?? 'missing'`), not `effectiveStatus` then `state`. The spec's fallback requirement covers `artifacts`, not `artifactDag`. Text DAG uses `displayStatus ?? effectiveStatus ?? 'missing'`.
- I4. Project-wide contradictions: none found. `_global/architecture` (CLI delegates to core) is consistent with the presenter design. The `describeCheckFailure` switch by checkId in the CLI is explicitly sanctioned by cli:change-transition.

## Scenario coverage (untested or weakly tested)

- cli:change-transition "Committed recovery is not rendered as an edge error": untested with the real error (see H1).
- cli:change-transition "Repair guide projects bypass flag from isSkippable and checkId": text projection covered indirectly (`transition.spec.ts:1613`); no test for multiple skippable blockers (M4).
- cli:change-invalidate "Blockers are projected and force guidance appears once": see M3.
- cli:change-archive "Hook check id ... message points to --skip-hooks": covered (`archive.spec.ts:548`).
- skills:skill-templates-source "Shared template documents command null with guidance": no template or test (H2).
- cli:change-status, cli:change-approve, cli:change-verification: all scenarios have tests or code evidence. Approve legacy-parking `state:` is covered by `approve.spec.ts:112` and `:372`.
