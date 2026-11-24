# Batch C partial (round 9, verification-attempt-11)

Specs audited (spec + verify merged via spec-preview): cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.
Read-only audit. No code, spec, doc or lifecycle changes. A real failing transition was NOT run (it is a lifecycle command); the repair-guide sample was checked against transition.ts.

## Test results

- `pnpm --filter @specd/cli test`: Test Files 115 passed (115); Tests 1749 passed (1749). Single run, no flakes (guide-sdk and change-deps passed first time).
- `pnpm --filter @specd/skills test`: Test Files 16 passed (16); Tests 183 passed (183).

## Round-8 items re-verified

1. transition.ts shared `isCheckPredicateFailed` (instance OR `name === 'CheckPredicateFailedError'`): used at line 100 (isRepairGuideError), 235 (text repair guide) and 565 (JSON hint). VERIFIED consistent in both paths. The new test (`transition.spec.ts` "treats a name-only CheckPredicateFailedError like the real class in json mode") covers the JSON path only. The text path with a name-only error is not tested (LOW, test gap). Text uses truthy `cpErr.skippable`, JSON uses `=== true`. Same result for boolean values.
2. change-edit CLI tests: `change-edit.spec.ts` now has the 3 added tests (remove spec not in change, workspaces after add from another workspace, remaining workspace after core drops one). edit.ts now projects `nextAction` through `projectCliNextAction` and adds `intent` and `action`. VERIFIED. edit.ts JSON `blockers` are Core `ValidityBlocker` objects (code, message, action?, details?). They carry no raw `isSkippable`, so there is no leak. Text edit output prints only blocker code and message and the next action command/reason, not a blocker `command:` (INFO, not required by any audited spec).
3. docs/cli/cli-reference.md bypass paragraph: VERIFIED. `resolveCliBypassFlag` builds `--skip-checks <checkId>` from `isSkippable` and `checkId`. status.ts text prints `    bypass: <flag>` under the blocker (4 spaces, matches the sample). JSON/TOON `bypassFlag` and no raw `isSkippable` match projectCliBlocker. The `--next` wording (CLI passes `to: 'next'`, Core resolves via `HAPPY_PATH_NEXT`) matches transition.ts and the `HAPPY_PATH_NEXT` map exactly (10 entries, none for archivable/archiving).
4. docs/cli/change-verification.md: VERIFIED against verification.ts. The projected `nextAction` carries targetStep, actionType, reason, command, guidance (only if present), intent, action. Blockers carry code/message/label/checkId/details/action/bypassFlag, plus `command` or `guidance` for invalidate. Text prints the `bypass:` line and `command:` or `guidance:`. Format and `--reason` validation happen before `resolveCliContext`. Minor: start/complete JSON `blockers` come from `validity.blockers` and carry only code/message. The sentence "Each projected blocker carries ..." is in the invalidate context, so this is only a nuance (INFO).
5. docs/core/use-cases.md: VERIFIED for checkCode (`APPROVAL_REQUIRED` with approveSpecAction/approveSignoffAction), the TransitionChange error table, archive error rows (CheckPredicateFailedError; InvalidStateTransitionError for not archivable or archiving, matches archive-change.ts lines 378 and 481) and approve states (ApproveSpec uses `boundFromStates('approval.spec')` = ready, pending-spec-approval, spec-approved; ApproveSignoff = done, pending-signoff, signed-off, matching check-bindings.ts).
6. docs/core/errors.md: VERIFIED. `CheckPredicateFailedError.code` returns `checkCode`. `skippable` is optional. The per-check `details` payloads match domain/checks exactly: protocol.edge {from,to}; workflow.requires {artifactId,status?,blockedBy?}; taskCompletion {artifactId,incomplete,complete,total,byArtifact} or {reason,artifactId,byArtifact}; impl.filesResolved {files}; impl.linksInScope {outOfScopeSpecIds}; deps.consistent {mismatches,specIds}; spec.overlap {entries?,peers?}; workspace.readOnly {specs,specIds}; schema.nameMatch {changeName?,changeSchemaName,schemaName}.
7. docs/core/custom-checks.md repair-guide sample: line ORDER and labels match writeTextRepairGuide (error, blockers, `repair guide:`, state, target, check, code, hop, detail, command, guidance, bypass, reason). The sample omits the validity lines (`spec approval:`, `verification:` and similar) that `validityTextLines` prints between `state:` and `target:` when status carries a validity projection (LOW, abbreviated sample). The `guidance:` line (no `command:`) is correct for an unknown action kind.

## Per-spec summary

### cli:change-status

- Requirements: signature, drafted read-only, output format, DAG task display, display-state, lifecycle projections from GetStatus checks, reconciled validity and next-action output, text review omission, blocker labels, archive bypass from resolved bindings, schema warning, not found, schema-derived fields, refresh delegation, implementation/tasks/basic/specs sections, stable display status.
- Implementation status: IMPLEMENTED. status.ts uses `projectCliBlocker`, `projectCliNextAction` and `resolveCliBypassFlag`. Text prints `    bypass: --skip-checks <id>`, `! CODE — label: msg`, and a `guidance:` line when command is null. The overlap bypass suffix is appended by the presenter for the archive intent only.
- Discrepancies: none in code. INFO: INTENT_COMMANDS are slash commands (`/specd-design`), and cli-reference says `command` is "always an executable command or null". This matches the spec wording.
- Tests: status.spec.ts, guidance-presenter and presenter tests pass. Missing: none identified.

### cli:change-transition

- Requirements: signature, `--skip-checks` and aliases, `--next` resolution, validity-aware guidance, refresh delegation, approval routing, output on success and failure (stream records), check progress, hooks, error hints.
- Implementation status: IMPLEMENTED. Check failure guidance: the own-action guidance is always shown and a next-action command accompanies it. The failed check's `code:` is printed even without a matching blocker. One `bypass:` line per distinct skippable blocker. Mandatory checks print no bypass. deps.consistent gets the extraction hint only when not skippable. The structured failure carries error{code,message,checkId?}, hint, state, validity, verification, projected blockers and nextAction with intent/action/command/guidance. The reconciled-blocked path renders a repair guide with no invalid-edge line, tested in reconciled-blocked.spec.ts.
- Discrepancies: none HIGH/MEDIUM.
- Tests: transition.spec.ts (~110 cases) covers all scenarios. Missing (LOW): name-only CheckPredicateFailedError in text mode.

### cli:change-invalidate

- Implementation status: IMPLEMENTED. Blockers projected with `projectCliBlocker` and a text `bypass:` line. nextAction projected with `projectCliNextAction`, plus a `guidance:` line when command is null.
- Discrepancies: none. Tests: change-invalidate.spec.ts passes. Missing: none identified.

### cli:change-verification

- Implementation status: IMPLEMENTED. start/complete/invalidate projections are whitelisted. The mismatch hint is in reportVerificationError. Invalidate blockers carry command/guidance/bypassFlag.
- Discrepancies: none. Tests: verification.spec.ts passes. Missing: none identified.

### cli:change-archive

- Implementation status: IMPLEMENTED. Text CheckPredicateFailedError rendering uses check/hop/detail/command|guidance/bypass|hint. The overlap special case prints the peers and then `skippableCheckHint('spec.overlap')` only when skippable. ReconciledOperationBlockedError renders a repair guide or a structured record. JSON archive failures go through handleError, which emits the check code.
- Discrepancies:
  - LOW: archive.ts line 213 tests `err instanceof CheckPredicateFailedError` only. transition.ts also accepts a duck-typed name, so cross-package class duplication behaves differently between the two commands. The spec does not require it.
  - LOW (doc): cli-reference.md line 643 says text format prints `bypass:  Retry with ...`. For `spec.overlap` with `details.entries`, archive.ts prints the peer list followed by the bare hint, with no `bypass:` prefix. This matches the spec scenario wording but not the doc sentence.
- Tests: archive.spec.ts passes. Missing: none identified.

### cli:change-approve

- Implementation status: IMPLEMENTED. Help text uses bound-from language. Success output includes `state:` (unchanged) and no transition. Failures re-read status and render state, labelled blockers, bypass and the next action in text. JSON enrichment is done via the error metadata.
- Discrepancies: DOC contradictions with the spec and code, see MEDIUM-1 below.
- Tests: approve.spec.ts passes (includes the legacy parking state scenario).

### default:\_global/error-handling-conventions

- Implementation status: core src grep for slash commands, `--skip-checks`, `--force`, `--next`, `--target`, `--allow-*` and `specd <cmd>` inside non-comment string literals found nothing. Projections use intents and actions (kind, params, guidance) plus `isSkippable` and `checkId`. The CLI hint catalog covers VERIFICATION_STALE, SPEC_NOT_INITIALIZED, force-guard codes, DEPENDS_ON_OVERWRITE for every command, and HAPPY_PATH_NEXT_UNAVAILABLE.
- Discrepancies: none. Not exhaustively audited here: input-name imperatives such as "Pass force" in messages (covered by other batches).

### skills:skill-templates-source

- Implementation status: templates (`shared.md.tpl` and the specd-design/verify/archive/new/implement skills) read `nextAction.command`, fall back to `guidance` ("MUST follow guidance instead of inventing a command"), use `--skip-checks <id>` as canonical, and mention the `--allow-*` aliases only as aliases. Consistent with the CLI projection.
- Tests: skills 16 files / 183 tests pass. Missing: none identified.

## Discrepancies and findings (final doc sweep and regressions)

MEDIUM-1 (docs contradict spec and code on approve states):

- docs/cli/cli-reference.md line 352: "requires the committed state to be exactly `ready` ... leaves the change in `ready` ... a state other than `ready`, exit 1".
- docs/cli/cli-reference.md line 366: the same for "exactly `done`".
- docs/guide/workflow.md line 408: "records consent only from `ready`".
- docs/guide/workflow.md line 433: "records consent only from `done`".
- Spec cli:change-approve says ApproveSpec and ApproveSignoff are valid in the binding `from` states of the check: ready plus the legacy pending-spec-approval and spec-approved; done plus the legacy pending-signoff and signed-off. check-bindings.ts and approve-spec.ts and approve-signoff.ts agree, and so do docs/core/use-cases.md and the specd-new skill template.
- Fix: reword these four statements to "ready (or a legacy parking state)" and "done (or a legacy parking state)". The command stays in its current state.

LOW-1: docs/core/errors.md `TransitionFailureReason` snippet (around line 446) omits the optional `status` and `blockedBy` fields on `incomplete-artifact` that exist in invalid-state-transition-error.ts. Not changed this round, so it is pre-existing.

LOW-2: docs/core/custom-checks.md repair-guide sample omits the validity lines (see item 7).

LOW-3: archive text CheckPredicateFailedError uses `instanceof` only, and the cli-reference line 643 `bypass:` nuance (see cli:change-archive).

LOW-4 (test gap): no text-mode test for a name-only CheckPredicateFailedError. The shared predicate makes this very low risk.

INFO-1: docs/core/overview.md error table omits `UNSUPPORTED_MANIFEST_VERSION`, which docs/core/errors.md lists.

INFO-2: change-verification.md start/complete blockers (from reconciliation `validity.blockers`) carry only code and message, with no bypassFlag.

Regressions across rounds 4-9: none found. All the following are consistent with code: skippability defaults (only spec.overlap and impl.linksInScope on transition and archive); the `--skip-checks` and alias docs; the host-neutral `command` or `guidance` split; the legacy-parking approve and transition semantics in docs/core/domain-model.md, docs/guide/workflow.md tables and ADR 0028 update note; recovery from `ready` (spec recovery not requested, redesign recovery still applies, matching change-validity.ts).

## Counts

- Specs audited: 8
- Findings: HIGH 0, MEDIUM 1 (4 doc statements), LOW 4, INFO 2
- Tests: CLI 1749/1749 (115 files); skills 183/183 (16 files)
