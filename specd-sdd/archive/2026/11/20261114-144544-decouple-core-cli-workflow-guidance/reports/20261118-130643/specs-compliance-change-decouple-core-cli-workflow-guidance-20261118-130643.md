# Specs compliance report — decouple-core-cli-workflow-guidance (round 5)

Mode: delegated (attempt verification-attempt-7). Scope: 21 change specs plus project-wide and direct-dependency consistency.

## Summary

| Batch                                             | Specs | HIGH | MEDIUM | LOW | INFO |
| ------------------------------------------------- | ----- | ---- | ------ | --- | ---- |
| A core lifecycle (+ edit-change, cli:change-edit) | 7     | 0    | 0      | 2   | 1    |
| B core use cases                                  | 6     | 0    | 1      | 3   | 3    |
| C CLI, error handling, skills                     | 8     | 0    | 0      | 2   | 5    |
| Total                                             | 21    | 0    | 1      | 7   | 9    |

Tests run by auditors: core 1007 + 1116 passed, cli 1736 passed, skills 183 passed, 0 failures. Lead gates: build, typecheck 26/26, lint, prettier, full test 25/25.

## Detailed Findings

---

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

---

# Round 5 partial audit, batch B (read-only)

Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:approve-spec, core:approve-signoff, core:archive-change.

Test run: `vitest run test/application/use-cases/{approve,archive,invalidate,transition,reconciled}* test/application/checks test/domain/services` in packages/core: 63 files, 1116 tests, 1116 passed, 0 failed.

## Round-4 re-verification

| #   | Item                                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | archive `_materializeImplementationLinks` omits out-of-codeRoot / unknown-workspace links when bypassed OR when `impl.linksInScope` is absent from effective bindings | FIXED. `archive-change.ts:1352-1400` (`linksInScopeBypassed = skipChecks.includes(...) \|\| !bindings.some(...)`). Failure path uses `skippable` from the resolved binding and `{from: change.state, to: 'archiving'}`. Tests in `archive-change-links-audit.spec.ts` lines 200-265 (fail out-of-codeRoot, omit when bypassed, fail unknown workspace, omit when bypassed, schema-disabled `it.each`). Spec text in "Implementation materialization into spec-lock" (disabled paragraph) matches. |
| 2   | `postHookValidityBlocksArchive` branches tested                                                                                                                       | FIXED. `archive-change.ts:1486`. Tests (links-audit lines 267-370) cover artifactReviewRequired, signoff stale, specApproval stale, and verification stale with `verification.current` disabled via `archiveChecks` (the only path where the verification branch is reachable). Verdicts are stubbed through the reconcile wrapper (real verdict with overrides on call >= 2), so these are guard tests, not end-to-end.                                                                          |
| 3   | invalidate-change `previewArtifactReviewRequired` mirrors reconciler                                                                                                  | MOSTLY FIXED. Mirrors `collectReviewTargets` for `hasDrift`, `pending-review`, skipped files, task artifacts, and request targets. Test: `invalidate-change-ready-audit.spec.ts:267` (pending-review under `none`). See D5 for one remaining gap (hash drift).                                                                                                                                                                                                                                    |
| 4   | JSDoc                                                                                                                                                                 | FIXED. transition-change constructor has `@throws {InvalidCompositionFactoryArgumentsError}` (line 149, thrown at 179). approve-signoff `execute` has `@throws {VerificationInProgressError}`.                                                                                                                                                                                                                                                                                                    |
| 5   | transition-change Persistence wording                                                                                                                                 | FIXED in the Requirement (spec line 194 states the mutation applies only sign-off invalidation and the transition, and "A verifying -> implementing retry does not clear unchanged artifact validation"). Code matches (`transition-change.ts:419-428`). Two stale leftovers remain, see D4.                                                                                                                                                                                                      |
| 6   | skipChecks (use cases) vs skippedCheckIds (verdict input)                                                                                                             | FIXED. transition-checks uses the neutral "skipped check ids" and "skip input"; workflow-model line 127 names `skippedCheckIds` as the orchestrator input. Code: use cases take `skipChecks`; `lifecycle-verdict.ts` takes `skippedCheckIds`. No contradiction.                                                                                                                                                                                                                                   |
| 7   | ready carve-out wording                                                                                                                                               | Consistent across transition-checks (recovery priority 1, line 215; action projection line 299), transition-change (lines 56, scenario 375), invalidate-change (line 60, scenarios 250/257), approve-spec (line 37). Code `selectAutomaticRecovery` has `state !== 'ready'`. Tests: transition-change-ready-audit, approve-audit-2 (line 210), invalidate-change-ready-audit. One inconsistency with legacy parking states, see D1.                                                               |

## Per-spec summary

### core:approve-spec

- Requirements: gate guard order (gate, load, schema, actor), change lookup, scope-aware fingerprint excluding task artifacts, state eligibility from `boundFromStates('approval.spec')`, never transitions, single decorated actor, reconciliation first, one serialized mutation, input contract, baked gates, factory forms.
- Implementation: `approve-spec.ts` matches all of these. The thrown `InvalidStateTransitionError` has `to: 'ready'` (informational) and the `incomplete-artifact` reason, as specified.
- Tests: approve-spec.spec.ts, approve-audit-2, approve-consent-audit, composition/use-cases/approve-spec.spec.ts. Covered: gate disabled, not found, one actor identity, stays in ready, parking drain, binding-derived states, drift persists review without consent, sovereign schema and identity mismatch, stale consent routed via designing, missing/pending-review artifact.
- Missing tests: none material (see D1 for a spec scenario with no matching test).

### core:approve-signoff

- Implementation matches. Verification errors are distinct (`NotFound`, `InProgress`, `Stale`, `FingerprintMismatch`). `VerificationStaleError` carries `changeName` and a host-neutral message (tested at approve-signoff.spec.ts:240-258). `verifyingEnabled` is derived from the schema, equivalent to the reconciler's `verificationRequired` for every bound state. Whole-file implementation fingerprint is tested (approve-consent-audit.spec.ts:174-250).
- Tests: approve-signoff.spec.ts, approve-audit-2, approve-consent-audit, composition/use-cases/approve-signoff.spec.ts.
- Gap: `blockingArtifact` here only checks the artifact is present and the review verdict, while approve-spec also checks file status (`missing`, `in-progress`, ...). See D6 (INFO).

### core:invalidate-change

- Implementation matches the spec: shape validation before mutation, `ResolveChangeSchema` after load, force guard computed from the reconciler pre-pass inside one `mutate`, recovery preview with the effective policy, `manual-invalidation` intent, host-neutral errors.
- Tests: invalidate-change.spec.ts, -policy-audit, -ready-audit, -next-action, composition/use-cases/invalidate-change.spec.ts.

### core:transition-change

- Implementation matches the requirement set sampled (reconcile-first, skip validation, hook phases, persistence via `ChangeRepository.mutate` with only sign-off invalidation on skill hops from `done`/`signed-off`/`archivable` to `implementing`/`verifying`, `startImplementationTracking`). Constructor throws `InvalidCompositionFactoryArgumentsError` when `reconcile` is missing (tested in audit-2).
- Tests: transition-change.spec.ts (158 KB), -audit, -audit-2, -ready-audit, reconciled-transition-status.

### core:transition-checks

- Registry bindings, resolver single-owner rules, recovery priority, host-neutral actions and the legacy parking-state bindings are consistent with `change-validity.ts`, `lifecycle-verdict.ts` and `test/application/checks`; all pass.

### core:archive-change

- Implementation matches the spec for post-hook guard ordering (predicates rerun first, `CheckPredicateFailedError` for `verification.current`, then generic `InvalidStateTransitionError`), link materialization (item 1) and skip validation.
- Tests: archive-change.spec.ts (176 KB), -audit, -links-audit, -skip-ids-audit, -batch-restore, -input.

## Discrepancies

- **D1 (MEDIUM, spec-wrong or untested contradiction): approve-signoff scenario "Consent in a parking state never transitions" (and the matching approve-spec parking behavior).**
  - The scenario is "historic change in `signed-off` with a STALE sign-off and valid verification; signoff is renewed; state is still `signed-off`".
  - Code: `selectAutomaticRecovery` (`change-validity.ts:~197`) returns `signoff -> done` for any broken consent when `isAfter(state, 'done')`, and `signed-off` and `pending-signoff` are after `done` on `DELIVERY_AXIS`. The reconciler pre-pass inside `ApproveSignoff` would therefore commit a return to `done` first, and consent would be recorded in `done`, not `signed-off`.
  - The same applies to `ApproveSpec` with a stale approval in `spec-approved` (recovery to `designing`, since only `ready` is carved out).
  - Evidence the scenario is not exercised: the test `approve-consent-audit.spec.ts:158` uses an ABSENT sign-off in `signed-off`, not a stale one. I did not run an empirical repro (read-only audit), so this is from code reading.
  - Fix options: change the scenario to "absent or valid-but-unrecorded sign-off", or state in transition-checks / approve-\* that stale consent in a legacy parking state also recovers, or carve parking states out of recovery in code. Spec is likely the thing to fix, since the spec Purpose says parking states "record consent and stay there".
- **D2 (LOW, spec): approve-spec/approve-signoff Gate guard step 3** lists `SchemaProviderIdentityMismatchError` propagation, but neither `execute` JSDoc lists it or the schema resolution errors under `@throws` (INFO-level doc gap). The behavior is correct and tested (approve-spec.spec.ts:409, approve-signoff.spec.ts:179).
- **D3 (LOW, spec-wrong): invalidate preview vs verdict nuance.** See D5.
- **D4 (LOW, spec-wrong): stale transition-change wording.** Purpose (line 6) still says "validation clearing ... redesign invalidation" and the Persistence scenario (line ~755) says "the callback applied any redesign invalidation, validation clearing, and lifecycle transition". The code and the Requirement only apply sign-off invalidation, the lifecycle transition and tracking start. Suggest: "applied any sign-off invalidation and the lifecycle transition".
- **D5 (LOW, code-wrong edge): `previewArtifactReviewRequired`** (`invalidate-change.ts:410`) does not mirror the reconciler's `hashDrift` (`file.validatedHash !== fresh fingerprint hash`, `reconcile-change-validity.ts:317-319`); it only reads `file.hasDrift`/`pending-review`. If a file differs by hash but has not yet been flagged `hasDrift` by the pre-pass (for example effective artifact policy `none` while the persisted policy would have persisted drift, or the pre-pass persists nothing for `none`), the preview reports `artifactReviewRequired=false` while the reconciler will report true. This only changes the previewed recovery under `workflow: redesign`. No test covers hash-only drift in the preview.
- **D6 (INFO): approve-signoff `blockingArtifact`** does not check file statuses (`missing`/`in-progress`) like approve-spec does; the spec only requires "no unresolved non-task artifact review", which the verdict covers. No action required.
- **D7 (INFO, pre-existing): archive-change** scenario "Archive discards nonexistent spec candidate" says archive "fails before applying those external updates" while the Requirement says such links are discarded; wording ambiguity only, unchanged this round.
- **D8 (INFO): post-hook guard tests** stub verdict fields, so they verify the guard, not the reconciler's production of those verdicts.

No contradictions found against `project context` or direct dependency specs (core:change verification-requirement wording agrees with `isWorkflowStepEnabled('verifying')` use in approve-signoff and with the reconciler's `verificationRequired`).

## Missing tests

- Stale (not absent) consent in a legacy parking state for ApproveSpec/ApproveSignoff (D1).
- Hash-only drift in `previewArtifactReviewRequired` (D5).
- Real (unstubbed) post-hook validity blocks in archive (D8).

## Counts

HIGH 0, MEDIUM 1, LOW 3 (D2, D4, D5; D3 is a pointer to D5), INFO 3 (D6, D7, D8).

---

# Partial batch C (round 5): CLI lifecycle specs, error-handling conventions, skill templates

Scope: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.
Method: merged spec-preview vs packages/cli/src (dist is current: no src newer than dist), packages/skills templates, tests. Read-only.

## Test results

- `pnpm --filter @specd/cli test`: 115 files, 1736 tests, 1736 passed, 0 failed.
- `pnpm --filter @specd/skills test`: 16 files, 183 tests, 183 passed, 0 failed.
- (Note: the `--reporter=json` args do not reach vitest through `pnpm test --`; totals taken from the vitest summary.)

## Counts

HIGH 0 / MEDIUM 0 / LOW 2 / INFO 5

## Round-4 items: re-verification (all FIXED)

1. transition (packages/cli/src/commands/change/transition.ts)
   - One `bypass:` per skippable blocker, deduped against the failed check: `writeTextRepairGuide` prints the failed CPFE's bypass, then loops blockers with `if (blocker.checkId === cpErr.checkId) continue`. Test transition.spec.ts ~2180-2193 asserts exactly 2 `bypass:` lines for 2 skippable + 1 non-skippable blockers.
   - CheckNotSkippableError: `checkNotSkippableHint` resolves CHECK_NOT_SKIPPABLE with `{checkId}` (hook.\* -> `--skip-hooks` hint). Text path writes it after `error:`; JSON path sets `hint`. Tests 2195-2220 (hook.pre has hint; protocol.edge / spec.overlap have none).
   - JSON/TOON record has `...structuredErrorField(err)` = `error:{code,message,checkId?}` in both the repair-guide branch and the reconciled branch; skippable CPFE sets `hint: skippableCheckHint(checkId)`. `--help` schema lists `error?: { code, message, checkId? }`, `hint?`, `state?`, `validity?`, `verification?`, blocker `bypassFlag`, `nextAction.{intent,action,guidance}`.
   - Reconciled text guide: `reconciledRepairGuideLines` (guidance-presenter.ts:385) prints per blocker label line, `check:`, `bypass:`, and the blocker action as `command:` or `guidance:`; then repair guide with state/return/target/command|guidance/reason. Covered by reconciled-blocked.spec.ts.
   - Per-phase --skip-hooks reason: `hookSkippedByFlag` in `_check-progress-presenter.ts` maps hook.pre -> target.pre (archive: pre) and hook.post -> source.post (archive: post); `all` skips both; otherwise falls back to the event reason. Tests: check-progress-presenter.spec.ts, reconciled-blocked.spec.ts:196-245.
2. approve: failure text order is `error:` (shared handler) then `state:`, `! CODE — label: message` blockers, `next action:`/`guidance:`/`reason:` (`handleErrorWithApprovalState`, approve.ts:161-197); tests approve-failure.spec.ts 155-175 assert ordering. `parseFormat` is the first statement in the try of both subcommands, before `approveSpec/approveSignoff.execute`; same in invalidate (`parseFormat` before `invalidate.execute`), verification (all three), archive (before `archive.execute`). Live: `--format bogus` exits 1 for transition/approve/invalidate/archive. Enrichment uses `Reflect.defineProperty` (read-only safe).
3. status --help: ran `change status --help`; every schema field line carries `// description` (grep for lines without `//` inside schema returns none) and status.spec.ts:2284 asserts `undescribed == []`. All spec-listed fields present (validity, verification, invalidation, implementationTracking, approvalGates, lifecycle.checks/checksByTarget, displayStatus, hasDrift, schema.artifactDag optional/hasTasks/output, lifecycle block incl. blockingArtifacts, review.overlapDetail, blocker + nextAction shapes, no isSkippable).
4. verification mismatch: `reportVerificationError` uses `cliError(message, ..., {hint, metadata})`; `cliError` writes `error:` then the hint, JSON carries `hint` + `metadata.differences`. No pre-error stderr write remains.
5. invalidate next action: `projectCliNextAction(rawNextAction, blockers)` (invalidate.ts:146) so the OVERLAP_CONFLICT bypass suffix applies; blockers projected via `projectCliBlocker` in json/toon, `blockerTextLines` adds label and `bypass:` in text. `--force` hint comes only from `force.revoke-consent` (no hard-coded sentence; grep for `Re-run with --force` finds only error-hints.ts).
6. docs: configuration.md:813 now "later than `ready`; in `ready` ... renewed there"; ADR 0028 has superseding "Update: spec consent in `ready`" plus inline pointer; cli-reference.md updated for nextAction intent, `--next` table, invalidate wording. See LOW-1/LOW-2 for residuals.
7. archive failure record vs spec: cli:change-archive requires for ReconciledOperationBlockedError that json/toon carry `state`, `automaticReturn`, projected blockers, projected `nextAction`; for other failures only "the structured error record with the error code and exit code 1" (via `handleError`). It does NOT require an `error` object in the archive reconciled record. Code (archive.ts:182-192) matches the spec. Decision: spec does not require it; transition now has it by explicit spec text (cli:change-transition "Invalid transition error"). Divergence between the two commands is INFO-1.

## Per-spec summary

### cli:change-status

- Requirements: active/drafted rendering, blocker projection (label, checkId, bypassFlag, no raw isSkippable), nextAction projected from intent/action via presenter, archive bypass hints from resolved bindings (`    bypass: --skip-checks <id>`, overlap reason suffix), complete `--help` schema.
- Implementation: matches (status.ts +320 lines; presenter in guidance-presenter.ts). Help verified live.
- Discrepancies: none.
- Tests: status.spec.ts (help completeness, drafted projection, bypass cases); all pass.
- Missing tests: none identified.

### cli:change-transition

- Requirements: signature/skip-checks/aliases, `--next` -> `to:'next'`, validity-aware repair guide, GetStatus with refresh false, no gate rewriting, hooks/progress bus, `complete` record, CPFE guide (code, label, hop, details, command/guidance, bypass per blocker), CheckNotSkippable hint, `error` object, blocker projection, check-progress rendering with skip markers and re-check heading.
- Implementation: all satisfied (see round-4 re-verification). `--help` lists the required failure-record fields.
- Discrepancies: none code-vs-spec. Non-blocking: hint forms differ by surface (transition guide `bypass:  Retry with --skip-checks <id> if an exception is granted` vs status `bypass: --skip-checks <id>`): both are specified, INFO-2.
- Tests: transition.spec.ts (bypass count, hint, error object, skip-hooks), check-progress-presenter.spec.ts, reconciled-blocked.spec.ts, cli-audit-round-2.spec.ts.
- Missing tests: bypass dedupe when two blockers share one checkId (INFO-3); TOON variant of the `error`/`hint` record (only JSON asserted).

### cli:change-invalidate

- Implementation matches: flags, policy parsing, force guard warning from `err.recoveries`, hint via `change.invalidate` context, blocker projection, `reason` named field, none-semantics text.
- Discrepancies: none. Tests: change-invalidate.spec.ts. Missing: explicit test that the overlap suffix appears in invalidate nextAction (only checked indirectly via presenter tests).

### cli:change-verification

- Implementation matches: start/complete/invalidate thin adapters, `parseFormat` before mutation, blocker projection with command omitted (never null) / guidance, nextAction `intent`/`action`/`guidance`, mismatch error then guidance.
- Discrepancies: none. Tests: verification.spec.ts pass.

### cli:change-archive

- Implementation matches: skip-checks/aliases, overlap text via `skippableCheckHint`, generic bypass for other skippable checks (`deps.consistent` skippable falls back to generic), non-skippable gets hint only, reconciled repair guide, per-phase `--skip-hooks` (pre/post).
- Discrepancies: none vs spec. Tests: archive.spec.ts, reconciled-blocked.spec.ts.

### cli:change-approve

- Implementation matches: only `{name, reason}` passed; success output includes `state:`; failure ordering, labelled blockers, `guidance:` line, read-only enrichment, help text states payload additions live under `metadata`.
- Discrepancies: none. Tests: approve.spec.ts, approve-failure.spec.ts.

### default:\_global/error-handling-conventions

- CLI side: hint rules exist for VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (now for every command), INVALIDATE_REQUIRES_FORCE, HAPPY_PATH_NEXT_UNAVAILABLE, deps.consistent (non-skippable only), CHECK_NOT_SKIPPABLE (hook.\*), generic `skippableCheckHint`. Spot grep of packages/core/src found no `--flag`/`specd <cmd>`/slash-command text in non-comment code (core batches own the full audit).
- Discrepancies: none in this batch's scope. INFO-4: INVALIDATE_REQUIRES_FORCE and IMPLEMENTATION_DETECTED hints are scoped to specific commands (`change.invalidate`; `change.draft`/`change.discard`); the spec asks the hint to apply to every command that can surface the code. Today those are the only surfacing commands, so compliant, but not future-proof like DEPENDS_ON_OVERWRITE.

### skills:skill-templates-source

- shared.md.tpl "Next Action engine" lists targetStep, actionType, reason, intent, action, command, guidance and the `command: null` + guidance rule (lines ~150-157). Templates for design/implement/verify/new mention OVERLAP_CONFLICT only as "archive-only" (not as a typical blocker) and the archive template tells agents the bypass applies only to live blockers and aliases are aliases. No discrepancy. Skills tests 183/183.

## Discrepancies (all)

- LOW-1: docs/cli/cli-reference.md:635 says archive prints the generic bypass "(or a check-specific bypass hint)". cli:change-archive and cli:change-transition require the hint to be identical in form for every skippable check and forbid check-specific variants. Spec is right; docs are wrong. Fix: drop the parenthetical.
- LOW-2: docs/cli/cli-reference.md transition option table (~lines 198-204) omits `--skip-checks <ids>` and `--allow-overlap`, and the transition section does not document the structured failure record (`error`, `hint`, `state`, `blockers`, `nextAction`). Code and `--help` are right; docs lag.
- INFO-1: transition failure records carry `error:{code,message,checkId?}`; archive reconciled failure record does not (spec only requires it for transition). Consider adding `error` to archive for machine-consumer parity, or leave as is.
- INFO-2: two textual bypass forms (guide sentence vs bypassFlag), both specified.
- INFO-3: text repair guide dedupes the failed check against blockers but not duplicate blocker checkIds among themselves; unlikely in practice.
- INFO-4: see error-handling-conventions note above.
- INFO-5: `enrichApprovalFailure` (approve.ts:216) builds a second CLI context/kernel after failure; harmless but redundant. Also `nextAction.intent` is emitted as explicit `null` in transition/verification records when absent, while status drafted results omit it (spec-consistent for each command).

## Missing tests

- TOON assertion for transition `error`/`hint` fields.
- Duplicate-checkId bypass dedupe (transition).
- Direct test that invalidate's displayed `nextAction.reason` carries the overlap bypass suffix.
