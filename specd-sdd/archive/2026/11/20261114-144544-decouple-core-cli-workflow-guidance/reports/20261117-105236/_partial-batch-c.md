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
