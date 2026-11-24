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
