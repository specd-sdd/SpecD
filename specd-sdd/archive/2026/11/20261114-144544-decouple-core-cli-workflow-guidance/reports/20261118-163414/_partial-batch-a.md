# Partial batch A (round 6) - verification-attempt-8 audit

Change: `decouple-core-cli-workflow-guidance`. READ-ONLY audit. Specs merged via `changes spec-preview` (spec + verify).
Scope: core:lifecycle-engine, core:get-status, core:change, core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec, core:approve-signoff.

## Test runs

| Run                                                                                                                                   | Result                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| core `test/domain` + `test/application` (full)                                                                                        | 817 files, 2714 tests, 2714 passed, 0 failed |
| core focused (approve*, edit-change, get-status*, reconciled*, lifecycle*, workflow*, entities/change, services/lifecycle*)           | 153 suites, 491 tests, 491 passed            |
| cli `change-edit.spec.ts` + `change/approve*`                                                                                         | 55 tests, 55 passed                          |
| eslint on approve-spec/approve-signoff/lifecycle-guidance/lifecycle-evaluation/workflow-topology/edit-change/verification-stale-error | no issues                                    |

## Discrepancies (summary counts)

HIGH 0, MEDIUM 1, LOW 2, INFO 5.

### D1 (MEDIUM) Stale sign-off in legacy `pending-signoff` selects a recovery the topology cannot apply

Spec (approve-signoff, "Signoff recording and state transition"): "Stale or revoked consent is recovered by reconciliation before the request is evaluated, also in a legacy parking state (a stale sign-off returns the change to `done`)". core:change says sign-off recovery returns a later state to `done`.

Code evidence (both directions):

- `packages/core/src/domain/services/change-validity.ts:198` `selectAutomaticRecovery` returns `{cause:'signoff', from: state, to:'done'}` for any state after `done` on DELIVERY_AXIS, which includes `pending-signoff` (axis index after `done`).
- `packages/core/src/domain/value-objects/change-state.ts:82-86` `RECOVERY_ONLY_TRANSITIONS.signoff` only lists `signed-off`, `archivable`, `archiving`. It has no `pending-signoff` entry (the `spec-approval` and `workflow-redesign` tables do list both `pending-*` states).
- `Change.recover` (`entities/change.ts:959-967`) then throws `InvalidStateTransitionError`.
- Probe (tsx, scratch only, nothing in repo changed): `selectAutomaticRecovery('pending-signoff', preserve,'valid','stale',false)` -> `{"cause":"signoff","from":"pending-signoff","to":"done"}`; `RECOVERY_ONLY_TRANSITIONS.signoff['pending-signoff']` -> `undefined`; `new Change(... state pending-signoff).recover({cause:'signoff',from:'pending-signoff',to:'done'})` -> `THROWS InvalidStateTransitionError: Cannot transition from 'pending-signoff' to 'done'`.

Reachability: this change's own new behavior makes it reachable. `ApproveSignoff` in `pending-signoff` records consent and stays there (spec scenario "Enabled gate allows execute... remains in pending-signoff"; test `approve-signoff.spec.ts:402`). If linked artifacts or implementation then drift, the sign-off projection goes stale, the reconciler selects the recovery above, and every reconciling path (status, transition, approve, edit) would throw instead of recovering to `done`. The pre-existing table gap predates this change (the table diff does not touch the `signoff` map), but the change's new parking-state consent semantics widen exposure.
Suggested fix: add `'pending-signoff': 'done'` to `RECOVERY_ONLY_TRANSITIONS.signoff` and add a test; or restrict `selectAutomaticRecovery` for sign-off to table-covered states and document it. Missing test: no stale-consent test for `pending-spec-approval` / `pending-signoff` (only `spec-approved` / `signed-off`).

### D2 (LOW) ADR 0028 line 46 still reads "later than `designing`"

`docs/adr/0028-materialized-validity-reconciliation.md:46` keeps the old recovery-priority sentence ("returns to `designing` when the state is later than `designing`"). It carries an inline "(superseded for `ready`: see the note below)" marker and a superseding note at line 143, so it is not wrong, but it is the only remaining stale phrasing found (specs, core src, cli src, skills src clean). Cosmetic.

### D3 (LOW) Guidance branch for `validity.artifactReviewRequired` is redundant with the spec's "design for required review"

Spec (lifecycle-engine, Application lifecycle guidance): guidance MAY read `artifactReviewRequired` "only to choose the phase intent ... `'design'` for required review". `lifecycle-guidance.ts:103-105` routes `artifactReviewRequired && recovery===null` through `intentForStateAndHop` instead of returning `'design'` directly. In practice the review summary routes `nextHop` to `designing` (`resolveLifecycleNextHop`, `review.required` -> `review.route ?? 'designing'`), so the result is `'design'` whenever the file states are persisted (the reconciler persists them before projection). Only diverges if `validity.artifactReviewRequired` is true while `review.required` is false (not producible after reconciliation). No test pins the divergent case.

### INFO items

- I1: `InvalidStateTransitionError` raised by the approve use cases for non-eligible states has the generic message "Cannot transition from X to ready|done" although the spec says `to` is informational and no transition is implied. Spec-compliant; wording is a delivery concern (CLI `approve.ts` / error hints).
- I2: cli:change-edit spec header says canonical command is `specd changes edit` while the examples and tests use `specd change edit`. Pre-existing spec inconsistency, not part of the delta.
- I3: cli:change-edit "Output on success" lists `{result,name,specIds,workspaces,invalidated,state}`; code emits a strict superset (`scopeChanged`, `validityChanged`, blockers, nextAction, projectionChanges, automaticReturn). Compatible.
- I4: `listBypassedWorkflowSteps('done','archiving')` would list `archivable`; not covered by spec text and not reachable through legal transitions. No action.
- I5: `ApproveSpec`/`ApproveSignoff` `@throws` JSDoc is accurate; the reconciler `mutate` itself has no `@throws` (it can surface `ChangeNotFoundError`, covered).

## Round-5 items re-verified

1. approve-spec / approve-signoff text and new scenarios "Stale consent in a parking state is recovered before it is renewed": MATCH.
   - spec-approved stale: `approve-consent-audit.spec.ts:176` ('historic parking states with stale consent') asserts `InvalidStateTransitionError`, message contains `designing`, persisted state `designing`, `specApproval.status === 'stale'`. Code: `selectAutomaticRecovery` -> `RECOVERY_ONLY_TRANSITIONS['spec-approval']['spec-approved']='designing'`; ApproveSpec then fails `outcome:'state'` with `from` = reconciled state (`designing`), `to` informational `ready`.
   - signed-off stale: `approve-consent-audit.spec.ts:194` asserts state `done`, sign-off `valid`, reason `renewed`, persisted `done`. Code path via `RECOVERY_ONLY_TRANSITIONS.signoff['signed-off']='done'`, then `done` is in `boundFromStates('approval.signoff')`, so consent is recorded in `done`.
   - Spec text, purpose, "MUST NOT transition" statements, `boundFromStates` use (no hardcoded state names in either use case), and informational `to` all match `approve-spec.ts` / `approve-signoff.ts`. Only gap is D1 for `pending-signoff` (and no test for the two `pending-*` states).
2. EditChange / change-edit `ready` scenarios: MATCH.
   - core `edit-change.spec.ts:490` "reports stale spec consent in ready without an automatic return" (state stays `ready`, `automaticReturn` null, projection valid->stale) plus `:446` for the post-`ready` return to `designing`. Code: `selectAutomaticRecovery` exempts `ready` (`change-validity.ts:195`).
   - cli `change-edit.spec.ts:590` (`it.each` text/json) asserts state `ready`, `automaticReturn` null, projection `specApproval ... stale`, no stderr "automatic return"; text shows `automatic return: (none)`. `edit.ts:122-133` warns only when projection changes or a return is committed. Note CLI test mocks the core result; the real core behavior is covered by the core test.
3. `@throws` on approve use cases: present and matching the code paths (ApproveSpec: ApprovalGateDisabled, ChangeNotFound, SchemaNotFound, SchemaProviderIdentityMismatch, InvalidStateTransition, FingerprintInput; ApproveSignoff adds Verification{NotFound,InProgress,Stale,FingerprintMismatch}). eslint clean.

## Regression sweep (rounds 4-6)

- Command strings in core src: grep for `--skip-checks`, `--allow-overlap`, `--force`, `--approve`, `bypassFlag`, `/specd-(verify|design|implement|archive|new|compliance)`, `specd (change|spec|project|graph|guide|changes) <word>` across `packages/core/src` (comments included): zero hits.
- `lifecycle-guidance.ts` forbidden-token check (spec): no `approval.spec`, `approval.signoff`, `verification.current`, `boundFromStates`, `activeSpecApproval`, `activeSignoff`, `validity.specApproval`, `validity.signoff`, `pending-spec-approval`, `pending-signoff`, no match on `nextHop.reason`. Domain `lifecycle-verdict.ts` has no `boundFromStates` / approval projection reads / parking-state names (only `workflow-topology.ts` DRAIN_ANCHORS, allowed).
- `VerificationStaleError`: message "Verification for change 'X' is stale; renew verification before sign-off" (no `specd`, `--`, `/specd-`), `changeName` getter, code `VERIFICATION_STALE`. `SpecNotInChangeError` message host-neutral with `specId`/`changeName`. spec.overlap message host-neutral; GetStatus overlap `nextAction.reason` uses blocker message (no flag).
- Stale wording "later than designing": only D2 (ADR, marked superseded). Docs `workflow.md`, `configuration.md`, `use-cases.md`, `cli-reference.md` say "later than `ready`" / "after `ready`" for spec recovery, "later than `done`" for sign-off: consistent with spec.
- `VALID_TRANSITIONS`, `HAPPY_PATH_NEXT`, `boundFromStates` bindings (`ready`/`pending-spec-approval`/`spec-approved`; `done`/`pending-signoff`/`signed-off`) match core:change, core:workflow-topology and the approve specs. Forward exit listed first for both `pending-*` states.

## Per-spec summary

### core:lifecycle-engine

- Requirements: stateless verdict functions and no class; host-neutral `skippedCheckIds`; blockers carry `checkId`/`action`/`isSkippable` from bindings, no `bypassFlag`; verification blockers use actions; hop matrix; nextHop independent of approvals/validity; guidance table rules; `evaluateLifecycle` attaches intent/action from first failed hop action; archiving escapes; shared consumers; DAG-order next artifact.
- Implementation: COMPLIANT. `lifecycle-verdict.ts` (`resolveLifecycleNextHop`, `isAtOrAfterVerificationBoundary`), `lifecycle-guidance.ts`, `lifecycle-evaluation.ts` (`selectHopFailures`), `lifecycle-engine.ts` re-export only.
- Discrepancies: D3 (LOW). D1 relates to recovery table (shared with core:change).
- Test coverage: lifecycle-verdict(.audit), lifecycle-engine(.audit-2), lifecycle-guidance.spec.ts, get-status audits; all pass.
- Missing tests: guidance case for `artifactReviewRequired` without `review.required` (D3).

### core:get-status

- Requirements: reconcile before projection, schema-failure degradation, drafted read-only (`projectArtifacts` only, `intent: null`), blockers with `checkId`/`action`/no `bypassFlag`, overlap `nextAction` archive intent, stale spec consent guidance (designing after recovery, `ready` stays with `approve-spec`), reconciler required.
- Implementation: COMPLIANT (`get-status.ts`: `evaluateLifecycle`, `_nextActionAfterArchiveOverlap`, schema-failure codes, constructor throws without reconciler).
- Discrepancies: none new. Minor: overlap `nextAction` rebuilds the action without `action` (spec requires only intent/targetStep/host-neutral reason) - INFO.
- Test coverage: get-status.spec.ts, get-status-audit(.audit-2), get-status-spec-consent-audit, reconciled-transition-status; all pass.
- Missing tests: none identified.

### core:change

- Requirements: lifecycle table and `VALID_TRANSITIONS` shape, recovery-only edges, interpretation authority, policy-aware invalidation with `ready` exemption, history events.
- Implementation: COMPLIANT except D1 (recovery table lacks `pending-signoff` for sign-off recovery).
- Test coverage: change.spec.ts, change-state(.audit), select-automatic-recovery.spec.ts (covers `ready` exemption, `archivable`/`done` sign-off); all pass.
- Missing tests: sign-off recovery from `pending-signoff` (would fail today, D1).

### core:workflow-topology

- Requirements: pure functions + `drainAnchorOf`/`isDrainState`, canonical order, bedrock/approval-anchor errors, drain exits from table only, one `nextWorkflowStep` rule for all four drain states, verifying enablement.
- Implementation: COMPLIANT (`workflow-topology.ts`; internal helpers not exported).
- Discrepancies: none. I4 INFO.
- Test coverage: workflow-topology.spec.ts, workflow-topology-audit.spec.ts; pass.
- Missing tests: none.

### core:workflow-model

- Requirements (delta): requires/taskCompletion as checks, host-neutral `skippable`/`skipChecks`/`skippedCheckIds` wording, single hook pipeline, updated dependency list.
- Implementation: COMPLIANT in scope reviewed (check bindings, verdict `skippedCheckIds`, `TransitionChange` effects); schema-level validation paths unchanged.
- Discrepancies: none. Test coverage: transition-change, build-schema, lifecycle suites (pass).

### core:edit-change

- Requirements: effective-change reconciliation in one mutation, `ready` keeps stale consent (new scenario), host-neutral `SpecNotInChangeError`.
- Implementation: COMPLIANT (`edit-change.ts` delegates to the reconciler; error message host-neutral with structured props).
- Test coverage: `edit-change.spec.ts` lines 446, 490 and error-message assertions; pass.
- Missing tests: none.

### cli:change-edit

- Requirements: delegate to EditChange, report scopeChanged vs validityChanged, committed `designing` after `ready`, `ready` + stale + no automatic return, warn only on committed projection change.
- Implementation: COMPLIANT (`edit.ts` lines 101-133, 164, 248-254). Uses `projectCliNextAction` for command rendering from intent.
- Test coverage: `change-edit.spec.ts` incl. the `ready` it.each (text/json), designing-return case; 55 CLI tests pass (with approve specs).
- Missing tests: none for this delta (CLI `ready` test is mock-driven; core test covers behavior).
- Discrepancies: I2, I3 (INFO).

### core:approve-spec

- Requirements, implementation, tests: see Round-5 item 1 and 3. COMPLIANT. Missing test: stale consent in `pending-spec-approval` (table covers it; untested).

### core:approve-signoff

- Requirements, implementation, tests: see Round-5 item 1 and 3. COMPLIANT except D1 for `pending-signoff` stale recovery. Missing test: stale sign-off in `pending-signoff`.
