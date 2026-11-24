# Partial batch C (round 12, verification-attempt-14) - READ-ONLY audit

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Round-12 focus items

### (1) edit text guidance line + shared projectCliNextActionRecord

- edit.ts appendEditGuidance (edit.ts:242-267) prints `guidance:` only when `command === null && guidance !== undefined`, before `reason:`. Matches cli:change-edit scenario "Text output prints guidance when the next action has no command" (spec-preview line ~260) and docs/cli/cli-reference.md:259-261. Test: change-edit.spec.ts:374. Blocker parity: text uses blockerTextLines(blockers), json/toon use projectCliBlocker; bypass line vs bypassFlag derive from the same resolveCliBypassFlag (guidance-presenter.ts:124-153). OK.
- projectCliNextActionRecord (guidance-presenter.ts:398-410): `{...projectCliNextAction, intent: nextAction.intent ?? null, ...(action !== undefined ? {action} : {})}`.
  - Core `LifecycleNextAction.intent` is typed `LifecycleActionIntent | null` (core lifecycle-guidance.ts:22, always set at :230), so `?? null` never converts an `undefined` in practice; JSON/TOON cannot show null-vs-missing difference from core output. The `?? null` only matters for hand-built inputs (CliNextActionInput.intent is optional, :161). No consumer-visible change.
  - edit/invalidate: previously the raw core nextAction was emitted (HEAD); now projected -> adds `command`, optional `guidance`, and overlap-bypass suffix in `reason` only for intent=archive with OVERLAP_CONFLICT blocker (edit/invalidate rarely archive-intent; acceptable, in line with spec "centralized presenter"). Help schemas (verified via `changes edit --help`) list command/guidance?/intent/action? consistently.
  - status: now emits intent/action in nextAction (HEAD emitted only targetStep/actionType/reason/command). This is an intended additive output change; docs/cli/cli-reference.md:125-127 documents it. Drafted status path (status.ts:291-296) still builds a hand-made nextAction without intent/action; docs:125 says exactly that ("no intent or action key is emitted"). OK, consistent.
  - Result: no output regression found across text/json/toon.
- INFO: edit/invalidate text path types: appendEditGuidance param type declares only targetStep/command/guidance/reason - fine structurally.

### (2) transition.ts repair guide `.catch(() => undefined)` (transition.ts:~532-536)

- It is a Promise `.catch`, not a `catch {}` block, so the run.spec.ts:262 guard (regex `catch\s*(\(...\))?\s*\{`) does not see it and cannot flag it. It wraps only `kernel.changes.status.execute(...)`, a core use case that never throws CliExitError (CliExitError is only thrown by CLI command code). So swallowing a CliExitError is not possible in practice. The follow-up `if (status === undefined) throw err` rethrows the ORIGINAL transition error to the outer `catch (err) { handleError(...) }`, which is consistent with the guard's intent (nothing terminal swallowed).
- Spec: cli:change-transition requires repair guide rendered from GetStatus (lines 43, 59, 118) but is silent on status-read failure. Printing only the original error (exit 1 via handleError) is acceptable; the alternative (masking the transition error with the status error) would be worse. LOW: spec does not state this fallback; recommend a one-line scenario ("status read failure during repair guide keeps the original error"), and an in-source comment is already present (transition.ts:~531).
- Tests: transition.spec.ts:822-860 `it.each(['text','json'])` covers text and json; toon not covered (same code path as json; LOW). Test asserts exit(1), original message present, `status exploded` absent. Does not assert that no repair-guide text was printed (INFO).
- Note: swallowing is also silent for diagnostics (no debug trace). INFO.

### (3) read-automatic-return.spec.ts

- Untracked new test (3 cases): undefined stays undefined, null stays null, object copied to new object with only cause/from/to. Matches `readAutomaticReturn` (\_validity-present.ts:432-). Correct and sufficient. Edit.ts uses it at edit.ts:158; edit docs "automaticReturn ... | null" matches --help.

### (4) docs `change edit` vs real --help vs spec

- `changes edit --help` options/schema equal docs/cli/cli-reference.md:239-261 (options table, flags, blockers fields, nextAction fields incl. guidance/intent/action, automaticReturn nullable). Text format in docs `! CODE — label: message` matches blockerTextLines. Help schema nextAction comment "intent ... or null" matches. No discrepancy.
- Minor INFO: docs says "`guidance` (only when command is null)"; help says "advice shown when command is null" - consistent. Projection omits guidance when command non-null: presenter sets guidance only when resolveCliWorkflowGuidance returns it (guidance-presenter.ts:80 ensures it is undefined when a command resolves).
- INFO: docs line 45 area "invalid policy value exits 1 before mutation" is consistent; invalidate.ts moved parseFormat before mutation (invalidate.ts diff) - good.

### (5) Wide docs sweep / stray files

- No contradiction found in the sampled cli-reference sections (change status 125-127, edit 239-261). Not exhaustively diffed docs/core, docs/guide, ADR 0028 in this pass beyond targeted greps (see INFO).
- invalidate.ts removed the " Re-run with --force." tail from the force-warning line (invalidate.ts diff ~235) - verify docs/spec do not quote the old text: grep below.
- Untracked non-change-scope files in repo root (NOT deleted):
  - `0` (0 bytes, mtime Nov 19 16:21:05): almost certainly an accidental shell redirect like `> 0` / `2>&0`-style typo or `echo ... >0` by an agent running verification commands during this session (mtime precedes current work by ~hours; guidance-presenter.ts mtime 16:30). Not created by the CLI under test as far as visible.
  - `EXPLORATION-checks-gates-getstatus.md` (119 KB, Nov 17 08:43) and `EXPLORATION_ARCHIVE_LINK_REMEDIATION.md` (9.6 KB, Nov 17 12:54): Spanish "Fichero de trabajo (no es spec ni documentación). Rama feat/lifecycle-transitions-ux" scratch notes, same style as already-tracked EXPLORATION\_\*.md in root; written by earlier exploration agents/the user's main session. Not part of this change. Recommend not committing.
  - Other untracked paths are expected: packages/cli/src/guidance-presenter.ts, core find-blocking-parent.ts, many new test specs, skills template-lifecycle-consent.spec.ts, and several specd-sdd/changes/\* directories (lifecycle-polish-followups, custom-checks-and-resilient-hooks, host-lifecycle-dispose, decouple-core-cli-workflow-guidance, change-schema-fallback-cache, cross-workspace-implementation-links) - these other changes' dirs are outside this change's scope but plausibly legitimately created by the user's own changes.
- Tracked deletions in working tree: core errors archive-dependency-mismatch-error.ts, spec-overlap-error.ts and its test (intentional per decouple refactor; confirm no remaining imports - build passes per tests below).

## Discrepancies

- LOW: cli:change-transition spec silent about status-read failure fallback (no scenario). transition.ts:~530-536.
- LOW: no toon variant in transition.spec.ts:822 test.
- INFO: run.spec.ts allowlist counts are by `catch {}` blocks; the promise `.catch(() => undefined)` pattern bypasses the guard by construction - a future refactor could reintroduce swallowing unnoticed. Consider extending the guard regex to `\.catch\(`.
- INFO: `0` stray file and two EXPLORATION files untracked in root.
- HIGH: none. MEDIUM: none.

## Missing tests

- toon format for transition repair-guide status-failure; edit json/toon assertion that `guidance` key present with `command: null` (only text asserted at change-edit.spec.ts:374; `keeps scope and validity separate` at :168 covers structured at a basic level).

## Test results

See bottom (appended after runs).

- `pnpm --filter @specd/cli test`: Test Files 114 passed (114), Tests 1681 passed (1681), BUT vitest reported "Errors 2 errors" (unhandled errors from a timers callback, stack ends in node:internal/timers listOnTimeout) so pnpm exit status was 1. Output was piped through tail so the error text was not captured; run duration 1869 s (import 1817 s), suggesting heavy machine contention from concurrent agents, so timing-related unhandled errors (e.g. run.spec.ts fake-timer grace period, or a CLI force-exit timer) are plausible. MEDIUM (unverified): re-run `pnpm --filter @specd/cli exec vitest run` without tail on an idle machine to identify the 2 unhandled errors; they are not attributable to round-12 changes from evidence available.
- `pnpm --filter @specd/skills test`: 16 files, 183 tests, all passed, exit 0.
- Also noted: invalidate.ts force warning no longer ends with "Re-run with --force." (asserted absent by cli-audit-round-2.spec.ts:146; change-invalidate.spec.ts:630 consistent); no docs/spec quote the old text.
