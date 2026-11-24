# Batch E compliance audit: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve

Change: decouple-core-cli-workflow-guidance. Read-only audit. Specs fetched via `changes spec-preview`.
Key implementation files: packages/cli/src/guidance-presenter.ts (new), packages/cli/src/commands/change/{status,transition,invalidate,verification,archive,approve}.ts, packages/cli/src/error-hints.ts, packages/cli/src/handle-error.ts. Tests: packages/cli/test/commands/change/\*.spec.ts, packages/cli/test/guidance-presenter.spec.ts, packages/cli/test/error-hints.spec.ts.

Cross-cutting check: `grep -rnE "--skip-checks|--force|--allow-overlap|--allow-out|/specd-(design|implement|verify|archive|new)|specd changes? <verb>" packages/core/src` returns NO matches outside comments. Core is clean of CLI/skill strings; all projection lives in guidance-presenter.ts.

Cross-cutting discrepancy (SPEC vs SPEC, affects transition + archive + status): see D-T1 below.

---

## 1. cli:change-status

### Requirements Summary

Signature; drafted read-only; output format (hasTasks, drift-aware state); task completion in DAG; display-state rendering; lifecycle projections from GetStatus (ordering, [optional], disabled omitted, DAG from sovereign schema); reconciled validity/next-action; text omits duplicated review file lists; blocker check labels; bypass hints from resolved bindings + intent/action presenter; schema version warning; not found; schema-derived fields (DAG via childrenOf, no convergent repeats); delegates refresh to GetStatus; implementation section (SDK projection); task counts in details; basic info; specs and dependencies; stable display status + drafted JSON compat.

### Implementation Status

- Command signature: OK (status.ts:84-91).
- Drafted read-only: OK. draftView branch status.ts:145-208; command forced `null` (:152), JSON `availableTransitions: []`, `availableSteps: []` (:199-200), no intent/action on nextAction (:148-153), no DAG. PARTIAL nit: drafted text blockers omit `label` form (status.ts:168 prints `! code: message` only; spec "Text blockers include check labels" applies to "a blocker ... carrying label").
- Output format (hasTasks / drift-aware state): OK (status.ts:496-500, uses displayStatus).
- Task completion in DAG / details: OK (status.ts:641-647, 400-406).
- Display-state rendering: OK (status.ts:399, 636, 508; stateSymbols maps complete-with-drift).
- Lifecycle projections from GetStatus: OK. Transitions/steps printed straight from `lifecycle` (status.ts:319-328); `[optional]` annotation :325; `optional` exposed in JSON :544; no local VALID_TRANSITIONS filter. PARTIAL: `--help` JSON schema documents `optional` on availableSteps (status.ts:108) but only for the legacy top-level shape; active JSON puts it under `lifecycle` (documented :109-112, includes optional) OK.
- DAG from sovereign schema: OK (status.ts:242-243 resolveChangeSchemaForCli + `schema.artifactDag()`); fallback to `ArchiveDag.from(schemaInfo.artifacts)` only when schema lacks methods (:71-74) - minor, schemaInfo is the change's own, not workspace default. Unresolved-schema case: DAG omitted when `lifecycle.schemaInfo === null` (:241); blocker comes from GetStatus (not independently verified in core; out of batch).
- Reconciled validity/next-action: OK/PARTIAL. validityTextLines + publicValidity (\_validity-present.ts:268-300) show states, recovery, blockers, fingerprintIssues, projectionChanges. Fingerprint issues rendered as diagnostics (not blockers) - OK.
- Text omits duplicated review lists: OK (status.ts:284-293 prints header+message, no affectedArtifacts; overlap peers :382-394; OVERLAP_CONFLICT filtered :262-265). JSON keeps full review incl. overlapDetail (:522-536). Help lists overlapDetail (:127).
- Text blockers include check labels: OK (status.ts:271-275); JSON label/checkId :466-467.
- Bypass hints from resolved bindings: OK. `resolveCliBypassFlag` (guidance-presenter.ts:95-104) requires isSkippable===true and checkId; text `    bypass: ...` (status.ts:276-279); JSON `bypassFlag` (:461,469). Overlap suffix ` Use --skip-checks <id> to archive anyway.` only for intent==='archive' and skippable OVERLAP_CONFLICT (guidance-presenter.ts:136-144).
- intent/action -> command presenter: OK. INTENT_COMMANDS and switch (guidance-presenter.ts:18-64) match spec exactly; unknown kinds / missing changeName -> null + separate guidance (:73-81). JSON exposes command, guidance, intent, action (status.ts:472-483), blocker.action (:468). Text prints `guidance:` line only when command null (:311-313).
- Schema version warning: OK (status.ts:296-303, :459).
- Change not found: OK via handleError.
- Schema-derived fields: OK (status.ts:427-447; childrenOf; topologicalOrder; roots()). Convergent nodes rendered once via `visited` set (:618-630).
- Delegates refresh to GetStatus: OK (single `status.execute({name})`, status.ts:141).
- Implementation section: OK via `enrichImplementationTracking` (status.ts:214, 337-380) - not deep-audited (sdk spec, other batch).
- Basic info / specs and deps: OK (:223-259; no `specs:` line). JSON specDependsOn :484.
- Stable display status fallback: OK (:399, 408, 497, 508, 515).

### Discrepancies

- D-S1 (LOW) `--help` JSON schema is stale vs behaviour. status.ts:104-105 documents blockers without `bypassFlag`/`action` and nextAction as `{targetStep, actionType, reason, command}` without `intent`, `action`, `guidance`. Spec requires these additive fields in output (all present in code, status.ts:468-482). Either update help text (likely: spec "Structured output exposes intent and action additively" implies they are a documented surface) or spec need not require help documentation (spec only requires help docs for `optional` and `overlapDetail`, both present). Not a spec violation; documentation gap.
- D-S2 (LOW) Drafted text omits blocker `label`; drafted JSON passes raw `statusResult.blockers` (status.ts:198), which would carry `action`/`isSkippable`/`checkId` for drafts although spec limits `blocker.action` to non-draft results. Either tighten drafted projection (spec) or relax spec (code passes core blocker through).
- D-S3 (LOW) Spec "Plugin archive check follows its resolved skippability" and "Gate action" scenarios exist in tests only at presenter/status level; OK.

### Test Coverage (status.spec.ts, guidance-presenter.spec.ts)

Covered: help overlapDetail/artifactDag (68), drafted JSON/text (77,111), missing name, labels (327, 1175), DAG children (445), hasTasks/drift state (516), schema advisories (718-744), DAG from change schema (755), unknown change (775), overlap review text (789-955), task counts (1047), omit verifying (1120), nextAction verify (1147), omit duplicated review paths (1210, 1270), validity/fingerprint diagnostics (1440, 1535), pipeline order + disabled + [optional] (1612, 1657), bypass text/JSON/TOON incl. locked + hardened (1877-1917), gate action (1949), intent beats action (1963), guidance for unknown plugin in text/json/toon (1976), no leak on draft (1990).

### Missing Tests

- Overlap-reason suffix `Use --skip-checks spec.overlap to archive anyway.` at status level (only presenter spec :112 covers it).
- Text DAG convergent-node dedup (`design` once) - no test found (grep for convergent/appears-once: none).
- "Different workspace default is not drift" scenario (no explicit test).
- Drafted JSON when Core leaks `availableSteps`/`availableTransitions`: test 77 does leak transitions+steps, covered.
- Missing displayStatus in JSON (text covered at 249; JSON not).
- `--implementation` shared SDK projection parity scenario (reexport/hierarchy/ambiguity) - only generic render test 560.
- Plugin archive check `@security.code-scan` skippable true/false status scenario (not explicit).
- `[hasTasks]` fallback vs `[hasTasks - N/M done]` DAG tag (renders test 994 may cover; not confirmed).

### Summary counts

Requirements 21: OK 19, PARTIAL 2 (drafted blocker label/leak; help schema doc), MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~7.

---

## 2. cli:change-transition

### Requirements Summary

Signature + --skip-checks + legacy alias translation; next resolution via `to:'next'`; CLI-rendered hints; validity-aware guidance with presenter-projected bypass/next command; refresh policy; approval-gate routing; hooks; progress output (check bus, `change-transition` stream); hook observability; shared presenter; success output; post-hook failure; invalid transition error -> Repair Guide (label, code, from/to, details, action command, bypass); incomplete tasks; check progress rendering; unsatisfied requires.

### Implementation Status

- Signature/validation: OK (transition.ts:330-353, 236-252; error strings exact). Alias translation :396-401, passes `skipChecks: Array.from(...)` :428. Extra: invalid step name rejected with state list (:249-251) - beyond spec, harmless.
- Next resolution: OK (`to: 'next'`, :414-415, no local table).
- CLI-rendered hints: OK (transition.ts:138-143, 191-207; error-hints.ts `skippableCheckHint` generic, no `--allow-out-of-scope`).
- Validity-aware guidance: OK. Repair guide uses fresh GetStatus (:451-454), `projectCliNextAction` (:168-171, 473-476), `resolveCliBypassFlag` (:215-221, 478-483), validity lines :159-164. No retry/alternate transition.
- Refresh policy: OK (`refreshImplementationTracking:false` at :407 and :453).
- Approval gate routing: OK (no gate flags in execute input :423-429).
- Hook execution mapping: OK (:382-385, 427).
- Progress output / check bus / stream names: OK (makeProgressRenderer :264-321 -> createCheckProgressPresenter, streamName 'change-transition'; stdout for structured, stderr for text).
- Success output: OK (:433-448).
- Invalid transition error (Repair Guide): PARTIAL. Label+code (:174), from/to hop (:175-177), per-check details via describeCheckFailure (:178-180), bypass hint only when skippable (:191-198), no bypass otherwise (:199-208). Action rendering: command via presenter when mappable (:181-184) else `guidance:` line (:185-189) - see D-T1.
- Incomplete tasks error: OK (describeCheckFailure `workflow.taskCompletion` guidance-presenter.ts:189-203).
- Check progress rendering: OK (presenter; tests check-progress-presenter.spec.ts:39-59 for skipped markers). "Re-checking after hooks" heading not re-verified here.
- Unsatisfied requires: OK (workflow.requires details, guidance-presenter.ts:168-188).

### Discrepancies

- D-T1 (MEDIUM, SPEC vs SPEC) verify.md scenario "CheckPredicateFailedError renders Repair Guide with command and bypass" expects `displays command: pnpm audit:fix` for an action `{ kind:'@security.fix', guidance:'pnpm audit:fix' }`. This contradicts spec.md of cli:change-status (presenter MUST NOT place guidance prose in `command`; unknown kind -> `command: null` + separate `guidance`), cli:change-verification (same), and the transition spec.md own text ("command projected ... by the guidance presenter under the `command:` field" - null for unknown kinds). Code (transition.ts:185-189) and tests (transition.spec.ts:1633-1634, 1818-1819: expects `guidance: ...` and `not.toContain('command: ...')`) follow the presenter rule. Possibility A (code right): verify.md scenario is stale pre-change text; fix verify.md to expect `guidance: pnpm audit:fix`. Possibility B (spec right): code would need to print guidance under `command:`, which violates the change theme and the other three specs. Recommend A.
- D-T2 (LOW) In the CheckPredicateFailedError branch, `cpCommand = resolveCliWorkflowCommand(null, cpErr.action) ?? projectedNextAction?.command` (transition.ts:181): when the failed check's own action has only guidance (unmappable) but the status nextAction has a command, the CLI prints the next-action command under `command:` and hides the check's own guidance. Spec says the check's declared action projects under `command:`; fallback to nextAction is an unspecified addition. Either remove fallback (spec-literal) or document it (code).
- D-T3 (LOW) Non-CheckPredicate repair guide bypass line (transition.ts:215-221) computes `bypassFlag` but prints `skippableCheckHint(...)` ("Retry with ..."), so bypass is shown in hint form instead of the `bypass: --skip-checks <id>` form used by status. Spec text for transition accepts either ("project `--skip-checks <checkId>` bypass hints"). Acceptable.
- D-T4 (LOW) `--help` JSON schema (transition.ts:357-362) omits `hint`, `state`, `validity`, `verification`, and nextAction `intent/action/guidance` that the failure record carries (:494-503).

### Test Coverage (transition.spec.ts)

Covered: missing/mutually-exclusive args (46-83), --next -> 'next' (84, 110), allow flags (139-165), --skip-checks parsing/dedup (1504-1612), no approval flags (183), no pending rewrite (210-437), hook skip phases (983-1056), check bus progress and failed-hook ordering (480, 648, 708), success text/JSON (543, 562), repair guide for InvalidState/CheckPredicateFailed/mandatory/approval command/start-verification real change name (771, 1613-1790), HappyPath hint text+json (889, 1826), incomplete tasks (1094-1256), recommend verify (1303), recovery without restart flag (1460), unknown/non-skippable check ids (1681, 1708).

### Missing Tests

- Pre-transition `GetStatus` called with `refreshImplementationTracking:false` and repair-guide GetStatus likewise (assertion not found by name).
- `Re-checking after hooks` heading (only presenter-level; no transition-level test found).
- Structured failure record `nextAction.intent/action` exposure and `blockers[].bypassFlag` in the `change-transition` failure record.
- "Next flag from signed-off maps to archivable"/legacy parking states are covered (437); "enters closest enabled optional step" covered by 110.
- `--allow-out-of-scope` hint must not mention alias: covered in error-hints.spec.ts:112-124, not in transition render test.

### Summary counts

Requirements 17: OK 16, PARTIAL 1 (Repair Guide action rendering vs verify.md), MISSING 0. Discrepancies: 0 high, 1 medium (spec-internal), 3 low. Untested scenarios ~5.

---

## 3. cli:change-invalidate

### Requirements Summary

Signature; policy resolution via core; target syntax; policy-dependent target requirements; normalization/validation; approval guard naming gates and canonical recovery targets; change-level invalidation delegated; none semantics; reporting incl. reason field and presenter-projected `nextAction.command`; error handling; CLI-rendered hints (--force, --target) in text and `hint` in JSON/TOON.

### Implementation Status

- Signature: OK (invalidate.ts:34-77). Flag->input mapping: policyOverride via \_invalidation-flags, targets, force (:99-111).
- Effective policy via core: OK (`result.effectivePolicy`, describeEffectivePolicy :113).
- Target syntax/normalization/validation: OK by delegation to core (CLI only splits on `@` :101-107; no local validation). Core behaviour not audited in this batch.
- Approval guard: OK. On `InvalidateRequiresForceError` CLI prints each `recovery.gate` / `recovery.target` from error (:196-203); no hard-coded `designing`.
- Change-level / none semantics / reporting: OK. Text: reason, policy, override note, none message, projection, automatic return, blockers, next action (:128-194); JSON/TOON named `reason` (:204-205).
- nextAction presenter projection: OK (:119-127 `projectCliNextAction` + intent/action).
- Error handling / hints: OK. `handleError(err, fmt, {command:'change.invalidate'})` (:207); error-hints.ts maps INVALIDATE_REQUIRES_FORCE -> 'force.revoke-consent', INVALID_INVALIDATE_TARGET / INVALID_INPUT -> 'invalidate.target-flags'; handle-error.ts:65-71,219-236 renders hint on stderr and `hint` in JSON.
- Constraint "no artifact-drift manual cause": relies on core.

### Discrepancies

- D-I1 (LOW) Text next-action block prints `command: (none)` (invalidate.ts:191) but never prints `guidance` when the command is null, unlike status/verification (spec only requires command projection here; consistency gap). JSON carries `guidance` via projectCliNextAction spread (:121).
- D-I2 (LOW) Text blockers (:183-187) show no per-blocker remediation (command/guidance), unlike cli:change-verification; invalidate spec does not require it.
- D-I3 (LOW) `INVALID_INPUT` under `change.invalidate` always yields the `--target` hint (error-hints.ts rule), even for non-target INVALID_INPUT causes (spec says "policy-targeting validation errors"). Over-broad hint selection; code vs spec granularity.

### Test Coverage (change-invalidate.spec.ts)

Covered: minimal text (46), `reason` named in JSON/TOON (76), intent projection in json/toon/text (118), execute input mapping (160-201), grouped affected (234, 280), none messaging (340), approval-guard refusal (424), invalid targets for policy (453), policy override (515), JSON `--force` hint (563).

### Missing Tests

- `--target` hint in text and JSON for INVALID_INVALIDATE_TARGET / INVALID_INPUT (only --force hint tested).
- `--force` hint on stderr in text mode; refusal listing every gate + recovery target in text.
- Stale-evidence needs-no-force, none+redesign, and preserve-with-blockers output scenarios (core-driven; no CLI-level rendering test).
- Next action `guidance` rendering when command is null.

### Summary counts

Requirements 11: OK 11, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~4.

---

## 4. cli:change-verification

### Requirements Summary

start/complete/invalidate commands; delegation (thin adapter, no local next action for start/complete); idempotent output with persisted reason; presenter-projected command with real change name, guidance fallback, per-blocker remediation line; error handling incl. format validated before mutation; whitelisted safe projection; discoverability.

### Implementation Status

- Command group/signature: OK (verification.ts:91-146). `--reason` required (:130); trimmed-empty rejected (:137-139).
- Start/complete delegation: OK; thin (:99-122), start/complete results carry no nextAction (renderStart/Complete :170-229).
- InvalidateVerification delegation: OK (:140-143).
- Success/idempotent output: OK. Text headline invalidated vs already stale, evidence id, reason (core `result.reason`, persisted), signoff, return, fingerprint, blockers, next action (:244-275). JSON fields `invalidated`, `reason`, `verificationStatus`, `automaticReturn`, `blockers`, `nextAction` (:277-306).
- Presenter projection: OK. `projectNextAction` -> `projectCliNextAction`, adds `intent`, `action`, `guidance` (:318-332). Blocker remediation: command else guidance line under blocker (:254-266); JSON blocker `action`, `command`, `guidance` (:285-303). Missing changeName -> command null + guidance (guidance-presenter.ts:53-56). Never literal `<name>` (presenter only emits real name).
- Error handling: OK. Mismatch -> repair hint + `VERIFICATION_FINGERPRINT_MISMATCH` (:343-350), differences sanitized by `publicDifferences`. `parseFormat` called first in each action (:107, 121, 136) before resolveCliContext/execute, so invalid format fails pre-mutation.
- Safe projection: OK (whitelisted JSON; summarizeFingerprint).
- Discoverability: no CLI code surface (skills/status). Not audited here.

### Discrepancies

- D-V1 (LOW) JSON/TOON blocker objects add a top-level `command` (verification.ts:296) in addition to `action`/`guidance`. Spec only enumerates `nextAction.command`, `intent`, `action`, `guidance`; blocker `command` is an extra, undocumented field. Either document in spec (it mirrors text) or drop it.
- D-V2 (LOW) The CLI relies on Core to put `params.changeName` in action params; it does not inject the change name when absent (so a core omission yields guidance rather than a command). This matches spec ("when params.changeName is missing, command is null").
- D-V3 (LOW) Start/complete reconciliation blockers (readReconciliation :384-390) have no remediation/command projection; spec says only that they MAY be shown. OK.

### Test Coverage (verification.spec.ts)

Covered: start/complete single core call, no hash dump (70, 96); reason requirement/empty (136, 146); invalid format before mutation (169); structured projection/whitelisting json+toon (190, 262); presenter/real-name/guidance fallback/blocker remediation across formats (354, 414); stable error path (481, 507).

### Missing Tests

- Repeated invalidation reports original persisted reason (A vs B) - core scenario; CLI test for text/JSON/TOON parity not found by name.
- "Commands work in any lifecycle state" (CLI-level no state gating) - no test.
- Complete refuses mismatched attempt: CLI mismatch guidance text + exit code (code present :343-350; named test not seen).
- Delegated compliance does not own attempt: skills/templates, outside CLI tests.

### Summary counts

Requirements 7: OK 7, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~4.

---

## 5. cli:change-archive

### Requirements Summary

Signature incl. repeatable `--skip-checks`, aliases `--allow-overlap`/`--allow-out-of-scope`; prerequisites delegated; behaviour; hooks; check progress; post-archive hooks exit 2; text/JSON success output incl. invalidatedChanges; error cases (unknown/non-skippable/hook check id, overlap message with bypass sentence only if skippable, CheckPredicateFailedError rendering with details + presenter-projected action + bypass line); impl.linksInScope generic hint; canonical naming.

### Implementation Status

- Signature: OK. Repeatable accumulator (archive.ts:63-68), comma split + trim + empty ignore + dedupe via Set (:99-114), aliases (:109-114), `skipChecks` passed only when non-empty and is the only bypass field (:122-128). CLI does not validate skippability.
- Prerequisites: OK (delegated, no local state gate).
- Hooks: OK (`skipHookPhases` :122-125).
- Check progress: OK (`createCheckProgressPresenter` streamName 'change-archive' :35-47).
- Post-archive hooks exit 2: OK (:130-133).
- Success output text/JSON: OK (:135-160); JSON NDJSON terminal record with invalidatedChanges (:151-163).
- Error cases: OK/PARTIAL. Overlap special-case text with `Use --skip-checks spec.overlap to proceed despite overlap.` only when `err.skippable === true` (:171-190). Other checks: label, id, from/to hop, detail lines, command-or-guidance from action via presenter, `bypass:`/`hint:` line (:191-231). Structured mode: falls through to handleError with metadata+hints (:234).
- impl.linksInScope generic hint: OK (`resolveCliErrorHint ?? skippableCheckHint`, :208-221).
- Canonical naming: OK (alias registered via parent; test archive.spec.ts:53).

### Discrepancies

- D-A1 (LOW) The overlap bypass sentence is a hard-coded literal in archive.ts:180 rather than going through the centralized presenter/hints (error-hints.ts has no overlap rule). Spec for archive does not mandate the presenter here, but status spec does for the analogous string. Either centralize (theme-consistent) or leave.
- D-A2 (LOW) Spec "Error cases" lists structured JSON error record for CheckPredicateFailedError; guidance/command projection for the check action is only text-mode (:168-231); JSON error record (handleError) carries `metadata` incl. raw `action` but no projected `command`/`guidance`. Spec says only "emits structured error record with the check's failure code" - satisfied. Noted for host-neutral consistency.
- D-A3 (LOW, style) archive.ts:10 import line exceeds prettier width (single-line multi-name import) - will fail `prettier --check`/lint if enforced. Same in approve.ts description strings (multi-line that prettier would collapse). Not a spec matter.
- D-A4 (LOW) Verify scenarios "Dependency mismatch lists every mismatching spec" and "Read-only workspace failure lists affected specs" are implemented in describeCheckFailure (guidance-presenter.ts:205-235) and the deps hint (error-hints.ts 'checks.deps-consistent'), but no archive.spec test uses these checkIds (see Missing Tests).

### Test Coverage (archive.spec.ts)

Covered: alias both verbs (53), success/hook failure/JSON/stream (80-190), invalidated changes text+JSON (190-237), not found/missing arg/archiving retry/not archivable (238-297), all skip-hook phases (298-399), skip-checks parsing: alias translation, comma, repeat, trim, blank, dedupe, case-sensitive, singular alias, combine, no value, help (445-535), unknown/hook/non-skippable (536-578), structured error (579), overlap bypass sentence skippable/non-skippable (604-651), structured overlap (652), stale verification command from action (687), plugin skippable/non-skippable text + json (707-745), impl.linksInScope hint text+json (746), invalid state with skip flags (784), peers invalidated (799), progress bus + hook.pre streaming (827, 885).

### Missing Tests

- deps.consistent with three mismatches listing + re-run hint (archive.spec has none).
- workspace.readOnly affected specs listing and no bypass (only CheckNotSkippable case at 582).
- Alias non-skippable `--allow-out-of-scope` -> CheckNotSkippableError at CLI level (566 mentions "also through an alias"; confirm).
- `guidance:` line for an unknown-kind action in archive Repair output (presenter tested, archive-level not).

### Summary counts

Requirements 12: OK 12, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 4 low. Untested scenarios ~3.

---

## 6. cli:change-approve

### Requirements Summary

Signatures; delegates gate state to kernel (`{name, reason}` only; `kernel.changes.*`); no local fingerprinting; approve spec/signoff valid in bound-from states incl. legacy parking states, no transition printed, help uses bound-from language; success output (gate, status valid, approver, time, fingerprint scope; signoff empty vs legacy-unknown); recovery/blocker rendering on failure with state/blockers/next action; error cases.

### Implementation Status

- Signatures: OK (approve.ts:30-37, 73-80; `requiredOption('--reason')`; unknown sub-verb rejected by commander).
- Delegates to kernel: OK (execute({name, reason}) :45-48, 108-111; `kernel.changes.approveSpec/approveSignoff`).
- No local fingerprints: OK (summarizeFingerprint is display only).
- Approve spec/signoff behaviour: PARTIAL. No transition printed; but success output (approve.ts:51-57, 113-119) never prints the resulting/unchanged state, so the verify.md scenario "Approving from a legacy parking state prints no transition ... output reports the recorded approval and the unchanged state `pending-spec-approval`" is not met: only `approved spec for <name>` + evidence lines (no state line). Help text says "(or a legacy parking state)" (:26-30, 76-80) - bound-from language is loose ("binding from state" not named) but `ready`/`done` examples present.
- Success output: OK (readGateProjection :245-290; signoff verification id or `legacy unknown` / `(none)`; fingerprint summary; no hashes).
- Failure recovery rendering: PARTIAL/OK. enrichApprovalFailure (:131-190) reloads status, attaches state/blockers/projected nextAction (command, guidance, intent, action) to the error for JSON, and prints state/blockers/next action in text. In text, only `next action: <command or (none)>` + reason is printed (:181-184); guidance for null-command actions is not printed in text (only in JSON via spread of projectCliNextAction). Blockers' remediation (action) not rendered in text.
- Error cases: OK.

### Discrepancies

- D-P1 (MEDIUM) Legacy-state success output does not report the unchanged state. Spec verify.md scenario (cli:change-approve "Approving from a legacy parking state prints no transition") requires reporting the unchanged state; code omits state entirely and the test (approve.spec.ts:110-138) mocks `approveSpec.execute` returning `state: 'spec-approved'` (which contradicts the "stays in current state" rule) and asserts only absence of "moved to pending". Possibility A (spec right): add a `state:` line to success output (text and JSON) from `change.state`, and fix the test mock to keep `pending-spec-approval`. Possibility B (code right): spec scenario overstated; relax to "does not print a transition". Core `ApproveSpec` behaviour on legacy states is outside this batch.
- D-P2 (LOW) Text failure output (approve.ts:181-184) prints `command: (none)` style for null-command actions and omits the action guidance; JSON includes it. Inconsistent with status/verification text which print a guidance line. Spec for approve requires only "next action" be rendered.
- D-P3 (LOW) `--help` JSON schemas (approve.ts:41-45, 88-92) say `{ result, gate, name }` but JSON also contains `approval` evidence block (:63) - stale documentation.
- D-P4 (LOW) Approval-failure text uses ad hoc labels (`state:`, `blocker:`, `next action:`) not the status/repair-guide format; spec does not prescribe format.

### Test Coverage (approve.spec.ts)

Covered: success spec/signoff text+JSON (51, 140, 305, 394), from ready/done (77, 331), drain/legacy (110, 364), host-neutral nextAction in structured failure incl. unknown plugin action guidance (165), missing reason (206), not found (216), wrong state (230), reload canonical state on failure (244), unknown sub-verb (279), empty vs legacy-unknown signoff evidence (419, 472), no hashes in spec approval (512).

### Missing Tests

- Legacy parking state success asserting the unchanged state is reported (see D-P1).
- Delegation call shape `{name, reason}` exactly and `kernel.specs.*` not invoked (no explicit assertion by name; may be inside success tests).
- Text-mode failure rendering of guidance for null-command action.
- Help text bound-from language.

### Summary counts

Requirements 8: OK 6, PARTIAL 2 (legacy state reporting; failure text guidance), MISSING 0. Discrepancies: 0 high, 1 medium, 3 low. Untested scenarios ~4.

---

## Batch totals

- Specs: 6. Requirements audited: 76. OK 71, PARTIAL 5, MISSING 0.
- Discrepancies: 0 high, 2 medium (D-T1 spec-vs-spec guidance-in-command contradiction in cli:change-transition verify.md; D-P1 legacy approve state not reported), 19 low.
- Untested scenarios: ~27 (largest gaps: status convergent DAG dedup and overlap-suffix at status level; archive deps.consistent/workspace.readOnly listing; invalidate --target hint; approve legacy unchanged state; transition refresh:false assertions and Re-checking heading).
- Cross-spec contradictions to resolve: verify.md of cli:change-transition (`command: pnpm audit:fix`) vs presenter rule in cli:change-status/cli:change-verification/cli:change-transition spec.md; archive Error-cases bullet says CheckPredicateFailedError reports "check-declared action projected through the CLI guidance presenter" which for unknown kinds yields `guidance:` not `command:` (consistent with code).
- No dependency/global spec contradiction found with core:get-status / core:transition-checks beyond the items above (core source verified free of CLI strings).
