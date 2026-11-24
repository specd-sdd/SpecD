# Specs compliance report — decouple-core-cli-workflow-guidance (round 7)

Mode: delegated (attempt verification-attempt-9).

## Summary

| Batch                                                                                       | HIGH | MEDIUM | LOW | INFO |
| ------------------------------------------------------------------------------------------- | ---- | ------ | --- | ---- |
| A core lifecycle, change, edit-change, approve-\* (partial coverage, see caveat in batch A) | 0    | 2      | 3   | 3    |
| B transition-checks, transition-change, invalidate-change, archive-change                   | 0    | 0      | 7   | 2    |
| C CLI, error-handling, skills, docs sweep                                                   | 0    | 3      | 5   | 5    |
| Total                                                                                       | 0    | 5      | 15  | 10   |

Auditor test runs: core 4037 passed (0 failed), batch B 1159, cli 1744, skills 183. Lead gates before the audit: build 13/13, typecheck 26/26, lint, prettier, test 25/25, code-graph corpus count 126.

## Detailed Findings

---

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

---

# Round 7 partial audit, batch B (read-only)

Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change (merged spec+verify via `changes spec-preview`).

Test run: `vitest run test/application/use-cases/{archive-change,transition-change,invalidate,reconcile}* test/application/{checks,services} test/domain/{services,checks}` in packages/core: 74 files, 1159 tests, 1159 passed, 0 failed.

## Round-6 items

| #   | Item                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | transition-change scenario "Transition from archiving to designing" | Body FIXED (spec lines 654-659: "artifact files are not marked pending review unless real drift or a reconciler verdict requires it"). Code has no artifact downgrade in `TransitionChange` (mutate applies only `invalidateSignoff` on skill hops + `transition`). Test `transition-change.spec.ts:2715` "transitions from archiving to designing without fabricating drift" agrees. LEFTOVER: the scenario TITLE still reads "...archiving to designing downgrades artifacts" (D1, LOW).                             |
| 2   | invalidate preview uses shared helper                               | FIXED. `previewArtifactReviewRequired` (`invalidate-change.ts:410-425`) calls `collectChangeReviewTargets` (`domain/services/change-validity.ts:219`), the same helper the reconciler uses (`reconcile-change-validity.ts:229`). Unit tests in `change-validity.spec.ts:407-490`; hash-only drift and pending-review under `none` previews are tested (`invalidate-change-ready-audit.spec.ts:267, 282`). Round-5 D5 is closed.                                                                                        |
| 3   | `@throws` JSDoc vs real throw sites                                 | PARTIAL, see D2-D5. TransitionChange and ArchiveChange lists cover every direct throw site; they omit errors propagated from `ResolveChangeSchema`, and ArchiveChange has one stale description and omits rethrown repository errors.                                                                                                                                                                                                                                                                                  |
| 4   | detect-impl-links-in-scope `>3 examples` tests                      | FIXED. `detect-impl-links-in-scope.spec.ts` has "lists every out-of-scope spec when there are at most three" (no `examples:`) and "compacts to three examples when more than three" (4 specs, `(examples: core:w, core:x, core:y)`, `core:z` absent). Code `detect-impl-links-in-scope.ts:44-52` matches the spec scenario "impl fail text stays a compact summary". `impl.filesResolved` has the same rule (`domain/checks/impl-files-resolved.ts:19-28`, tested in `transition-checks.spec.ts`).                     |
| 5   | Sweeps                                                              | No CLI strings in core: grep of `packages/core/src/{application,domain}` for `--skip-checks`, `--force`, `--allow*`, `Re-run with`, `specd <cmd>`, slash commands: 0 hits. `skipChecks` (use-case input) vs `skippedCheckIds`/"skipped check ids" (verdict input/spec prose) naming is consistent. Ready carve-out wording is consistent across transition-checks (lines 215, 299), transition-change (56), invalidate-change (60) with code (`change-validity.ts:195` `state !== 'ready'`). See D6, D7 for residuals. |

## Per-spec summary

### core:transition-checks

- Requirements: check identity/label/result, ABI (`WorkflowCheck`), one file per check, applicability from/to/along, dynamic runtime binding composition and cascaded config, archive-as-operation, phase/failure policy, predicate vs effect, evaluation and shared candidate evaluator, shared validity verdict/recovery priority, single reconciliation owner, registry bindings and governance categories, actionable diagnostics, host-neutral `impl.linksInScope`, check-declared actions, progress bus, projections, no shared snapshot bag, approval precedence and legacy parking bindings, verification currency bounds, check-owned structured details.
- Implementation: `application/checks/*` (one module per check id), `domain/services/transition-checks.ts`, `change-validity.ts`, `lifecycle-verdict.ts`, `workflow-check-registry.ts`. Matches; no CLI text in messages.
- Tests: `test/application/checks/*`, `test/domain/services/{transition-checks,change-validity,lifecycle-verdict}.spec.ts`, `test/application/services/detect-impl-links-in-scope.spec.ts`. All pass.

### core:transition-change

- Requirements: reconcile-first and stop as inapplicable after committed recovery, `to: 'next'` happy path, skip validation via `skipChecks` only, hook phases (`skipHookPhases` skips effects only), post-hook reconcile and predicate rerun, persistence via `ChangeRepository.mutate` (only sign-off invalidation on skill hops + transition + implementation tracking start).
- Implementation (`transition-change.ts`) matches: lines 211-258 (reconcile, recovery error, `HappyPathNextUnavailableError`), 296-346 (skip validation, candidate, predicate failures), 370-396 (post-hook rerun), 419-428 (mutate).
- Tests: `transition-change.spec.ts`, `-audit`, `-audit-2`, `-ready-audit`, `reconciled-transition-status`.

### core:invalidate-change

- Requirements: shape validation before mutation, schema resolution after load, force guard from reconciler pre-pass in one `mutate`, recovery preview under effective policy, `manual-invalidation` intent, ready carve-out, host-neutral errors.
- Implementation (`invalidate-change.ts:136-224`) matches. Redesign nuance in D7.
- Tests: `invalidate-change.spec.ts`, `-policy-audit`, `-ready-audit`, `-next-action`, composition spec.

### core:archive-change

- Requirements: reconcile-first, archivable/archiving guard, uniform `skipChecks`, named archive predicates (`failFastOn: schema.nameMatch`), overlap bypass invalidation, before/after-persist effects, post-hook reconcile and predicate rerun then `postHookValidityBlocksArchive`, snapshot/restore, link materialization, metadata regeneration.
- Implementation (`archive-change.ts:356-740`) matches the sequence. Throw sites: `ChangeNotFoundError` 361, `InvalidStateTransitionError` 384/487/510, recovery error 376/479, `ArchiveArtifactMissingError` 822/843, `ParserNotRegisteredError` 836/839/1234, `CheckPredicateFailedError` 1376/1392/1540 and `_assertArchiveDepsConsistent`, `ArchiveBatchRestoreError` 1138, `HookFailedError` via `throwHookFailed`.
- Tests: `archive-change.spec.ts`, `-audit`, `-links-audit`, `-skip-ids-audit`, `-batch-restore`, `-input`.

## Discrepancies

- **D1 (LOW, spec text): transition-change scenario title** "Transition from archiving to designing downgrades artifacts" (spec line 654) contradicts its own body and the code (no downgrade). Rename, e.g. "...does not fabricate drift". Code: `transition-change.ts:419-428`; test title `transition-change.spec.ts:2715` already says "without fabricating drift".
- **D2 (LOW, code JSDoc): `TransitionChange.execute` `@throws`** (lines 197-205) omits `SchemaProviderIdentityMismatchError`, propagated from `ResolveChangeSchema.execute` (`services/resolve-change-schema.ts:59`, called at transition-change.ts:226, 247). Sibling `ApproveSpec` documents it (`approve-spec.ts:75`) and ArchiveChange tests it (`archive-change.spec.ts:336`).
- **D3 (LOW, code JSDoc): `ArchiveChange.execute` `@throws`** (lines 343-354) likewise omits `SchemaProviderIdentityMismatchError` (called at 363). It also does not mention that `_prepareArchivePlan`/preflight/snapshot failures and commit/archive repository failures are rethrown as the original error after rollback (`archive-change.ts:535, 557, 573, 1130`); only `ArchiveBatchRestoreError` is listed. INFO-level completeness.
- **D4 (LOW, code JSDoc, inaccurate text): `_prepareSpecPublicationPreflight` `@throws {Error}`** (`archive-change.ts:981`) says "When metadata extraction and persisted dependency state conflict". There is no such throw. The only plain `Error` reachable is `resolveSealedArchiveDependsOn` ("ArchiveChange requires ContentHasher...", `resolve-sealed-archive-depends-on.ts:59`); the dependency disagreement is surfaced by `_assertArchiveDepsConsistent` as `CheckPredicateFailedError`. Fix the description.
- **D5 (LOW, code JSDoc): `InvalidateChange.execute` `@throws`** (lines 136-138) lists `ChangeNotFoundError`, `InvalidInvalidateTargetError`, `InvalidateRequiresForceError`, all real. It omits propagated `SchemaNotFoundError` (schema provider) and `SchemaProviderIdentityMismatchError` (`_resolveChangeSchema.execute`, line 164), which `ApproveSpec` documents. The constructor has no throw sites and no `@throws` (correct).
- **D6 (LOW, spec wording): CLI flag names in core specs.** transition-change line 188 and archive-change line 162 say "`--skip-hooks` / `skipHookPhases`" and "`--skip-hooks` skips effects only". The core contract is `skipHookPhases`; the flag is a CLI alias. Other bypass flags were already scrubbed (`--allow-*`, `--skip-checks` only appear in "MUST NOT contain" assertions). Suggest dropping the flag from core spec prose for consistency with the decoupling goal. Code has no CLI strings.
- **D7 (LOW, spec precision): invalidate-change line 60 / scenario "Forced revocation from ready under redesign returns to designing"** states redesign unconditionally returns a `ready` change to `designing`. Code (`change-validity.ts:195-203`) returns there only through the `workflow-redesign` rule, which also requires `artifactReviewRequired` (request marks a non-task artifact, or pre-existing drift/pending review). With `artifacts: 'none'`, no drift and force from `ready`, the change would stay in `ready`. The scenario's test (`invalidate-change-ready-audit.spec.ts:228`) uses `artifacts: 'surgical'`. Either qualify the spec ("with artifact review required") or confirm `validateCommandShape` forbids `redesign` + `none` (not verified).
- **D8 (INFO): grammar** `impl.filesResolved` message for one open file reads "1 open tracked file remain open" (`impl-files-resolved.ts:26`). Cosmetic.
- **D9 (INFO, carried): archive-change scenario "Archive discards nonexistent spec candidate"** wording ("fails before applying external updates" vs discard) unchanged since round 5.

No contradictions with project context or direct dependency specs found. Rounds 4-6 fixes re-checked (link materialization bypass, post-hook validity guard, invalidate preview parity, constructor `@throws`, skipChecks naming, ready carve-out): no regressions.

## Missing tests

- None required by spec. Optional: invalidate redesign + `artifacts: none` from `ready` without drift (D7); a test asserting `SchemaProviderIdentityMismatchError` propagates from `TransitionChange`/`InvalidateChange` (exists only for ArchiveChange).

## Counts

HIGH 0, MEDIUM 0, LOW 7 (D1-D7), INFO 2 (D8, D9). Tests 1159/1159 passed.

---

# Batch C partial (round 7, verification-attempt-9) - decouple-core-cli-workflow-guidance

Read-only audit. Specs: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source (merged previews via `changes spec-preview`).

## Test results (vitest JSON summaries)

- `@specd/cli`: 115 files, 1744 tests, 1744 passed, 0 failed, 0 skipped (run via `pnpm --filter @specd/cli exec vitest run --reporter=json`; "Worker crashed"/parse-error lines in the log are expected negative-test output).
- `@specd/skills`: 16 files, 183 tests, 183 passed, 0 failed.

## Round-6 item re-verification

1. Transition fixtures: PASS. `deps.consistent` fixtures use the real core shape `{ mismatches: [{ specId, extracted, persisted }] }` (core/src/domain/checks/deps-consistent.ts:60-87; transition.spec.ts:1402, 2303). Code assertion is non-tautological: `code:    SECURITY_FINDINGS` is asserted with `statusWith({ blockers: [] })` (transition.spec.ts:2122), so it can only come from the caught error's `checkCode`. Hint tests present: non-skippable deps hint (2307), skippable generic bypass and no dep hint (2313), `--skip-hooks` hint (2249), json `error`+`hint` (2273), toon (2024).
2. Verification invalidate next action with blockers: PASS. verification.ts:239 `projectNextAction(result.nextAction, result.blockers)` -> `projectCliNextAction` appends ` Use --skip-checks <id> to archive anyway.` when intent=archive and a skippable OVERLAP_CONFLICT is present; test verification.spec.ts:414/456. Blockers go through `projectCliBlocker` (no raw isSkippable) in text and structured output; start/complete carry no nextAction.
3. Docs fixes: ADR 0028 line 46 PASS (matches change-validity.ts:195 `state !== 'ready'`; update note at line 141). cli-reference.md blockers PASS (only `bypassFlag`, "raw isSkippable is not exposed"). errors.md: `checkCode` listed (line 471), VERIFICATION_STALE host-neutral (line 41) PASS. custom-checks.md guidance-only example present (lines 51-55, 281-290) but see L3. NEW stale docs found below (M1-M3).
4. Sweep: core `src` has no CLI flags/slash commands/`specd ...`/input-name imperatives in any error message, blocker, check result or lifecycle-guidance projection (grep of domain/application/errors/checks/services clean; only hook `command` and optimizer-agent-name context warnings remain, both out of scope). No `bypassFlag` produced in core (only in merged specs as "no bypassFlag"). Merged core previews (get-status, lifecycle-engine, transition-checks, archive-change, transition-change) carry no CLI syntax in core projections. No regression from rounds 4-7 found in code or tests.

## Per-spec summary

### cli:change-transition

- Requirements: command signature + `--skip-checks`/aliases + help schema; `--next` delegation; CLI-rendered hints; validity-aware guidance incl. ReconciledOperationBlockedError repair guide; refresh delegation; approval routing; hooks/progress bus; success record; CheckPredicateFailedError repair guide (check, code, hop, details, command vs guidance, per-blocker bypass, non-skippable hint); incomplete tasks; progress rendering.
- Implementation: COMPLIANT. transition.ts:176-286 (text guide), 512-533 (reconciled), 534-580 (structured: `error`, projected blockers, `projectCliNextActionRecord`, `hint`, validity). guidance-presenter.ts supplies command/guidance/bypass/describeCheckFailure/reconciled guide. error-hints.ts holds `skippableCheckHint`, deps hint gated on `isSkippable !== true`, hook `--skip-hooks` hint.
- Discrepancies: none HIGH/MEDIUM. INFO: when the failed check is mandatory, other skippable status blockers still get `bypass:` lines (consistent with the per-blocker requirement; spec wording on "no bypass option" is ambiguous). INFO: text guide prints both `blocker:` validity lines and `! CODE` lines for the same blockers (duplicated but harmless).
- Tests: transition.spec.ts (2326 lines), reconciled-blocked.spec.ts, guidance-presenter.spec.ts, error-hints.spec.ts, handle-error.spec.ts cover every scenario in verify.md.
- Missing tests: none material.

### cli:change-status

- Implementation: COMPLIANT. status.ts blockers via `projectCliBlocker` (active and drafted), `bypass:` line from `resolveCliBypassFlag`, nextAction via `projectCliNextAction` (command/guidance/intent/action), drafted nextAction `command: null` and no intent/action, overlap suffix, help schema lists bypassFlag/action/details/intent/action/guidance/actionType/reason and no isSkippable.
- Discrepancies: none in code. Docs: M3.
- Tests: status.spec.ts (2289 lines) incl. gate action, unknown plugin action, drafted projection, overlap suffix (2233).
- Missing tests: none.

### cli:change-invalidate

- Implementation: COMPLIANT. invalidate.ts projects blockers (`projectCliBlocker`, label in text, bypass line), nextAction via presenter with blockers, guidance line when command null; `InvalidateRequiresForceError` prints recovery warnings only; `--force` hint comes solely from `handleError` (`INVALIDATE_REQUIRES_FORCE` rule), no hard-coded sentence.
- Discrepancies: none.
- Tests: change-invalidate.spec.ts covers hints, overlap suffix (154, 191), guidance (741+).
- Missing tests (LOW, L4): no assertion that the `--force` hint appears exactly once / that no hard-coded `Re-run with --force.` is printed (change-invalidate.spec.ts:726-733 only `toContain`).

### cli:change-verification

- Implementation: COMPLIANT. verification.ts: format validated before use cases; invalidate renders blockers (label, bypass, command/guidance), nextAction `command` null + `guidance`, intent/action in structured; start/complete have no nextAction; mismatch hint; safe whitelist via `_validity-present`.
- Discrepancies: none.
- Tests: verification.spec.ts (620 lines) includes action/guidance/command-omitted-never-null (571).
- Missing tests: none.

### cli:change-archive

- Implementation: COMPLIANT. archive.ts: alias translation to `skipChecks`, reconciled repair guide/json record, spec.overlap peer listing + `skippableCheckHint`, generic failure rendering (check, hop, details, command|guidance, bypass|hint), deps.consistent hint gating; non-text formats fall to `handleError` (checkId/skippable-derived hint).
- Discrepancies: none. INFO: help text documents only the success record (spec requires only that).
- Tests: archive.spec.ts (1001 lines) and reconciled-blocked.spec.ts (archive variant).
- Missing tests: none material.

### cli:change-approve

- Implementation: COMPLIANT. approve.ts: error line first, then `state:`, labelled blockers, bypass, `next action:`/`guidance:`/`reason:`; structured additions under `metadata` and help says so; defensive `Reflect.defineProperty` for getter-only/frozen errors; gate input is `{name, reason}` only.
- Discrepancies: INFO only: enrichment shadows an error's own `state` property if present.
- Tests: approve.spec.ts, approve-failure.spec.ts (getter-only, frozen, ordering, guidance).
- Missing tests: none.

### default:\_global/error-handling-conventions

- Implementation: COMPLIANT. Core messages/projections clean (see sweep). CLI hint catalog covers VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (catch-all rule), INVALIDATE_REQUIRES_FORCE, IMPLEMENTATION_DETECTED (only draft/discard can throw it), CHECK_NOT_SKIPPABLE hooks, deps.consistent, generic skippable bypass. Presenter in CLI (`guidance-presenter.ts`) falls back to `guidance` for unknown kinds.
- Tests: error-hints.spec.ts, handle-error.spec.ts, guidance-presenter.spec.ts, core host-neutral-projections.spec.ts.
- Missing tests: none.

### skills:skill-templates-source

- Implementation: COMPLIANT. shared.md.tpl lists targetStep/actionType/reason/intent/action/command/guidance and "command: null plus guidance, MUST follow guidance"; implement template accepts `pending-spec-approval`/`spec-approved` with both consent branches; new template routing rows are drain-only with "while consent is missing; otherwise follow nextAction"; archive template uses `OVERLAP_CONFLICT`, canonical `--skip-checks <checkId>`, aliases only as aliases.
- Tests: template-lifecycle-consent.spec.ts (both consent branches, ordering), template-workflow.spec.ts, shared contract tests.
- Missing tests: none.

## Discrepancies (all severities)

No HIGH. No code/spec/test discrepancy of MEDIUM or higher. Findings are documentation only:

- M1 (MEDIUM, docs): docs/core/errors.md:461 (`**Code:** 'CHECK_FAILED'`), :972 (table) and docs/core/overview.md:107 state `CheckPredicateFailedError` has code `CHECK_FAILED`. Code: `get code()` returns `checkCode` (core/src/domain/errors/check-predicate-failed-error.ts:35-37); `CHECK_FAILED` is only the fallback when a check gives no code (transition-change.ts:514-536, archive-change.ts:1543). Contradicts errors.md:471 and the CLI json `error.code` (e.g. `SPEC_OVERLAP`).
- M2 (MEDIUM, docs): docs/core/errors.md:487 (`deps.consistent: { changeId, declared, extracted }`) and docs/core/custom-checks.md:79 (`{ declared, extracted }`) are stale. Code emits `{ mismatches: [{ specId, extracted, persisted }], specIds }` (core/src/domain/checks/deps-consistent.ts:60-87), which the CLI presenter renders.
- M3 (MEDIUM, docs): docs/cli/cli-reference.md:125 says drafted JSON/TOON `nextAction` has `intent: null`. Code (status.ts:317-322) and spec emit no `intent`/`action` key for drafted changes (only `command: null`).
- L1 (LOW, docs): docs/core/errors.md:179 says a spec recovery pair "targets `designing`". Core selects `recovery?.to ?? change.state` (invalidate-change.ts:450), so from `ready` the target is `ready`.
- L2 (LOW, docs): docs/core/domain-model.md:205 limits the rollback event to states "after `ready`" for both spec consent and workflow redesign; `workflow-redesign` recovery also applies from `ready` (change-validity.ts:201 only excludes `ready` for spec consent).
- L3 (LOW, docs): docs/core/custom-checks.md:281-290 repair-guide sample is stale: `error:` line shows the code instead of `Check '<id>' failed: <message>`, omits the `code:` and `hop:` lines; :76 calls guidance "a plugin-suggested command" though `CheckAction.guidance` JSDoc forbids CLI syntax; :77 omits that `supersedesIntent` defaults to true (lifecycle-guidance.ts:59 treats only `false` as non-superseding).
- L4 (LOW, tests): see cli:change-invalidate missing test.
- L5 (LOW, docs gap): docs/core/use-cases.md GetStatus section does not describe the host-neutral `nextAction` shape (`intent`, `action`); only CLI reference does.
- INFO: specs/ directory still holds pre-change baseline text (SpecOverlapError, core bypassFlag); expected until the change's deltas are merged (merged previews are clean). ADR 0028 lines 85/92 keep pre-update wording, superseded by the update note at line 141.

## Counts

HIGH 0, MEDIUM 3 (all docs), LOW 5, INFO 5. Tests: cli 1744/1744 pass, skills 183/183 pass.
