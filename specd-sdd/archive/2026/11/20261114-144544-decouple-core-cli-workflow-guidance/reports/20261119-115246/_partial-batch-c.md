# Partial batch C (round 10, read-only)

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Test results

- `@specd/cli` vitest (json reporter, full run, no flakes): 115 files, 453 suites, 1752 tests, 1752 passed, 0 failed.
- `@specd/skills`: PASS 183, FAIL 0.

## Round-10 item verification

1. `isCheckPredicateFailed` (guidance-presenter.ts:192) matches instanceof or name. Used by transition.ts (100, 219, 549) and archive.ts (193). No other CLI/mcp/sdk consumer does `instanceof CheckPredicateFailedError`; sdk only re-exports. `transition.ts:101,137` still use `instanceof CheckNotSkippableError || name ===` inline (same dual semantics, not via shared helper). Name-only tests exist: transition.spec.ts:2026/2394, archive.spec.ts:1013, handle-error.spec.ts:515. OK.
2. Blocker projection: status (text + json + toon + drafted json 622/367), approve (232), invalidate (247), verification (299), transition failure record (558), edit (edit.ts:145,219) all use `projectCliBlocker`. No raw `isSkippable` emitted from any command; `status.ts:686` lifecycle.blockers are a different per-transition shape (transition/reason/blocking), unaffected. `handle-error` structured error metadata carries error-own `skippable` field (INFO, pre-existing, distinct from blockers). Prior-round claim that edit already projected is now true (edit.ts:219).
3. Docs verified against code: cli-reference status bypass text matches `resolveCliBypassFlag`/`blockerTextLines`; workflow.md approve-from-ready-or-legacy matches approve-spec.ts; errors.md TransitionFailureReason matches invalid-state-transition-error.ts:4-11; custom-checks.md repair-guide sample line order matches transition.ts 219-296 and `validityTextLines`. Archive "workspace.readOnly never skippable" consistent with docs/guide/workflow.md:263 and ADR 0030 (binding lock; I did not re-derive from registry source).
4. Wide sweep of docs/, guide, skills templates: no stale `isSkippable` exposure or CLI-command-in-core statements found; skills templates mention pending states only as drain.

## Discrepancies

- MEDIUM (missing test): no test asserts `change edit` json/toon blockers are projected (bypassFlag present, `isSkippable` absent, label/checkId kept). packages/cli/test/commands/change-edit.spec.ts blockers fixtures (136, 176, 213) have no checkId/isSkippable; only the --help test (752) mentions bypassFlag. Projection at edit.ts:145/219 is therefore unguarded.
- LOW (missing test): `change invalidate` has no test with `isSkippable` blockers (no isSkippable in change-invalidate.spec.ts); json projection at invalidate.ts:247 and text bypass line (blockerTextLines) unguarded. verification.spec.ts:428 only asserts nextAction.reason, not blockers[].isSkippable absence/bypassFlag.
- LOW: `change edit` text blockers (edit.ts:255) print `! code: message` without label or `bypass:` line, unlike status/invalidate/approve (blockerTextLines). Spec cli:change-edit does not require it, but inconsistent. Edit blockers come from validity, so skippable rarely applies.
- INFO: transition.ts:101/137 duplicate instanceof-or-name logic for CheckNotSkippableError rather than a shared helper (symmetry with item 1; behaviour correct).
- INFO: docs/core/errors.md describes TransitionFailureReason under "lifecycle transition" only; approve-spec also throws it for ineligibility (approve-spec.ts:120). Not wrong.

## Counts

HIGH 0, MEDIUM 1, LOW 2, INFO 2.
Per-spec implementation status: all nine specs implemented; no unimplemented requirements found this round.
