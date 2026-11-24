# Partial batch C (round 13, verification-attempt-15)

Read-only audit. Specs: cli:change-status/-transition/-invalidate/-verification/-archive/-approve/-edit, error-handling-conventions, skill-templates-source.

## Test results

- `pnpm --filter @specd/cli exec vitest run`: 116 files / 1771 tests passed (no flakes; guide-sdk, change-deps, format-size all passed in the full run).
- `@specd/skills`: 16 files / 183 tests passed.
- `@specd/guide` test/integration/sdk-catalog.spec.ts: 26 passed.

## Requirements summary (changed in round 13)

cli:change-transition new rule (spec line 124) + scenario "Failing status read does not mask the original transition error" (line 461): when the fresh-status read fails while rendering a repair guide, print only the original error via the standard error path in text/json/toon, no repair guide, no blockers/nextAction/validity, exit 1.

- Implementation: transition.ts:533-537 `kernel.changes.status.execute(...).catch(() => undefined)`; `if (status === undefined) throw err` -> falls to outer `catch (err) { handleError(...) }` (transition.ts:582). Compliant in all three formats. Exit code via handleError = 1 (test asserts process.exit(1)).
- Test: transition.spec.ts:822-863 `it.each(['text','json','toon'])`. Passes.
  Other specs (status/invalidate/verification/archive/approve/edit/error-handling/skill-templates): no new discrepancies found in the round-13 diff; edit tests below.

## Item findings

1. Transition guard: OK (see above).
   - LOW (test strength): the 3-format test uses `InvalidStateTransitionError`, while the spec scenario is phrased with `CheckPredicateFailedError`. Both go through `isRepairGuideError` (transition.ts:93-107) and the same branch, so behaviour is identical; the test does not exercise the CheckPredicateFailed/structured-hint path.
   - LOW (test strength): the test only asserts `not.toContain('status exploded')` and the original message is present. It does not assert absence of repair-guide text, `blockers`, `nextAction`, or validity fields in json/toon, which the spec says MUST NOT appear. A regression that renders a half repair record without the status error text would pass.
2. run.spec.ts guard (lines 304-315): regex `/\.catch\(\s*\(\s*\)\s*=>/g`, allowlist `{transition.ts: 1}` is tight (actual count 1; only occurrence in src/commands, verified by grep). Graph commands use `.catch((err: unknown) =>` (impact/search/hotspots/stats/why) - correctly not flagged (they take the error).
   - Matches multi-line spacing (`\s*`). Comments are not stripped (a commented-out `.catch(() =>` would count; harmless, conservative).
   - LOW false negatives: `.catch(function () {...})`, `.catch(_ => ...)`, `.catch((_e) => ...)` / `.catch((_: unknown) => ...)` (unused parameter, still swallows), `.catch(noop)`, `try {} catch {}` is covered by the neighbouring test (line 262). Also only `src/commands` is walked, not `src/helpers`/`src/*.ts` (e.g. cli-cleanup.ts). Scope matches test title; INFO.
3. change-edit.spec.ts additions: new `describe('blocker projection')` (text label/bypass once, archive-intent suffix only for archive, json and toon projection without raw isSkippable, cross-format code parity), guidance tests with `command: null` + `guidance` in text/json/toon (lines ~374-460), readOnly workspace error (line ~605-617), renamed tests "renders the workspaces returned by core in JSON output (workspace added/dropped...)" with explicit comment that derivation is core-tested (lines 689-747). All pass; names now honestly describe CLI-only rendering. No discrepancy.
4. Port signature `restoreBatch(specIds, publishOrder, changeName)` / `cleanup(specIds, changeName)`: callers only in core: ports/archive-batch-snapshot.ts:20,25; infrastructure/fs/archive-batch-snapshot.ts:185,231; application/archive-batch-snapshot-noop.ts:30,41 (noop declares fewer params, TS-compatible); use-cases/archive-change.ts:703,1161; composition/use-cases/archive-change.ts:87-101. No usage in packages/cli/src, sdk/src, mcp/src (only unrelated `cli-cleanup.ts` `cleanup()`). docs/ has no reference. No break. INFO.
5. Guide catalog counts: guides-sdk.json catalog has 1751 entries (code-graph 245, core 697, schemas 5, sdk 803, skills 1) -> total 1751 matches; 1751-23 hand-written = 1728 matches. Specs asserting 1728/1751/'core - 685 topics'/'page 1 of 3 - 725 of 1728' (guide-sdk.spec.ts:111,367,386,460-469,541,550; sdk-catalog.spec.ts:164) all pass against the actual catalog (verified by running them; generator not run). Note: raw catalog `core` count is 697 vs 685 in the page-1 text; that is the api-scope subset rendered within the first 725 items (test passes), not a mismatch. INFO: guides-sdk.json shows -106281 lines in git diff (reformat to compact JSON) and guides.json 1 line; generated noise.
6. Docs sweep / git status:
   - No docs/ statement found contradicting the round-13 code. LOW/INFO: docs/cli/cli-reference.md (transition section ~line 158) does not mention the "status read failure keeps the original error" behaviour (docs omission only, not a contradiction).
   - Untracked files outside the obvious change scope (do NOT delete): repo root `EXPLORATION-checks-gates-getstatus.md` (119 KB), `EXPLORATION_ARCHIVE_LINK_REMEDIATION.md`, `0` (known). Also tracked-modified/deleted unrelated-looking: deletions of core/src/domain/errors/archive-dependency-mismatch-error.ts, spec-overlap-error.ts and core/test/domain/errors/spec-overlap-error.spec.ts (` D`, intentional core decoupling presumably). Other untracked: many `*-audit*.spec.ts` in packages/core/test and cli/test (agent-created audit tests, plausibly in scope), packages/cli/src/guidance-presenter.ts (+spec), packages/core/src/domain/services/find-blocking-parent.ts, packages/skills/test/template-lifecycle-consent.spec.ts, and five other change dirs under specd-sdd/changes/ (lifecycle-polish-followups, custom-checks-and-resilient-hooks, host-lifecycle-dispose, change-schema-fallback-cache, cross-workspace-implementation-links) that are not this change's.
   - Also noted: the guard in run.spec.ts allowlist comment matches code.

## Discrepancies

- No HIGH or MEDIUM.
- LOW: transition test does not assert absence of repair guide/structured fields nor use CheckPredicateFailedError (transition.spec.ts:822-863).
- LOW: `.catch` guard misses non-`() =>` swallowing forms and non-commands dirs (run.spec.ts:304-315).
- LOW: root-level EXPLORATION\*.md scratch files are untracked (cleanup is the caller's decision).

## Missing tests

- Strong negative assertions for json/toon failure record (no `blockers`/`nextAction`/`state`) when status read fails.
- CheckPredicateFailedError variant of the unmasked-error test.

## Counts

cli 1771/1771, skills 183/183, guide sdk-catalog 26/26. HIGH 0, MEDIUM 0, LOW 3, INFO 3.
