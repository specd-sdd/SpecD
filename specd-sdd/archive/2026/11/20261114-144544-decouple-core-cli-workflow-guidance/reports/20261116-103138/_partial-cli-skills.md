# Partial compliance audit: CLI, skills, global error-handling (decouple-core-cli-workflow-guidance)

Method: merged spec content via `spec-preview`; read `packages/cli/src/guidance-presenter.ts`, `commands/change/{status,transition,archive,approve,invalidate,edit,verification}.ts`, `packages/skills/templates/**`, and the corresponding tests. Ran `vitest` for `packages/cli/test/guidance-presenter.spec.ts` + `test/commands/change` (518 passed, 0 failed) and `packages/skills` template-workflow/protocol specs (55 passed).
Scope note: where a spec lists many pre-existing requirements, only those touched by the change (presenter projection, bypass flags, intent/action exposure, in-place approval gates, host-neutral projections) were audited in depth; unchanged requirements were spot-checked against existing tests.

Presenter (`packages/cli/src/guidance-presenter.ts`): `resolveCliWorkflowCommand` (L27-65: intent first, then `approve-spec`, `approve-signoff`, `redesign-spec`, `start-verification`, `refresh-status` with real changeName, default = `action.guidance ?? null`), `resolveCliBypassFlag` (L84-93, requires `isSkippable===true` and non-empty `checkId`), `projectCliNextAction` (L115-140, appends ` Use --skip-checks <id> to archive anyway.` only for `intent==='archive'` + skippable `OVERLAP_CONFLICT`), `describeCheckFailure`. All consistent with the spec text.

---

## 1. cli:change-status

### Requirements Summary

Touched requirements: "Archive bypass hints come from resolved bindings" (bypass line / `bypassFlag`, overlap reason suffix, command projection from `intent`/`action`, additive `intent`/`action`/`blocker.action` for non-draft, drafted suppresses command/intent/action); "Drafted change status is read-only"; "Lifecycle projections come from GetStatus checks"; others unchanged.

### Implementation Status

- Text blockers + bypass line: `status.ts:268-279` (`    bypass: --skip-checks <id>` via `resolveCliBypassFlag`). OK.
- Next action projection (text): `status.ts:305-312`. OK.
- JSON/TOON: `status.ts:454-481` blockers carry `label`, `checkId`, `action`, `bypassFlag` (only when presenter returns one); `nextAction` = `{targetStep, actionType, reason, command, intent, action?}`. OK.
- Drafted: `status.ts:145-205` builds `nextAction` with `command: null` and only targetStep/actionType/reason (no intent/action leaks); `availableTransitions: []`, `availableSteps: []`, no DAG. OK.
- Overlap suffix only appended if `intent==='archive'`, skippable, and not already included. OK; locked/hardened blockers get nothing.

### Discrepancies

- minor: Drafted JSON/TOON emits `blockers: statusResult.blockers` raw (`status.ts:~198`), bypassing the blocker projection used for active changes. Blockers there may carry Core `isSkippable`, `details`, and `action` but never `bypassFlag`. Spec says `blocker.action`/`bypassFlag` are exposed "for non-draft results"; for drafts it is unspecified. Not a scenario failure (spec only requires nextAction not leaking). Either tighten the spec ("drafted blockers are passed through unprojected") or project them consistently.
- minor: "Unknown action kind: shows the guidance and invents no command". Implementation puts the guidance string into the `command:` field (text `command: Run the audit fixer`, JSON `nextAction.command`). The spec text for status is satisfied ("resolves to its host-neutral guidance or no command"), but the presenter conflates "command" and "guidance" (see verification spec below where the spec says "guidance and no command").
- minor (spec wording): "bypass: line directly under the blocker" holds, but the spec also says the CLI "MUST NOT filter ... locally"; presenter does not. No issue.

### Test Coverage (status.spec.ts)

Covered: bypass line text + multi-blocker + locked (L1877-1889), no bypass when not skippable (L1891), JSON/TOON `bypassFlag` exactly when text (L1900-1915), disabled overlap (L1917), drafted JSON empties hops/command null (L77-109), drafted text (L111-143), intent `verify` -> `/specd-verify` (L1147), presenter unit tests incl. overlap suffix for skippable and locked (`guidance-presenter.spec.ts` L75-117).

### Missing Tests (weak/absent)

1. "Gate action is rendered as a command" (`intent:null, action approve-spec` -> `specd changes approve spec`) at status command level: absent (only unit-tested in presenter spec).
2. "Stale approval is rendered as redesign" (`redesign-spec` -> `/specd-design`) at command level: absent.
3. "Intent wins over an informational action" at command level: absent (presenter unit test covers it, L26).
4. "Structured output exposes intent and action additively" (`nextAction.intent`, `nextAction.action`, `blocker.action` in JSON and TOON): no assertion found (status.spec L1485 only mocks a `start-verification` action for text validity).
5. "Drafted status does not leak intent or action": the drafted tests' mock `nextAction` has no `intent`/`action`, and no assertion that the keys are absent. Weak: the test would pass even if the code spread `statusResult.nextAction`. Add a mock with `intent: 'design'` + `action` and assert `'intent' in nextAction === false`.
6. "Unknown plugin action falls back to guidance" at command level: absent.
7. Overlap `reason` suffix through the status command ("Core reason carries no flag; CLI-projected reason ends with `Use --skip-checks spec.overlap to archive anyway.`"): the status test `archivable()` helper uses reason `'Ready to archive'` and never asserts the suffix; "Schema-hardened overlap: next-action reason does not suggest one" is also asserted only via `not.toContain('--skip-checks')` at L1891 (OK) but the positive suffix case is missing.
8. "Plugin archive check follows resolved skippability" (`@security.code-scan` blocker bypass in status): absent (generic bypass tests use built-in ids only).
9. "Missing display status falls back": exists (L249).

### Counts

Scenarios audited (decouple-related): 18. Satisfied by code: 18. Directly tested at command level: 9. Not (or weakly) tested at command level: 9 (items 1-8 above).
Verdict: PASS (implementation satisfies all scenarios; test gaps only).

---

## 2. cli:change-transition

### Requirements Summary

"Validity-aware transition guidance" (project `--skip-checks <checkId>` from `blocker.isSkippable` + `checkId`, project `nextAction.command` from intent/action via presenter, real change name); "Invalid transition error" (`CheckPredicateFailedError` repair guide, `command:` from check `action` via presenter, `Retry with --skip-checks <id> if an exception is granted` when skippable, none when mandatory); "CLI-rendered transition error hints".

### Implementation Status

- `transition.ts:164-212` `writeTextRepairGuide`: next action via `projectCliNextAction(status.nextAction, status.blockers)`; for `CheckPredicateFailedError` command = `resolveCliWorkflowCommand(null, cpErr.action) ?? projectedNextAction?.command` (L180); skippable bypass from hint helper or fallback `Retry with --skip-checks <id> if an exception is granted` (L184-193); non-check errors use `resolveCliBypassFlag` on the first skippable blocker (L205-212).
- Structured failure record: `transition.ts:440-490` projects `bypassFlag` on every blocker and `nextAction` with `command`, `intent`, `action`. OK.
- `HappyPathNextUnavailableError` hint via `resolveCliErrorHint` (L141-148, L455-462). OK.

### Discrepancies

- minor (spec internal tension): "Invalid transition error" requires the exact text `Retry with --skip-checks <id> if an exception is granted`, but "CLI-rendered transition error hints" requires the centralized helper for `impl.linksInScope`, which yields `Re-run with --skip-checks impl.linksInScope (or --allow-out-of-scope) if intentional` (`error-hints.ts:89`; asserted in `transition.spec.ts:1643`). Code follows the more specific requirement; the generic one should say "for checks without a dedicated hint". Same applies to archive.
- minor: Non-`CheckPredicateFailed` repair guide shows the bypass for only the first skippable blocker (`blockers.find`, L206), while `status` shows one per blocker. Spec scenario only needs one; consider listing each.
- minor: Command fallback (L180) `?? projectedNextAction?.command` can print a next-action command (e.g. `/specd-design`) under a check failure that declared no action. Spec says "if the failed check declared an action ... command from it"; the fallback is an extension, not contradicted.

### Test Coverage

Covered: repair guide with check label/command/bypass for a skippable `CheckPredicateFailedError` (L1613, L1735), mandatory check omits bypass (L1647), approve-signoff command (L858), `design`/`verify` next-action commands (L1313, L1460), HappyPath structured hint (L889), `--skip-checks` parsing.

### Missing Tests

1. "Missing approval shows the projected approval command" for `approval.spec`/`approve-spec`: the test at L280-335 (and L388) sets up the exact error but never asserts `command: specd changes approve spec` or the absence of `bypass:`.
2. "Repair guide projects bypass flag from isSkippable and checkId" (blocker-driven path, L205-212 and structured `bypassFlag` L469): no test; `grep 'Retry with'` only hits CheckPredicate cases.
3. "Repair command uses the real change name" (`start-verification` with `params.changeName`) in transition: not tested (only in status/presenter).
4. Structured failure record exposing `intent`/`action`: no assertion.
5. "Committed recovery is not rendered as an edge error": covered only indirectly by L1460.

### Counts

Scenarios audited (decouple-related): 9. Satisfied: 9. Tested: 5. Untested/weak: 4.
Verdict: PASS.

---

## 3. cli:change-invalidate

### Requirements Summary

"Reporting": `nextAction.command` projected from Core's `intent` (and optional `action`) via presenter; JSON/TOON expose `reason`.

### Implementation Status

`invalidate.ts:113-127` wraps `projectCliNextAction(rawNextAction)` and adds `intent` and `action` for text/json/toon (text prints the same projected command). Same pattern in `edit.ts:100-112` (not part of this spec). OK.

### Discrepancies

- none (minor: `rawNextAction.intent` is spread unconditionally; if a Core result ever lacks `intent` it serializes as `undefined`, but the core type requires it).

### Test Coverage / Missing Tests

- The existing invalidate tests (`change-invalidate.spec.ts:76-117`) mock `nextAction` in the old shape (`command: null`, no `intent`) and assert only `targetStep`. Nothing asserts "Recovery output names committed state ... `nextAction.command` is projected from `intent`" in text, JSON, or TOON. Missing: a test with `intent: 'design'` asserting `command: /specd-design` plus `intent` exposure, and that a mocked Core `command` field is ignored. Also, the old-shape mock no longer matches the Core type (stale mock).

### Counts

Scenarios audited: 3 (Recovery output names committed state, Structured success preserves reason, Preserve output reports blockers). Satisfied: 3. Presenter projection tested at command level: 0 of 1.
Verdict: PASS (test gap: major-ish for traceability, not a failing scenario).

---

## 4. cli:change-verification

### Requirements Summary

Start/complete MUST NOT synthesize a next action; invalidate renders Core's next action via presenter, exposes `intent`/`action`; blocker remediation `start-verification` resolves with real `changeName`, falls back to guidance when `params.changeName` is missing ("shows the guidance text and no command").

### Implementation Status

- `verification.ts:232` only `renderInvalidate` builds `nextAction`; start/complete have none. OK.
- `verification.ts:296-309` `projectNextAction`: presenter command + `intent: value.intent ?? null` + `action`. OK.
- `verification.ts:268-285` JSON blocker: `{code, message, action?, command?}` where `command = resolveCliWorkflowCommand(null, action)`.
- Text mode blocker lines (`verification.ts:246-250`) print only `! code: message`; the remediation command/guidance of a blocker is not rendered in text.

### Discrepancies

- minor: "Missing changeName falls back to guidance: shows the guidance text and no command". `resolveCliWorkflowCommand` returns the guidance string as the command, so JSON blockers get `command: 'Start a new verification attempt'`, i.e. guidance appears in the `command` field. Spec may be wrong (collapse to "command or guidance") or code wrong (separate `guidance` field and omit `command`). Same conflation as status.
- minor: Spec scenario "Verification remediation uses the real change name ... the CLI renders the remediation": text mode never renders blocker remediation (only JSON/TOON include `command`), and `command` on blockers is an undocumented additive field (spec only names `intent`/`action`/`command` for `nextAction`).

### Test Coverage

`verification.spec.ts:354-410` asserts the invalidate `nextAction` JSON including `command: '/specd-verify'` and `intent: 'verify'` (good, also checks private fields stripped). Persisted-reason test covers text/json/toon.

### Missing Tests

1. Blocker remediation with `start-verification` + `changeName` (no `<name>` placeholder).
2. Missing `changeName` fallback to guidance.
3. Assert start/complete outputs contain no `nextAction` (partially implied by the "does not invent one" scenario; `verification.spec.ts:70-135` does not assert absence).
4. Text-mode `command:` projection for invalidate (L354 loops text/json/toon but only asserts the JSON-structured shape; check text includes `/specd-verify`).

### Counts

Scenarios audited: 5 (structured output, persisted reason, command from presenter, real changeName, missing changeName). Satisfied by code: 4 fully, 1 partially (missing-changeName semantics, and text-mode remediation rendering). Tested: 2.
Verdict: PASS (no scenario outright unsatisfied; ambiguity on "no command").

---

## 5. cli:change-archive

### Requirements Summary

"Error cases"/"Check progress rendering": check failures report id/label/message + `details` context + check-declared `action` projected by presenter; skippable -> `bypass:  Retry with --skip-checks <id> if an exception is granted`; overlap error ends with `Use --skip-checks spec.overlap to proceed despite overlap.` when skippable; non-skippable -> no bypass; stale verification suggests the action projected from `start-verification`.

### Implementation Status

`archive.ts:166-215`: overlap path prints `Use --skip-checks spec.overlap ...` only when `err.skippable === true`; generic path: `cpCommand = resolveCliWorkflowCommand(null, err.action)`, `describeCheckFailure(err)` detail lines, bypass vs hint by `err.skippable`. Command line is printed when non-null. OK.

### Discrepancies

- minor: same Retry/Re-run tension as transition (hint helper wins for `impl.linksInScope`).
- minor: in the overlap branch (`archive.ts:~170-190`) an overlap failure with a declared `action` prints no `command:`; spec only requires the action projection in the generic case. Fine.
- minor: Text-only: `opts.format === 'text'` gates the repair formatting; JSON path relies on `handleError` and does not include the projected `command` from `action` (spec scenario "Plugin check failure in structured output" only requires code + exit code). Not a failure.

### Test Coverage (archive.spec.ts)

Covered: skippable overlap suggests bypass (L604), not skippable no suggestion (L629), plugin failure prints check/command/bypass (L687), non-skippable plugin no bypass (L702), JSON structured (L713, L652), impl.linksInScope hint (L725), `--skip-checks` parsing/dedupe/alias/hooks (L422-533), unknown/non-skippable/hook ids (L536-579).

### Missing Tests

1. "Stale verification suggests the verification action" (`verification.current` with `start-verification` action -> command with real change name): absent (grep for `start-verification` / `verification.current` in archive.spec.ts finds nothing).
2. "Dependency mismatch lists every mismatching spec" and "Read-only workspace lists affected specs" through the archive command (`describeCheckFailure` is unit-tested, but not wired-through for archive; `workspace.readOnly` appears only as a `CheckNotSkippableError` id at L582).

### Counts

Scenarios audited (decouple-related): 6. Satisfied: 6. Tested: 4. Untested: 2 (+ deps/readOnly render path).
Verdict: PASS.

---

## 6. cli:change-approve

### Requirements Summary

Approval failure reloads canonical status and renders actual state/blockers/next action; no stale pre-operation state.

### Implementation Status

`approve.ts:~139-175` `enrichApprovalFailure` calls `status.execute({name})` and projects `projectCliNextAction(status.nextAction, status.blockers)` plus `intent`/`action`; falls back to original error on reload failure. OK.

### Discrepancies

- none. (Observation: if status reload throws, the original error is rendered without context, consistent with code comment and acceptable.)

### Test Coverage / Missing Tests

`approve.spec.ts:203-234` covers text rendering (`next action: /specd-design` from `intent: 'design'`). Missing: JSON/TOON variants of the failure record (spec scenario "text, JSON, and TOON include actual state, blockers, and next action"), and an `action`-driven command (e.g. `specd changes approve spec`).

### Counts

Scenarios audited: 2. Satisfied: 2. Tested: 1 fully (text), 1 partial (json/toon not asserted).
Verdict: PASS.

---

## 7. skills:skill-templates-source

### Requirements Summary

Changed requirement: "In-place approval gates in workflow templates" (8 scenarios incl. new drain-state acceptance by `specd-implement`; routing table in `specd-new` drain-only rows). Related unchanged: overlap vs invalidation, archive bypass teaching (`--skip-checks <checkId>`, aliases, locked checks).

### Implementation Status (templates verified)

- `shared.md.tpl:482` pending states only as drain; `shared.md.tpl:~603` forbids listing pending states as happy-path intermediates; "stays in ready or done" copy present.
- `specd-verify`: stays in `done`, `approve signoff` (L424), no `pending-signoff`.
- `specd-design`: stays in `ready`, `approve spec` (L111, L461), no pending reference.
- `specd-implement` (L80-92): accepts `ready`/`pending-spec-approval`/`spec-approved`; no consent -> "stay in place", tells user to run `approve spec`, "Do **not** `transition implementing`"; with consent transitions.
- `specd-new` (L148-155): drain-only rows for `pending-signoff`/`pending-spec-approval` with matching approve command and "otherwise follow `nextAction`".
- `specd-archive` (L5-12): requires `archivable`/`archiving`, signoff wait is `/specd-verify` in `done`; bypass copy L29, L219-235 teaches `--skip-checks <checkId>` and aliases only as aliases, `--skip-hooks pre`.
- `specd` entry skill: no `approve`/`signoff`/`pending` text (grep returned none).
- Templates still tell agents to follow `nextAction.command` (design L59/L457, implement L40/L332, verify L45/L99/L333/L428/L465, archive L43, new L134). Consistent: the CLI keeps `nextAction.command` in JSON/TOON for compatibility.

### Discrepancies

- none blocking. minor: The templates reference `nextAction.command` and slash commands, which is the CLI-projected contract; if SDK/MCP hosts consume the same templates they would not have `command`. Not required by the spec as written.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts:124-166` covers verify/implement/shared/new/design/entry/archive scenarios (absence of pending-happy-path copy, presence of stay-in-state and approve copy, drain acceptance), `template-protocol.spec.ts`, `generated-skill-protocol.spec.ts`. All pass (55).

### Missing Tests

- Weak: "Hook list does not walk pending as happy-path intermediates" is asserted only via a single `toContain('Do **not**\nlist ...')` string match that is whitespace-sensitive (`template-workflow.spec.ts:141`); a re-wrap of the template would break it without changing meaning.
- "Implement skill accepts pending-spec-approval after consent": test asserts only that the strings appear (L133-135), not the with/without-consent split.
- The new archive-bypass teaching scenarios ("Archive skill teaches the canonical check bypass", "does not suggest bypassing a blocker without a flag", naming `workspace.readOnly`, `impl.filesResolved`, `deps.consistent`): the template is correct (archive L219-235) but I did not find a dedicated assertion for `--skip-checks <checkId>` / aliases / never-bypassable names in `template-workflow.spec.ts`; recommend adding.

### Counts

Scenarios audited (in-place gates 9, overlap/bypass 4): 13. Satisfied: 13. Tested: 9 directly, 4 weak/untested.
Verdict: PASS.

---

## 8. default:\_global/error-handling-conventions

### Requirements Summary

New "Host-Neutral Core Projections": non-error core models (next actions, blockers, check results, validity) MUST NOT embed `specd ...`, flags such as `--skip-checks`, or `/specd-*`; guidance is `intent`/`action`/`isSkippable`+`checkId`; hosts fall back to `guidance` for unknown kinds. Existing "Host-Neutral Core Errors and Delivery Hints" covers error messages (flags and `specd ...` CLI syntax).

### Implementation Status

- Grep of `packages/core/src`, `packages/sdk/src`, `packages/mcp/src` for `specd (change|changes|project|graph|spec) `, `/specd-(design|implement|verify|archive|new)`, `--skip-checks`, `--force`, `--allow-`, `--next`, `--skip-hooks` in non-comment code finds only: `core/.../errors/verification-stale-error.ts:16` and `sdk/src/presentation/_shared/catalogue.ts:40`. No leaks in `lifecycle-guidance.ts`, `lifecycle-evaluation.ts`, `get-status.ts`, or `application/checks/*`.
- CLI side: single presenter; no command strings elsewhere in `commands/change/*` besides presenter, `error-hints.ts` (allowed: CLI hint layer), `validate.ts` (CLI-authored spec-preview hint text) and archive overlap suffix (CLI).

### Discrepancies

- minor (already noted): `VerificationStaleError` message `Verification for change '<name>' is stale; run /specd-verify before sign-off` (core `verification-stale-error.ts:16`). Does the global spec require otherwise? Literally, the Errors requirement bans flags and "CLI command syntax (such as `specd ...`)", and the new Projections requirement exempts errors ("Non-error"). A `/specd-verify` slash command is agent-delivery syntax, so it violates the intent of the Errors requirement ("MUST NOT embed delivery-mechanism flags ... or CLI command syntax") though not its literal examples. The CLI has no `VERIFICATION_STALE` hint in `error-hints.ts` (grep: 0 matches), so the slash command reaches users verbatim. Fix options: reword to host-neutral text ("run verification before sign-off") and add a CLI hint, or widen the spec to name slash commands explicitly for errors.
- minor: `core/.../use-cases/get-status.ts:963` JSDoc comment still says `nextAction` remains `/specd-implement` (comment only; stale vs the intent model).
- minor (out of core scope): `sdk/src/presentation/_shared/catalogue.ts:40` embeds `specd changes spec-preview ...` in an SDK catalogue string. The spec's host list includes `@specd/sdk callers` as translators, and the SDK is not `@specd/core`, so no violation; mentioned for awareness.

### Test Coverage

Presenter unit tests cover unknown-kind fallback to guidance (`guidance-presenter.spec.ts:46-61`). Core-side "projections omit delivery syntax" is outside my assigned test dirs; no CLI-side test asserts it. I did not find a CLI/core test that greps projections for `specd `/`--skip-checks`/`/specd-`.

### Missing Tests

- A core-level contract test asserting `NextAction`/`Blocker`/`CheckResult`/validity from `GetStatus` contain no `specd `, `--`, or `/specd-` strings (scenario "Core projections omit delivery syntax").
- MCP mapping scenario (`@specd/mcp MAY map...`) is MAY-level; no test expected.

### Counts

Scenarios audited: 3 (omit delivery syntax, host translates, unknown kind falls back). Satisfied: 3 (code level). Tested: 2 (translate, unknown-kind via presenter unit tests); 1 untested (omit delivery syntax).
Verdict: PASS.

---

## Overall

| Spec                                        | Scenarios audited | Satisfied     | Tested at command level | Verdict |
| ------------------------------------------- | ----------------- | ------------- | ----------------------- | ------- |
| cli:change-status                           | 18                | 18            | 9                       | PASS    |
| cli:change-transition                       | 9                 | 9             | 5                       | PASS    |
| cli:change-invalidate                       | 3                 | 3             | 2 (projection untested) | PASS    |
| cli:change-verification                     | 5                 | 4 + 1 partial | 2                       | PASS    |
| cli:change-archive                          | 6                 | 6             | 4                       | PASS    |
| cli:change-approve                          | 2                 | 2             | 1.5                     | PASS    |
| skills:skill-templates-source               | 13                | 13            | 9                       | PASS    |
| default:\_global/error-handling-conventions | 3                 | 3             | 2                       | PASS    |

Totals: blockers 0, majors 0, minors ~14 (listed above), missing/weak tests ~30 (mostly command-level traceability for presenter projection scenarios).
Overall verdict: PASS (no scenario is genuinely unsatisfied). Highest-value follow-ups:

1. Add command-level tests for presenter-driven scenarios in status (gate action, redesign, intent-wins, unknown plugin guidance, additive intent/action, drafted no-leak with intent in the mock, overlap reason suffix) and transition (`approve-spec` command, blocker-driven bypass), invalidate (intent -> command), archive (stale verification action), approve (JSON/TOON).
2. Reword `VerificationStaleError` to host-neutral text (and add a CLI hint) or widen the spec to include slash commands for errors.
3. Resolve the spec tension "Retry with --skip-checks <id>..." vs hint-helper `Re-run with ... (or --allow-out-of-scope)` for `impl.linksInScope`.
4. Decide semantics for "guidance and no command": either split `guidance` from `command` in the presenter or relax the verification spec wording.
5. Add a core contract test for host-neutral projections.
