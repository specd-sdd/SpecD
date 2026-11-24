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
