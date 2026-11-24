# Specs compliance report — decouple-core-cli-workflow-guidance (round 6)

Mode: delegated (attempt verification-attempt-8).

## Summary

| Batch                                                                     | HIGH | MEDIUM | LOW | INFO |
| ------------------------------------------------------------------------- | ---- | ------ | --- | ---- |
| A core lifecycle, edit-change, change-edit, approve-\*                    | 0    | 1      | 2   | 5    |
| B transition-checks, transition-change, invalidate-change, archive-change | 0    | 1      | 5   | 2    |
| C CLI, error-handling, skills                                             | 0    | 2      | 4   | 5    |
| Total                                                                     | 0    | 4      | 11  | 12   |

Auditor test runs: core 2714 + 1427 + 366, cli 1741, skills 183, all passing. Lead gates before the audit: build, typecheck, lint, prettier, test 25/25.

## Detailed Findings

---

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

---

# Partial batch B (round 6) - core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change

Read-only audit. No code/spec modified, no lifecycle commands run.
Specs were read via `changes spec-preview` (spec+verify merged).

## Test runs (core)

- Use-case + checks suites (transition-change*, invalidate-change*, archive-change\*, application/checks, reconciled-transition-status): 19 files, 366 tests, 366 passed, 0 failed, 0 skipped.
- test/domain + test/composition + test/application/services: 441 suites, 1427 tests, 1427 passed, 0 failed.

## Round-5 items

1. transition-change Purpose / Persistence scenario: RESOLVED.
   - Purpose (spec.md) now says only "Fingerprint- and consent-driven validity changes belong to the reconciler." No validation clearing / redesign invalidation text.
   - Persistence scenario says the mutate callback applies "any sign-off invalidation for a skill hop and the lifecycle transition ... without clearing unchanged artifact validation".
   - Code: transition-change.ts:419-431 `mutate` callback does only `freshChange.invalidateSignoff(actor)` (guarded by SKILL_HOP_SOURCES/TARGETS), `freshChange.transition(...)`, and `startImplementationTracking()` when entering implementing. Reconcile runs before (l.217) and after hooks (l.374). Matches the requirement "Skill-aligned backward hop invalidation" (sign-off invalidation is the only direct validity mutation).
   - Tests: transition-change.spec.ts "clears signoff on done -> implementing without downgrading artifacts" (l.2902), "designing -> designing" no-op (l.2630), "archiving -> designing without fabricating drift" (l.2715).
2. invalidate-change `previewArtifactReviewRequired`: matches the reconciler. ACCEPTABLE, with one LOW note.
   - invalidate-change.ts:412-437 vs reconcile-change-validity.ts `collectReviewTargets` (l.305-340) + intentTargetsOf (l.234-235) + change-validity.ts:136 (`artifactReviewRequired = nonTaskReviewTargets.length > 0`): same filters (task artifacts excluded, `skipped` files excluded), same `hashDrift` expression (validatedHash defined, fresh hash defined, differs), `hasDrift`, and `pending-review` status; request targets that are non-task count as required. Verified equal term by term, including that the reconciler treats only `pending-review` (not `drifted-pending-review`) in the pending bucket, as the preview does.
   - Test `invalidate-change-ready-audit.spec.ts` "previews required artifact review from hash-only drift under artifacts none" does not discriminate: the guard reads `ctx.change` after the reconciler pre-pass, and the test's own comment admits the fixture file is already held in review, so the result is the same with or without the `hashDrift` term. Not a behavior gap (code is correct), but the term is not pinned by a test. LOW. Cheaper structural fix: have the preview call a shared helper with `collectReviewTargets` instead of duplicating the logic (removes the drift risk entirely).
3. Archive link materialization with disabled `impl.linksInScope`: IMPLEMENTED AND TESTED.
   - archive-change.ts:1360-1364: `linksInScopeBypassed = skipChecks.includes('impl.linksInScope') || !bindings.some(check.id === 'impl.linksInScope')`; `skippable` taken from the resolved binding (not hardcoded); both unknown-workspace and out-of-codeRoot branches `continue` when bypassed/disabled, else throw `CheckPredicateFailedError` (code IMPLEMENTATION_STATE, details outOfScopeSpecIds/files, from change.state to 'archiving'). Matches spec requirement "Implementation materialization into spec-lock" (incl. the disabled-schema paragraph) and scenario "Schema disables impl.linksInScope".
   - Tests: archive-change-links-audit.spec.ts "schema-disabled impl.linksInScope" (l.238-260) covers unknown-workspace and out-of-scope omission without failure; skipChecks bypass covered in archive-change.spec.ts.
   - INFO: if an ArchiveChange were constructed with an empty `archiveBindings` and no registry, out-of-scope links would be silently omitted (disabled and "no bindings" are indistinguishable). Production composition always supplies the base bindings, so not a defect.

## Per-spec results

### core:transition-checks

Requirements Summary: check identity/result, Check ABI and WorkflowCheck, public CustomCheckDefinition (no static action/kind), one module per check, applicability from/to/along and step-skip scope, dynamic runtime binding composition + cascaded config, archive as operation (archiveChecks overlay/disable/synthesize), phase/failure policy, predicate vs effect, evaluation of a transition attempt, shared candidate evaluator, shared validity verdict + recovery priority, single reconciliation owner, registry bindings + governance, actionable fail diagnostics (compact impl summaries), host-neutral check-declared actions, generic progress bus, approval precedence/legacy parking bindings, verification currency bounds, structured details, projections, no shared snapshot bag.
Implementation Status: implemented. All 17 check modules present in application/checks and domain/checks; no CLI flag strings in core src (grep for `--flag`, `specd <cmd>`, `bypassFlag` in non-comment code: 0 hits); ready carve-out implemented in change-validity.ts `selectAutomaticRecovery` (`state !== 'ready'`) and worded consistently in transition-checks (l.215, l.299, scenarios l.933-939), transition-change (l.56), invalidate-change (l.60). Bypass naming is consistent: use-case input is `skipChecks`; lifecycle verdict option is `skippedCheckIds` and the spec (transition-checks l.358, lifecycle-engine) explicitly documents the two names.
Discrepancies: none HIGH/MEDIUM.

- LOW: no test asserts the compact ">3 examples" text for `impl.linksInScope` (spec scenario "impl fail text stays a compact summary" names both checks). Code is right (detect-impl-links-in-scope.ts:46-52 slices 3 and prints `examples:`); filesResolved is tested (domain/services/transition-checks.spec.ts:289-312), linksInScope's only message test checks host-neutrality (detect-impl-links-in-scope.spec.ts:17-35).
  Test coverage: covered across domain/services/transition-checks.spec.ts, lifecycle-verdict.spec.ts, build-schema-archive-checks.spec.ts, application/checks/\*, composition/use-cases/workflow-check-registry.spec.ts, get-status specs. Scenario titles do not mirror test titles, so coverage was judged by behavior.
  Missing tests: compact examples text for impl.linksInScope (LOW).

### core:transition-change

Requirements Summary: input contract (`skipChecks`, `skipHookPhases`, `refreshImplementationTrackingBefore`, no allowOutOfScope/allowOverlap), approval gates baked at construction (no pending-\* rewrite), reconcile-first, verification.current on verifying->done, backward hop sign-off invalidation in the mutate callback, designing from any state except drafting, archiving->archivable recovery, 'next' + HappyPathNextUnavailableError, hooks/effects phases, progress callback, persistence via ChangeRepository.mutate.
Implementation Status: implemented; throw sites (ChangeNotFoundError l.212, committed-recovery ReconciledOperationBlockedError l.230/382, InvalidStateTransitionError l.238/390, HappyPathNextUnavailableError l.254, CheckPredicateFailedError l.510/524, InvalidCompositionFactoryArgumentsError l.179) all appear in the `@throws` JSDoc (constructor and execute). No allowOutOfScope/allowOverlap anywhere in core src.
Discrepancies:

- MEDIUM (spec-internal, stale scenario, pre-existing text): verify.md "Transition from archiving to designing downgrades artifacts" (verify.md:305-310, "artifact files are downgraded for review") contradicts spec.md Requirement "Transition to designing from any state" ("MUST NOT unconditionally mark every artifact file pending review"; redesign applies only the configured artifact policy / reconciler), the Persistence scenario, and the code. The test covering that hop is titled "without fabricating drift" (transition-change.spec.ts:2715), i.e. the tests follow the spec text, not the stale scenario. Fix the scenario to "does not fabricate drift / artifact reopening follows the configured policy".
- LOW: `execute` JSDoc does not list schema resolution errors (SchemaNotFoundError via ResolveChangeSchema) nor errors from `evaluateTransitionCandidate`; not misleading.
  Test coverage: transition-change.spec.ts (131), -audit (6), -audit-2 (9), -ready-audit (1), reconciled-transition-status (2). Round-5 behaviors (sign-off-only mutation, designing self-entry no-op, committed recovery errors, 'next') covered.
  Missing tests: none material.

### core:invalidate-change

Requirements Summary: input contract/target validation (accumulating errors), approval guard (observe-pass verdict, stale-by-fingerprint consent recovers without force, host-neutral InvalidateRequiresForceError with gates/recoveries), recovery preview computed with the request's effective policy, canonical delegation to reconciler (atomic), cause `artifact-review-required`, policy-aware artifact effects (none/global/surgical/cascade), idempotence on already reopened targets, next action from evaluateLifecycle.
Implementation Status: implemented. Force guard and invalidation share one `reconcile.mutate` (invalidate-change.ts:171-197); `consentToRevoke` reads post-pre-pass projection (valid only); `forceRecoveries` uses the effective policy and `selectAutomaticRecovery` so ready/preserve reports no move and redesign reports designing; next action comes from evaluateLifecycle over recovered state (no hard-coded intent). Error message of InvalidateRequiresForceError is host-neutral (no `--force`); `@throws` lists ChangeNotFound, InvalidInvalidateTarget, InvalidateRequiresForce, which are the only throw sites.
Discrepancies: LOW only - preview duplicates reconciler review-target logic and its hash-only-drift test is non-discriminating (see round-5 item 2).
Test coverage: invalidate-change.spec.ts (27), -policy-audit (10), -ready-audit (6), -next-action (3); includes both-gates force, effective-policy preview, ready stays in ready, no mutation without force.
Missing tests: a discriminating test for the hash-only drift term of the preview (needs a fixture where the pre-pass does not already hold the file in review) - LOW.

### core:archive-change

Requirements Summary: constructor deps (reconcile required), `skipChecks` input (no allowOverlap/allowOutOfScope; bypassing linksInScope does not bypass filesResolved), effective archive bindings + skip validation (unknown/non-skippable/hook ids, disabled-by-schema accepted as no-op), governance (only spec.overlap and impl.linksInScope default skippable), recovery diagnostics via ReconciledOperationBlockedError with evaluateLifecycle next action, delta merge, spec metadata materialization (force, change schema), implementation materialization into spec-lock, batch restore, hooks, post-commit behavior.
Implementation Status: implemented (see round-5 item 3 for link materialization). Throw sites map to documented errors.
Discrepancies:

- LOW: `execute` JSDoc (archive-change.ts:342-350) omits errors that execute can throw: ArchiveArtifactMissingError (l.818, 839), ParserNotRegisteredError (l.832, 835, 1230), ArchiveBatchRestoreError (l.1134). The constructor JSDoc (l.~215-236) does not list InvalidCompositionFactoryArgumentsError (thrown l.276), unlike TransitionChange's constructor which does. Documentation-only.
- INFO: duplicated `@throws {InvalidStateTransitionError}` lines (l.344, 349) are intentional (two causes).
  Test coverage: archive-change.spec.ts (121), -audit (5), -batch-restore (8), -input (2), -links-audit (10), -skip-ids-audit (4); 'reconcile is required' constructor test present (archive-change.spec.ts:211).
  Missing tests: none material.

## Counts

- HIGH: 0
- MEDIUM: 1 (stale verify.md scenario "archiving to designing downgrades artifacts", core:transition-change)
- LOW: 5 (non-discriminating preview hash-drift test + duplicated review-target logic; missing linksInScope compact-examples test; ArchiveChange execute/constructor JSDoc @throws gaps; TransitionChange execute JSDoc minor omissions)
- INFO: 2 (empty-bindings indistinguishable from disabled in link materialization; intentional duplicate @throws)
- Regressions from rounds 4-6: none found. Bypass naming (skipChecks vs skippedCheckIds) and ready carve-out wording are consistent across all four specs and the code.

---

# Batch C partial (round 6, verification-attempt-8) - decouple-core-cli-workflow-guidance

Read-only audit. No code/spec modified, no lifecycle commands run.
Specs: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source (merged via `changes spec-preview`).

## Test runs (vitest summary)

- `pnpm --filter @specd/cli test`: Test Files 115 passed (115); Tests 1741 passed (1741).
- `pnpm --filter @specd/skills test`: Test Files 16 passed (16); Tests 183 passed (183).
- `tsc --noEmit` (cli): clean. `eslint` on packages/cli/src/commands/change, guidance-presenter.ts, error-hints.ts, handle-error.ts: clean.
- `dist` is current: `node packages/cli/dist/index.js change transition --help` matches src/transition.ts help text.

## Counts

HIGH 0, MEDIUM 2, LOW 4, INFO 5.

## Round-5 items re-verified

1. Transition bypass dedupe (VERIFIED). `transition.ts` writeTextRepairGuide: CheckPredicateFailedError branch seeds `bypassed` with `cpErr.checkId` and skips repeats (lines 259-266); non-CPFE branch dedupes by `checkId` (273-281). Test `prints a single bypass line for blockers sharing a checkId` (transition.spec.ts:2057) covers both branches. TOON failure record `error`/`hint`: `emits failure error and hint fields in toon format` (2027) asserts `result: failure`, `error:` with `code: OVERLAP_CONFLICT`, `checkId`, `hint:`, `--skip-checks spec.overlap`. `CheckPredicateFailedError` constructor is `(checkId, label, checkCode, message, action?, details?, skippable?, options?)` (core/src/domain/errors/check-predicate-failed-error.ts:51). I scripted a parse of all 36 `new CheckPredicateFailedError(` fixtures in packages/cli/test: every fixture has action at arg 5, details at arg 6, skippable at arg 7; none are transposed (archive.spec.ts:678 passes a variable `skippable`, fine).
2. Invalidate text-mode overlap suffix (VERIFIED). `change-invalidate.spec.ts:157` (`prints the skip-checks suffix in the text next-action reason...`, expects `reason:  Specs overlap with other active changes. Use --skip-checks spec.ove...`) plus JSON variant at :118. Implementation: `projectCliNextAction(rawNextAction, blockers)` in invalidate.ts:146; suffix only for `intent==='archive'` and skippable `OVERLAP_CONFLICT` (guidance-presenter.ts:167-175).
3. docs/cli/cli-reference.md transition table (VERIFIED with one doc error elsewhere, see M2). Lines 204-212 list `--next`, `--skip-checks <ids>`, deprecated `--allow-out-of-scope` / `--allow-overlap`, `--skip-hooks`, `--format`, `--config`; this matches `--help` output exactly (same options, same deprecation wording). Failure-record bullet (197-202) lists `result,name,from,to,error(code,message,checkId),hint,state,validity,verification,blockers(bypassFlag only when skippable),nextAction`, consistent with code (transition.ts:560-576) and the `--help` schema. Archive section (643) now says bypass is printed "only when that check's binding is skippable"; the "check-specific bypass hint" wording is gone (grep clean).
4. Regression sweep: see Discrepancies.

## cli:change-transition

Requirements Summary: signature with `--skip-checks` + legacy alias translation; `--next` -> `to:'next'`; CLI-rendered hints (generic bypass form, deps.consistent only when not skippable, no alias mention); validity-aware guidance + ReconciledOperationBlockedError repair guide; refresh delegation (`refreshImplementationTracking:false` both reads); approval routing; hooks; check progress (skip marker, Re-checking after hooks once); structured failure record with `error`/`hint`/projected blockers/nextAction; help schema fields.

Implementation Status: COMPLIANT.

- Signature/aliases/skipChecks: transition.ts:450-465, 486-493. Help schema lists error, hint, state, validity, verification, automaticReturn, blocker {code,message,label,checkId,action,bypassFlag,details}, nextAction {targetStep,actionType,command,guidance,reason,intent,action}; no isSkippable.
- Repair guide: `check:`, `code:` (from the caught error), `hop:`, `detail:` lines via describeCheckFailure; own action command/guidance with next-action command alongside (cpCommand/cpGuidance logic 232-240); per-skippable-blocker `bypass:` lines; non-skippable `hint:` only for deps.consistent.
- CheckNotSkippableError hint (hook.\* -> `--skip-hooks`) in text and `hint` for json/toon (checkNotSkippableHint, 137-148).
- ReconciledOperationBlockedError handled before the repair-guide branch (513-533): text via reconciledRepairGuideLines (no error line), structured via projectReconciledOperationBlocked + `error` field.

Discrepancies: none against the spec. INFO: skippable CPFE hint is `resolveCliErrorHint(...) ?? skippableCheckHint` in text (transition.ts:242-247) but `skippableCheckHint` directly in structured mode (552); equivalent today because no hint rule matches `isSkippable:true`, but two code paths could drift.

Test coverage: transition.spec.ts covers every scenario in verify.md (skip-checks, legacy aliases, next resolution, guidance/command fallback, per-blocker bypass, structured projection, CheckNotSkippable hint, help fields incl. `error?: { code, message, checkId? }`), reconciled-blocked.spec.ts (text/json/one bypass per blocker).

Missing tests (LOW): (a) no transition-level test for the non-skippable `deps.consistent` `hint:` line (only handle-error.spec.ts:323 and archive.spec.ts:960); the transition deps fixture at :1381 uses `declared/extracted` details rather than the real `mismatches` shape so `detail:` rendering is not exercised there. (b) `transition.spec.ts:2292` asserts `code: result.error.code` (tautology; `error.code` value itself is never asserted for CPFE in that test, though the TOON test asserts `OVERLAP_CONFLICT`).

## cli:change-status

Requirements Summary: read-only drafted status with projected blockers and display-status fallback; help schema lists every emitted field incl. `bypassFlag`, `action`, `nextAction.intent/action/guidance`, `review.overlapDetail`, `schemaWarnings`; check-derived projections; bypass line `    bypass: --skip-checks <id>` from `isSkippable`+`checkId`; overlap reason suffix; text labels; schema warnings; DAG rules.

Implementation Status: COMPLIANT. status.ts uses `projectCliBlocker` for active (367 and 622 region) and drafted (blockers.map(projectCliBlocker)); text blocker lines via resolveCliBypassFlag (status.ts:42); `projectCliNextAction` adds the overlap suffix; `--help` (run live) documents `bypassFlag`, `action`, `intent`, `guidance`, `validity`, `verification`, `invalidation`, `implementationTracking`, `approvalGates`, `lifecycle.checks/checksByTarget`, `displayStatus`, `hasDrift`, `review.overlapDetail`; no `isSkippable`.

Discrepancies:

- MEDIUM (docs) docs/cli/cli-reference.md:127 says the status JSON `blockers` array carries "Core's `isSkippable` / `action` alongside the CLI-projected `bypassFlag`". Code (guidance-presenter.ts:124-135 projectCliBlocker drops `isSkippable`) and spec ("raw isSkippable is never leaked", help schema must not list it) say raw `isSkippable` is NOT emitted. Fix the doc sentence to `action`, `label`, `checkId`, `details`, `bypassFlag` only.
- INFO: drafted text next-action block (status.ts ~347) prints `command:` only; drafted `command` is always null and there is no `guidance`, so nothing is lost.

Test coverage: status.spec.ts (overlap suffix 2233, bypass lines, drafted projection, help schema). Missing tests: none identified.

## cli:change-invalidate

Implementation Status: COMPLIANT. invalidate.ts: blocker text lines with label and `    bypass:` line (blockerTextLines); JSON/TOON `blockers.map(projectCliBlocker)`; nextAction projected via presenter (`command`, `guidance`, `intent`, `action`); `reason` named field; refusal prints one `warning: valid <gate> consent would be revoked; recovery target: <target>` per recovery then handleError with `{command:'change.invalidate'}`; `--force` text comes only from the resolved hint (no literal "Re-run with --force."). Hint rules INVALIDATE_REQUIRES_FORCE, INVALID_INVALIDATE_TARGET, INVALID_INPUT present.
Discrepancies: none.
Test coverage: change-invalidate.spec.ts (24) + cli-audit-round-2.spec.ts (`prints the --force hint exactly once in text mode`, blocker projection, `ends with the exact skippable bypass sentence`). Missing: none.

## cli:change-verification

Implementation Status: COMPLIANT. verification.ts: invalidate text renders per-blocker label, `bypass:`, then `command:` or `guidance:`; JSON blocker = projectCliBlocker + presenter `command` (omitted, never null) + `guidance`; nextAction projected with `intent`, `action`, `guidance`; start/complete carry no nextAction; format validated before mutation; mismatch error carries a hint without suggesting immediate completion.
Discrepancies: INFO verification.ts:329 `projectCliNextAction(value)` is called without blockers, so the archive overlap-suffix rule cannot apply to `verification invalidate` output; the spec's suffix rule is stated for status/invalidate/approve/transition, not verification, so no violation.
Test coverage: verification.spec.ts (12) incl. `renders blocker remediation with the real change name, and guidance without a name`, `includes action in JSON blockers and omits command for unmapped plugin kinds`. Missing: none.

## cli:change-archive

Implementation Status: COMPLIANT.

- Aliases/`--skip-checks` repeatable, trimmed, deduped, passed only as `skipChecks`; no skippability validation in CLI (archive.ts:116-142).
- CPFE text: overlap branch prints peers from `details.entries` excluding self and ends with `skippableCheckHint('spec.overlap')` only when skippable (197-216); other checks print `check:`, `hop:`, `detail:`, `command:`/`guidance:`, and `bypass:` (skippable) or `hint:` (non-skippable, deps.consistent only). Structured mode flows through handleError, which now adds the generic bypass `hint` for skippable CPFE (handle-error.ts:219-232) with `metadata`.
- ReconciledOperationBlockedError repair guide in text; json/toon `stream:"change-archive"` complete record with state/automaticReturn/projected blockers/nextAction (177-195).
- skipHooks forwarded to the presenter.
  Discrepancies: INFO archive reconciled failure record has no `error` object or `from/to` (transition's has `error`); spec does not require it for archive.
  Test coverage: archive.spec.ts (47 tests) covers every scenario in verify.md incl. suggests/omits bypass, plugin failure text+json, deps.consistent, workspace.readOnly, linksInScope in text+json, hook skip reasons, reconciled-blocked.spec.ts. Missing: none.

## cli:change-approve

Implementation Status: COMPLIANT. approve.ts: help schemas (spec and signoff) list `result,gate,name,state,approval` and state that `state`, `blockers` (code,message,label,checkId,action,bypassFlag,details) and `nextAction` (targetStep,actionType,command,guidance,reason,intent,action) are under error `metadata`; text failure prints handleError `error:` line first, then `state:`, labelled blockers with `bypass:`, `next action:`, `guidance:` and `reason:`; enrichment uses Reflect.defineProperty (no throw on getter-only/frozen errors); success prints `state:` unchanged and no transition; invalid `--format` rejected before mutation.
Discrepancies: none. (LOW, cosmetic) failure text uses unindented `state:`/`next action:` lines while other commands use indented repair-guide blocks; spec does not prescribe indentation.
Test coverage: approve.spec.ts (17), approve-failure.spec.ts (9: ordering, guidance, getter-only/frozen, help). Missing: none.

## default:\_global/error-handling-conventions

Implementation Status: COMPLIANT in code. Scanned packages/core/src (all files, code and comments) for `--flag` CLI options, `specd <cmd>`, `/specd-*`, `allowOutOfScope`, `skipChecks`/`force` used as imperative or "without force" phrasing: no remaining hits (only schema key names `skipChecks` in build-schema/merge-schema-layers, which are config keys, and `force` option plumbing, neither a message remedy). Core `bypassFlag` count in packages/core/src = 0. CLI hint catalogue (error-hints.ts) covers VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (fallback for every command), INVALIDATE_REQUIRES_FORCE, IMPLEMENTATION_DETECTED, HAPPY_PATH_NEXT_UNAVAILABLE, SPEC_NOT_IN_CHANGE, CHECK_NOT_SKIPPABLE(hook), deps.consistent.
Discrepancies:

- LOW (docs/core context) docs/core/errors.md:161 (pre-existing line) tells readers "Run `/specd-verify` to create current evidence" in the core error reference for VERIFICATION_STALE; this contradicts the page's own new host-neutral paragraph (line 41) and the spec's intent. Reword host-neutrally.
- LOW docs/core/errors.md:471 documents `err.predicateCode`, but the property is `checkCode` (with `code` getter returning it); stale name.
- LOW docs/core/errors.md:41 missing separator: "(such as ... `--allow-out-of-scope`) CLI commands (such as ...)" should read "..., CLI commands ...".
- INFO `IMPLEMENTATION_DETECTED` and `INVALIDATE_REQUIRES_FORCE` hint rules are restricted to change.draft/change.discard and change.invalidate. The spec requires the hint for every command that can surface the code; core throws these only from draft-change, discard-change and invalidate-change use cases, so no other CLI command surfaces them today (grep of core/src).
  Test coverage: error-hints.spec.ts, handle-error.spec.ts (34), guidance-presenter.spec.ts. Missing: a core-wide guard test that scans error messages for delivery syntax was not found in this batch (INFO; could not confirm one exists in packages/core/test).

## skills:skill-templates-source

Implementation Status: COMPLIANT for the parts touched by this change. shared.md.tpl "Next Action engine" lists `targetStep, actionType, reason, intent, action, command, guidance` and states `command: null` plus `guidance` must be followed, never invented (shared.md.tpl:145-160). Archive/design/implement/verify/new templates treat `OVERLAP_CONFLICT` as archive-only, teach `--skip-checks <checkId>` only when status shows a `bypass:` flag, mention `--allow-*` solely as aliases (specd-archive.tpl:219-235), and keep `--skip-hooks pre`. No pending-parking happy-path copy found.
Discrepancies: none. Test coverage: skills package 183 tests passing.

## Other docs sweep

- docs/core/custom-checks.md:287-293 (MEDIUM): the "Text Repair Guide" sample prints `command: pnpm audit:fix` for an action `{ kind: '@security.run-audit-fix', guidance: 'pnpm audit:fix' }`. Per cli:change-transition (guidance-only actions print `guidance:` and never `command:`) and the real output (also prints `check:` with label+id, `code:`, optional `hop:`, then `guidance:`), the sample is wrong. Update to `guidance: pnpm audit:fix` (and add the `code:` line).
- docs/adr/0028, docs/adr/0030, docs/core/use-cases.md, docs/guide/workflow.md, docs/guide/configuration.md: no stale use of `allowOutOfScope`/`allowOverlap` as core input; ADR 0030 correctly states the aliases live in the host. docs/cli/cli-reference.md archive table (654-661) matches `change archive --help` aliases wording.
- specs/ outside the change: `specs/core/lifecycle-engine/spec.md:69-70` and `specs/core/get-status/spec.md:180` (current repo copies) still describe core blockers carrying `bypassFlag`; the merged previews from this change (spec-preview of core:lifecycle-engine / core:get-status) already say "Blockers MUST NOT carry CLI bypassFlag", so they are superseded by the deltas on archive (INFO).

## Discrepancy index

| #   | Sev    | Where                                                   | Summary                                                                                                                              |
| --- | ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | MEDIUM | docs/core/custom-checks.md:291                          | repair-guide sample shows `command:` for a guidance-only action; spec/code print `guidance:`                                         |
| 2   | MEDIUM | docs/cli/cli-reference.md:127                           | claims status JSON blockers carry raw `isSkippable`; code and spec forbid it                                                         |
| 3   | LOW    | docs/core/errors.md:471                                 | `predicateCode` should be `checkCode`                                                                                                |
| 4   | LOW    | docs/core/errors.md:161                                 | core error reference tells reader to run `/specd-verify`                                                                             |
| 5   | LOW    | docs/core/errors.md:41                                  | punctuation gap (missing comma)                                                                                                      |
| 6   | LOW    | transition.spec.ts:1381-1420, 2292                      | unrealistic deps.consistent `details` fixture; tautological `error.code` assertion; no transition-level non-skippable deps hint test |
| 7   | INFO   | transition.ts:242 vs 552                                | text and structured bypass hint computed by two paths                                                                                |
| 8   | INFO   | guidance-presenter.ts:391-400                           | reconciled repair guide prints one `bypass:` per blocker without checkId dedupe (spec-literal, differs from transition guide dedupe) |
| 9   | INFO   | verification.ts:329                                     | next action projected without blockers (no overlap suffix)                                                                           |
| 10  | INFO   | archive.ts:177-195                                      | reconciled archive failure record lacks `error`/`from`/`to` (not required)                                                           |
| 11  | INFO   | specs/core/{lifecycle-engine,get-status} current copies | pre-delta `bypassFlag` wording, superseded by this change's deltas                                                                   |
