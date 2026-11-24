# Batch A (round 5) - core:lifecycle-engine, core:get-status, core:change, core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit

Scope note: this round focused on re-verifying the four round-4 FIXED claims. The wider requirement sweep of the seven specs was shallower (grep-level: no CLI/skill command strings or bypass flags remain in packages/core/src outside infra config-loader doc comment; spec previews all load).

## Tests run

vitest (core): edit-change.spec, get-status* (4 files), domain/checks/approval-spec.spec, domain/services/*, invalidate-change-ready-audit.spec, domain/entities/\*: 1007 passed, 0 failed (267 suites, 0 failed).

## Round-4 re-verification

1. `ready` carve-out - VERIFIED in spec and code, one test gap.
   - Spec wording present: core:edit-change (requirement text + scenario "Scope change in ready keeps the change in ready"), cli:change-edit (output requirement + scenario "Output reflects canonical gate recovery" last AND), core:change scenario "Current consent is required only when enabled" (consent renewed in `ready`).
   - Code: `selectAutomaticRecovery` (domain/services/change-validity.ts) excludes `state === 'ready'` for spec-approval. `RECOVERY_ONLY_TRANSITIONS['spec-approval']` (domain/value-objects/change-state.ts) no longer has `ready`; `pending-spec-approval` remains (legacy drain state, consistent). `workflow-redesign` still keeps `ready`, intended (redesign is not consent-based).
   - EditChange (application/use-cases/edit-change.ts) and CLI edit.ts only act on `automaticReturn !== null`, so in `ready` nothing is returned/printed as a return: matches the statement.
   - Tests: unit coverage in test/domain/services/select-automatic-recovery.spec.ts (ready stale/revoked -> null, later states -> designing) and end-to-end in get-status-spec-consent-audit.spec.ts (stale in ready, real reconciler, no return, APPROVAL_STALE with approve-spec action).
2. build-schema.ts uses `isDrainState` (build-schema.ts:3 import, :841 use; rejects drain steps with SchemaValidationError). VERIFIED.
3. get-status `_mergeBlockers`: dedupes validity blocker vs check by `code:message`; when existing has no action it adopts `check.action` (get-status.ts ~1030). VERIFIED; new test get-status-spec-consent-audit.spec.ts asserts blocker.action.kind === 'approve-spec' and nextAction.action approve-spec. approval-spec check emits `APPROVAL_REVOKED` for status revoked vs `APPROVAL_STALE` for stale (domain/checks/approval-spec.ts:43); test/domain/checks/approval-spec.spec.ts covers REVOKED (line 42). VERIFIED.
4. skippedCheckIds vs skipChecks wording in core:workflow-model: spec line now reads "`skipChecks` on the use cases, `skippedCheckIds` on the lifecycle verdict input"; code: lifecycle-verdict.ts `skippedCheckIds` option (line 66), use cases take `skipChecks`. VERIFIED, consistent. (Schema-level `skipChecks` declarations on workflow steps is a separate, unrelated concept; wording keeps them distinguishable.)

## Per-spec summary

### core:lifecycle-engine / core:workflow-topology

Implementation status: drain-state handling (`isDrainState`, DRAIN_ANCHORS), VALID_TRANSITIONS vs RECOVERY_ONLY_TRANSITIONS separation, recovery selection priority (spec consent, then signoff after done, then workflow redesign; verification staleness never recovers) all match spec/doc comments. Tests: select-automatic-recovery.spec, lifecycle-verdict.spec, change-validity.spec pass.
Discrepancies: none found.

### core:get-status

Implementation status: blockers merged with action propagation, nextAction carries structured `action`/`intent` (no command strings). Tests: get-status.spec, -audit, -audit-2, -spec-consent-audit pass.
Discrepancies: none found.

### core:change

Implementation status: ready consent scenarios match code (renewal in ready, no return). Discrepancies: none found.

### core:workflow-model

Implementation status: skip wording consistent; drain steps rejected in schema build. Discrepancies: none.

### core:edit-change

Implementation status: matches spec; `automaticReturn` null in ready.
Missing test (LOW): no EditChange-level unit test for scenario "Scope change in ready keeps the change in ready" (edit-change.spec.ts reconciled-edit block only covers `implementing` -> designing and reordering). Behavior is indirectly covered by select-automatic-recovery.spec and get-status-spec-consent-audit.spec.

### cli:change-edit

Implementation status: edit.ts prints recovery only when `automaticReturn` present; ready case yields no return text, consistent with spec.
Missing test (LOW): packages/cli/test/commands/change-edit.spec.ts has no `ready` scenario ("the same edit in `ready` reports `ready` with the stale approval and no automatic return").

## Cross-spec / project-wide consistency

No contradictions found between these seven specs and direct deps checked (core:transition-checks, core:approve-spec ready-consent semantics, core:workflow-model). Not exhaustively diffed against every project-wide spec.

## Counts

HIGH 0, MEDIUM 0, LOW 2 (missing EditChange ready test; missing CLI change-edit ready test), INFO 1 (workflow-redesign recovery still lists `ready`, intended).
