# Batch C compliance audit, round 2 (decouple-core-cli-workflow-guidance)

Scope: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source. Merged specs read via `changes spec-preview`. Read-only audit. CLI change/error/presenter test suites: 628/628 passing (vitest). ESLint not run (tool call blocked by hook).

## Round 1 fixes verified as holding

- Core messages: no CLI flags, `specd ...` commands, `/specd-*`, `Pass force`, `specs init`, `allowOutOfScope`, `skipChecks` remain in core/src non-comment code. Hints exist for VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (generate-metadata, validate), INVALIDATE_REQUIRES_FORCE, IMPLEMENTATION_DETECTED (draft, discard), HAPPY_PATH_NEXT_UNAVAILABLE, deps.consistent, hook CHECK_NOT_SKIPPABLE (cli/src/error-hints.ts:110-182).
- approve: `state:` line and `state` JSON field present (approve.ts:57,66,110,119); failure path projects `guidance:` (approve.ts:197-203).
- Drafted status blockers use `blockerTextLines` and `projectCliBlocker` (status.ts:199, 229); tests at status.spec.ts:2086-2160.
- Status/transition/approve help schemas now list intent/action/guidance/bypassFlag (status.ts:132-139; transition.ts:357-364; approve.ts:35-41).
- Skills templates: archive skill teaches `--skip-checks <checkId>`, aliases only as aliases, never-bypassable list, "no `bypass:` flag means cannot skip"; design/implement/verify/new only mention OVERLAP_CONFLICT as archive-only. Template tests present (template-workflow.spec.ts:235-263, template-lifecycle-consent.spec.ts:117-124).
- No raw core nextAction.command consumption anywhere in cli/src; every command goes through `projectCliNextAction`.

## Remaining / NEW discrepancies

### MEDIUM

M1. cli:change-archive "Error cases" (overlap bullet) vs implementation. Spec says archive overlap block "ends with `Use --skip-checks spec.overlap to proceed despite overlap.`", produced via presenter/hint helper. Implementation prints the generic `Retry with --skip-checks spec.overlap if an exception is granted` (packages/cli/src/commands/change/archive.ts:186-189, via `skippableCheckHint`); test locks that wording (packages/cli/test/commands/change/archive.spec.ts:626). The spec sentence is never produced anywhere (grep for "proceed despite" in cli/src finds nothing). Either fix code+test or amend spec to the generic hint (the spec's own generic bypass bullet uses the "Retry with..." form, so the two bullets contradict each other). Note: this overlap path bypasses `describeCheckFailure`/check-label lines; acceptable.

M2. cli:change-transition "Invalid transition error", bullet 3 + scenario "Guidance-only check action falls back to the next-action command". Scenario requires printing BOTH `guidance: pnpm audit:fix` (check action) AND `command: /specd-verify` (next action). Implementation (transition.ts:181-190) computes `cpCommand = action command ?? nextAction command`; if a next-action command exists, the check's guidance line is dropped (else-branch only). The test at transition.spec.ts:2024 only covers the nextAction-has-no-command case, and 2049 covers no-action; the dual-output scenario is untested. Fix: print guidance whenever the check action has guidance and no command mapping, then print fallback command separately.

M3. cli:change-verification "Success and idempotent output": spec says each JSON/TOON blocker mirrors text remediation with `action`, a presenter-projected `command` (`null` when the action has no mapping) and `guidance`. Implementation OMITS `command` when null/absent (verification.ts:285-296: `command !== undefined && command !== null ? { command } : {}`), and tests assert that omission (verification.spec.ts:471 `toBeUndefined`, :566 `'command' in ... false`). Direct spec/impl/test conflict; resolve by changing code+tests to emit `command: null` for actions without mapping, or amend spec to "omitted".

### LOW

L1. transition.ts:476-482 structured failure blockers spread raw core blocker (`...b`) plus `bypassFlag`, leaking raw `isSkippable` and not using `projectCliBlocker` as status/approve do. Inconsistent shape across commands (status drops `isSkippable`).
L2. transition.ts:172-190 text repair guide never prints the failed check's diagnostic `checkCode`; spec says render "failure message, diagnostic code, label". Code only appears if the same blocker is still in the fresh `GetStatus.blockers` (`! CODE — label`). Not covered by test. (test 1620 also passes message/code swapped in CheckPredicateFailedError ctor args.)
L3. status.ts:229 drafted JSON blockers use `projectCliBlocker`, which emits `action` when present; spec says `blocker.action` remains limited to non-draft results. Untested. Also status.ts:234 drafted JSON `artifacts: artifactStatuses` passes raw rows (no displayStatus -> effectiveStatus -> state fallback), unlike the active path (status.ts:518-534); "MUST NOT render undefined" is only guaranteed for active status.
L4. status.ts help schema: `schema.artifactDag` entry (line 132) lacks `optional`, `hasTasks`, `output` that the code emits; `lifecycle` block (140-143) omits `validTransitions`, `blockers`, `approvals`, `nextArtifact`, `changePath`, `schemaInfo`, `blockingArtifacts` on steps; blocker `isSkippable` not applicable. Spec requires "every field the structured output carries" (for the listed items it is satisfied; broader claim is not).
L5. approve.ts:38-41 and 91-93 help says "error payload additions: state, blockers, nextAction"; actual payload nests them under `metadata` (handle-error `extractErrorMetadata`; approve-failure.spec.ts:102 asserts `metadata.state`). Help blocker shape lists `{code,message,action?,bypassFlag?}` but `projectCliBlocker` also emits `label`, `checkId`, `details`; nextAction schema omits `actionType`.
L6. invalidate.ts:204/226 blockers rendered/serialized raw: no gerund `label` in text, no `bypassFlag`/`projectCliBlocker` projection (raw `isSkippable` leaks into JSON). Not required by cli:change-invalidate, but inconsistent with status/approve. invalidate.ts:237-240 prints a hard-coded `... Re-run with --force.` warning AND handleError then prints the resolved `force.revoke-consent` hint, so `--force` guidance is duplicated and the first copy is a literal in the command instead of the hint helper.
L7. core/src/domain/errors/historical-implementation-guard-error.ts:41 message contains "without force" (descriptive, not imperative; hint exists for draft/discard). Borderline against the "bare input name" rule; consider rewording to "without explicit confirmation".
L8. DEPENDS_ON_OVERWRITE hint rules exist only for `specs.generate-metadata` and `specs.validate` (error-hints.ts:111-120); any other CLI surface that propagates `DependsOnOverwriteError` (generate-metadata use case is also reachable from other flows) would show the confirmation-required message with no recovery hint. Spec says every such code MUST have a matching CLI hint; not verified exhaustively.
L9. skills shared.md.tpl:146-153 documents `nextAction` fields (`command` "exact CLI or skill command") but not `intent`, `action`, or `guidance`/`command: null` fallback; no spec requirement, but agents will meet `command: null` + `guidance` now. Optional doc improvement.

## Untested scenarios (no matching test found)

- transition: guidance-only check action WITH a next-action command (both lines) (see M2); mandatory-check text repair guide `hint:` branch for non-hint checks; diagnostic code rendering (L2).
- status: drafted `blocker.action` not leaked (L3); drafted artifacts display-status fallback; `--help` documenting `availableSteps[].optional` is not asserted by name (help test 2197 asserts intent/action/guidance/bypassFlag only); "Discarded name not found" (core-level, not in CLI test).
- archive: spec's overlap sentence `Use --skip-checks spec.overlap to proceed despite overlap.` (M1; test asserts different wording).
- verification: blocker `command: null` in JSON (M3; tests assert the opposite).
- approve: help text asserting bound-`from` language (`ready` / `done` example); only description strings, no test.
- invalidate: nextAction `action`/`intent` exposure for non-null `action` in JSON; guidance-only blocker remediation.

## Project-wide specs (project context)

Global specs: architecture, conventions, cross-platform, docs, eslint, logging, testing, error-handling-conventions. No contradictions found with the change beyond the item above; docs/ were updated (docs/cli/cli-reference.md etc. are modified). Project context warnings are only stale LLM-optimization notices, unrelated.

## Counts

MEDIUM 3 (M1-M3), LOW 9 (L1-L9), HIGH 0. Round 1 findings: all verified fixed except wording of the archive overlap sentence now conflicting with spec text (M1).
