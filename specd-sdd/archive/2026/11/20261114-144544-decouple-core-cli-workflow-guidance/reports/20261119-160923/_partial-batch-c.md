# Partial batch C (round 11, verification-attempt-13)

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Test results

- `pnpm --filter @specd/cli exec vitest run`: 455 files, 1760 tests, 1760 passed, 0 failed (no flakes).
- `packages/skills` vitest: 50 files, 183 tests, 183 passed, 0 failed.
- Note: a plain `npx vitest run --outputFile` from packages/cli produced a 12-file/58-test JSON (outputFile clobbered by nested vitest fixtures); use pnpm exec form for counts.

## Requirements Summary (changed: cli:change-edit)

- change-edit: text blockers in status form `! <CODE> — <label>: <message>` (label omitted when absent) + indented `bypass: <flag>` only for skippable blockers; JSON/TOON blockers projected via projectCliBlocker (no raw isSkippable); nextAction projected with blockers (overlap suffix only for archive intent). Implemented: edit.ts:170-180 (projection), :248-262 (text via blockerTextLines), JSON at :213-225. Tests: change-edit.spec.ts:269 (text label+bypass once), :285 (overlap suffix archive-only), :298 json, :319 toon.
- Other specs (status, transition, invalidate, verification, archive, approve): blockers emitted via projectCliBlocker in json/toon everywhere (status.ts:340,595; transition.ts:557; invalidate.ts:230; verification.ts:304; approve.ts:232), text via blockerTextLines in status/edit/invalidate; no raw `isSkippable` emitted outside handle-error metadata/hint resolution. error-handling-conventions and skill-templates: no issue found.

## Implementation Status

(1) edit: compliant with spec/verify. `blockerTextLines` lives only in guidance-presenter.ts:145; callers status.ts:310,412, edit.ts:259, invalidate.ts:208; no duplicate definitions. Verification/approve/transition render blockers with their own repair-guide formats (see INFO-1).
(2) `isCheckPredicateFailed`/`isCheckNotSkippable` (guidance-presenter.ts:211,227) are used by archive.ts:193 and transition.ts:100,136,218,548. Repo grep (cli, mcp, sdk src): no remaining ad-hoc instanceof/name checks for these two errors. Only residual: transition.ts:102 `instanceof UnknownCheckError` (different error, fine), handle-error.ts:224-229 reads `metadata.isSkippable ?? metadata.skippable` from error metadata (not a blocker; expected). mcp/sdk have none (sdk only re-exports).
(3) `readAutomaticReturn` (\_validity-present.ts:435) handles undefined/null/object; reading `.cause/.from/.to` of an odd non-null value cannot throw (only a falsy non-null primitive like `false`/`0` would yield a bogus `{undefined...}` object, not an exception; not reachable from typed core). `publicValidity` (:165) retains its `typeof value !== 'object' || null` guard and array guards, so typed callers in status.ts:360, transition.ts:120,205, verification.ts:408 cannot throw on old/odd results. No output change observed in the tests.
(4) Tightened tests: reconciled-blocked.spec.ts asserts an exact 12-line slice of the repair guide (:99-112) plus counts of `bypass:`/`command:` - precise, but sensitive to any line inserted inside that window (intentional contract, MEDIUM-brittle only to repair-guide layout changes; trailing additions are tolerated). cli-audit-round-2.spec.ts uses full `toEqual` on projected blocker objects (:171,:310,:383) and `Object.keys` equality (:270) - tied to the blocker projection contract, acceptable; `errLines.at(-1)` (:223) is sensitive to trailing stderr lines. Neither is weak; neither is brittle to unrelated output.
(5) Docs sweep: no remaining docs claiming raw `isSkippable` output (cli-reference.md:108,127 and change-verification.md:54 correctly state it is not exposed); no `--allow-overlap` suggestions in skills templates (only deprecated-alias mentions in cli-reference.md:208-209 and ADR 0030). See discrepancies for the change-edit gaps.

## Discrepancies

- MEDIUM: `change edit` text output drops next-action `guidance` when `command` is null, while JSON/TOON include `nextAction.guidance` (edit.ts:260-263 vs projected object at :170-180) and every other command prints a `guidance:` line (invalidate.ts:215-217, status.ts:445-447, verification.ts:281-283, approve.ts:192). docs/cli/cli-reference.md:127 states "text output prints it as a `guidance:` line". Text/structured divergence for unknown plugin action kinds. The cli:change-edit spec only requires the command, so this is a spec gap plus inconsistency. No test covers it.
- LOW: docs/cli/cli-reference.md `change edit` section (:239-257) does not mention blockers, next action, bypass lines, or the `blockers`/`nextAction` JSON fields (only "validity changed and any committed recovery"). Should say output includes status-form blockers (with `bypass:`), next action, effective policy, projection changes, automatic return.
- LOW: edit.ts:170-180 and invalidate.ts:127-133 inline-duplicate the `{...projectCliNextAction, intent, action}` construction; `projectCliNextActionRecord` (guidance-presenter.ts:398) exists and would dedupe (it emits `intent: null` when undefined, so a tiny shape difference to decide). status.ts:597-607 duplicates it again.
- INFO-1: Bypass line wording differs by surface: status/edit/invalidate print `bypass: --skip-checks <id>`; transition/archive repair guides print `bypass:  Retry with --skip-checks <id> if an exception is granted` (reconciled-blocked.spec.ts:103). Matches each spec; just noting two forms.
- INFO-2: verification reconciliation payload blockers are `{code,message}` only (verification.ts:428-ish), not projectCliBlocker; consistent with the validity-blocker spec, distinct from Core status blockers.

## Missing tests

- change edit text output with a null-command next action carrying `guidance` (text vs JSON parity).
- change edit TOON/JSON/text parity test that asserts same blocker set across formats in one case.
- readAutomaticReturn unit test for undefined/null/object (none seen dedicated; only via commands).

## Counts

HIGH 0, MEDIUM 1, LOW 2, INFO 2.
