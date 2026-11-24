# Partial compliance audit C — cli:change-status, cli:change-transition, skills:workflow-automation

Change: `schema-workflow-skippable-states`. Read-only audit. Specs were read via `changes spec-preview`; I read the code directly. Tests were run:
`packages/cli` status.spec + transition.spec → 90 pass / 0 fail; `packages/skills` generated-skill-protocol.spec + template-workflow.spec → 30 pass / 0 fail.

Most of the CLI requirements were already in place before this change. This audit concentrates on the requirements this change modified (the delta files under `deltas/cli/change-status`, `deltas/cli/change-transition` and `deltas/skills/workflow-automation`) and on the scenarios listed in the brief.

---

## 1. cli:change-status

### Requirements Summary

- Lifecycle projections (modified by this change): render `validTransitions`, `availableTransitions`, `nextAction` and blockers exactly as `GetStatus` returns them. Project the ordered workflow pipeline: annotate optional steps with `[optional]`, leave out disabled steps, and show shortcut/bypass paths in `availableTransitions`.
- Drafted changes are read-only. Drafted JSON must empty `availableTransitions` and `availableSteps`, set `nextAction.command` to null, and emit no artifact DAG.
- Unchanged requirements: DAG, display state, review, labels, schema warning, specs/deps section, implementation section.

### Implementation Status

| Requirement / scenario                                                                                                      | Status                             | Evidence                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle projections from GetStatus (no local filter)                                                                      | Implemented                        | status.ts:298-300 joins `lifecycle.availableTransitions` with no filter; status.ts:290-293 passes `nextAction` through                                                                                                                                                    |
| Pipeline annotates optional steps                                                                                           | Implemented (partial form)         | status.ts:301-307 renders `extras:` from `lifecycle.availableSteps`, with `[optional]` added when `step.optional` is set                                                                                                                                                  |
| Pipeline omits disabled steps                                                                                               | Implemented, but only through Core | Core `evaluateLifecycleVerdict` builds `availableSteps` from `WorkflowTopology.orderedPipeline`, which drops disabled steps (lifecycle-verdict.ts:199-241, workflow-topology.ts:66-81). The CLI does no exclusion of its own, which is correct under "MUST NOT recompute" |
| Bypass paths in availableTransitions                                                                                        | Implemented (passthrough)          | status.ts:298-300 and :503                                                                                                                                                                                                                                                |
| JSON `lifecycle.availableSteps[].optional`                                                                                  | Implemented                        | status.ts:504-514                                                                                                                                                                                                                                                         |
| Drafted JSON empties hops even if Core leaks them                                                                           | Implemented                        | status.ts:149 (command→null), :183-184 (`[]`), no `artifactDag` key in the drafted payload                                                                                                                                                                                |
| Drafted text read-only                                                                                                      | Implemented                        | status.ts:152-173                                                                                                                                                                                                                                                         |
| Remaining requirements (DAG, display state, review, labels, schema warning, specs/deps, refresh delegation, implementation) | Implemented (pre-existing)         | status.ts:200-546                                                                                                                                                                                                                                                         |

### Discrepancies

- **MEDIUM — the pipeline is rendered as `extras:`, not as a pipeline.** The spec says "SHALL project the ordered workflow pipeline". The text output labels the ordered pipeline `extras:` (status.ts:306). It does not mark which steps are available, and the line disappears when `availableSteps` is empty. The spec example also has no pipeline line.
  - Possibility A: the code is wrong. It should print a `pipeline:` line in topology order (and possibly show availability).
  - Possibility B: the spec is too vague. "Pipeline display" could be defined as the existing `extras` line, and the spec example updated to match.
- **LOW — redundant type cast.** status.ts:303 and :505 cast `step as typeof step & { optional?: boolean }`. Core's `LifecycleStepVerdict` already declares `optional?: boolean` (lifecycle-verdict.ts:155). The cast either hides a stale SDK re-export type or is dead code. It is not an `any` violation, but it widens the type without need.
- **LOW — `--help` schema is out of date.** The JSON schema text at status.ts:110 and :113 omits `optional` on `availableSteps`. The change added that field to the structured output (status.ts:508).
  - Possibility A: update the help text.
  - Possibility B: if `optional` is meant to stay undocumented, the spec should say so.
- **LOW — drafted JSON passes check rows through.** Drafted JSON spreads `optionalCheckFields(lifecycle)` (status.ts:185). If Core leaked `checksByTarget` for a draft, the output would carry per-target check rows. The spec only requires hops/steps to be empty, so this is a gray area.

### Test Coverage

- `displays [optional] annotations in text extras and in structured JSON availableSteps` (status.spec.ts:1439): checks for `implementing [optional]` in text and `optional: true` in JSON.
- `JSON drafted status includes isDrafted and empty transitions` (status.spec.ts:74): Core leaks `availableTransitions: ['ready']` and a non-empty `availableSteps`; the test asserts `[]`, `[]` and `command: null`. This fully covers "Drafted JSON empties hops even if Core leaks them".
- `given GetStatus omits verifying…` (status.spec.ts:1037) and `given GetStatus recommends verify…` (status.spec.ts:1063): projection passthrough.
- `renders custom check blockers with check label, message, and checkId` (status.spec.ts:1515).

### Missing / Weak Tests

- The pipeline test is weak on the disabled part of the scenario. Its mock contains no disabled step, so "verifying is excluded" is never exercised. It even asserts `toContain('verifying')`. The test only proves passthrough. An end-to-end check that Core excludes the disabled step is not present at the CLI level (it is covered in core `workflow-topology.spec.ts:39`).
- No assertion that drafted JSON omits `artifactDag`. This is part of the requirement "Stable display status and drafted JSON compatibility".

### Spec Dependency Chain

This spec is consistent with core:get-status and core:lifecycle-engine: `availableSteps` comes from `orderedPipeline`, so disabled steps are already gone. It is also consistent with the "MUST NOT recompute" constraint, since the CLI does no topology work.

### Summary

Requirements: 18 total, 17 implemented, 1 partial (pipeline rendering). Discrepancies: 0 HIGH, 1 MEDIUM, 3 LOW. Missing/weak tests: 2.

---

## 2. cli:change-transition

### Requirements Summary

- Next-transition resolution (modified by this change):
  - `--next`, **or no explicit target**, passes `to: 'next'`.
  - Core resolves it with `nextForwardStep`: disabled steps are skipped, and an enabled optional step stays the target.
  - `--next` never evaluates shortcut policy.
  - When Core rejects the request: exit 1 with an `error:` message.
- Progress goes on the generic check bus. Hooks are `Running pre/post hooks`. Structured output uses `stream: "change-transition"` and never `hook-progress`.
- `--skip-hooks` maps to `skipHookPhases`, and `all` skips every hook execution.

### Implementation Status

| Requirement / scenario                                             | Status              | Evidence                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI does not keep a from→to next table                             | Implemented         | transition.ts:364-365 sets `requestedTarget = 'next'`; it is passed at :373. The only state list is `CHANGE_STATES` (transition.ts:46-59), used to validate arguments |
| Next flag advances designing→ready                                 | Implemented (Core)  | workflow-topology.ts:202-230; core test `returns immediate next step in standard pipeline`                                                                            |
| Next flag skips disabled step                                      | Implemented (Core)  | `rawActivePipeline` drops disabled steps; core test `skips disabled steps to the next enabled step` (workflow-topology.spec.ts:370)                                   |
| Next flag enters the closest enabled optional step                 | Implemented (Core)  | `nextForwardStep` takes `pipeline[fromIndex+1]` with no optional or step-skip logic (workflow-topology.ts:224-229)                                                    |
| Next fails in pending-spec-approval / pending-signoff / archivable | Implemented         | Core throws `HappyPathNextUnavailableError` (transition-change.ts:243-245). The CLI adds it to repair-guide errors (transition.ts:95, :103) and exits 1 (:405, :423)  |
| signed-off --next → archivable                                     | Implemented (Core)  | `normalizeDeliveryState`                                                                                                                                              |
| Shared presentation with run-hooks is not the same JSON stream     | Implemented         | transition.ts:226 (`streamName: 'change-transition'`), :241/:251/:261/:384/:408; no `hook-progress` anywhere in transition.ts                                         |
| Hook execution / --skip-hooks                                      | Implemented         | transition.ts:332-335 → `skipHookPhases`; Core `HookEffectCheck.execute` returns `skip` for `all` (hook-effect-shared.ts:135-138)                                     |
| Check progress rendering                                           | Implemented         | `_check-progress-presenter.ts`                                                                                                                                        |
| Command signature `[name] [target]`, target omitted → resolve next | **Not implemented** | transition.ts:280 declares `<name>` as required; transition.ts:203-205 rejects a missing step with "either <step> or --next is required"                              |

### Discrepancies

- **MEDIUM — omitting the target is an error, but the spec says it should mean `next`.** The modified Next-transition requirement says "When the command is invoked with `--next` (or without an explicit target step), it SHALL pass `to: 'next'`". The Command signature requirement repeats this ("If `target` is omitted, it attempts to resolve the next logical transition") and also makes `name` optional. In the code, `validateRequestedTarget` errors when the step is missing (transition.ts:203-205), `name` is required (transition.ts:280), and the test `Missing arguments` (transition.spec.ts:44) locks in the error.
  - Possibility A: the code is wrong. It should treat a missing step as `next` and default `name` to the active change.
  - Possibility B: the spec is wrong. The delta copied the parenthetical "(or without an explicit target step)" from older text; it should be removed, and the signature should become `<name> [step]` with a required target-or-`--next`.
- **MEDIUM — `--skip-hooks all` text output looks like the hooks ran.** The spec says that with `all`, "all hook execution is skipped". No hook actually runs: `HookEffectCheck` returns `skip` before calling `RunStepHooks` (hook-effect-shared.ts:136-137). However:
  - `executeCheckWithProgress` still emits `check-start` and `check-done` with `outcome: 'skip'` (execute-matching-predicates.ts:99-110).
  - The text presenter prints `✓ <label>` for every outcome except `fail` (\_check-progress-presenter.ts:107-113).

  So users see `Running post hooks (hook.post)` followed by `✓ Running post hooks`, the same for pre hooks, which reads as if the hooks passed. The spec's check-progress format only defines `✓` and `✗`; it says nothing about `skip`.
  - Possibility A: fix the presenter. Render skip as something like `- <label> (skipped)`, or suppress hook effect progress when the phase is skipped.
  - Possibility B: amend the spec to define how skip outcomes render. Today it is underspecified, and the current behaviour is technically compliant but misleading.

- **LOW — the check list prints twice.** `TransitionChange` evaluates the predicates once before the effects and again after the post-hook reconcile (transition-change.ts:318-330 and :400-412). Both passes send events to `onCheckProgress`, so the text output shows every predicate twice, even with `--skip-hooks all` when no hook could have changed state. The spec does not forbid this. It does add noise and makes it hard to see what actually ran.
  - Possibility A: core should re-evaluate silently, or skip the re-evaluation when every effect was skipped.
  - Possibility B: the spec should state that the second pass is visible by design.
- **LOW — misleading help text.** The `--next` option help reads "next logical lifecycle step" (transition.ts:285). Under the new semantics it is the "closest enabled step", and optional steps are not bypassed. The constraint "the CLI never exposes the routing logic in its help text" arguably supports leaving it vague, so this is informational only.

### Test Coverage

- `resolves target from --next without positional step` (transition.spec.ts:68): `to: 'next'` and status read with `refreshImplementationTracking: false`.
- `keeps --next as a nearest-step request when status recommends an optional shortcut` (transition.spec.ts:94): `to: 'next'` is sent even when `nextAction` advertises a `verifying` shortcut.
- `--next failures` describe block (transition.spec.ts:817-891): the three rejection states.
- `renders Repair Guide and exits with code 1 on HappyPathNextUnavailableError` (transition.spec.ts:1648).
- `resolves signed-off --next to archivable` (transition.spec.ts:400).
- `--skip-hooks flag` block (transition.spec.ts:894-1003): checks only that the flag is mapped.
- Core: `workflow-topology.spec.ts` `nextForwardStep` cases at lines 348, 370, 379.

### Missing / Weak Tests

- **"Next flag enters the closest enabled optional step" has no real coverage.** The CLI test mocks the transition result (`implementing`), so it only proves `to: 'next'` is forwarded. Core has no `nextForwardStep` test with an `optional: true` step whose step-skip checks pass. The core suite has "skips disabled" but nothing like "keeps an optional step".
- "Next flag advances designing→ready" is covered only in core. There is no CLI scenario test from `designing`; it is equivalent to the drafting test.
- "Shared presentation… not the same JSON stream": no test asserts the absence of `stream: "hook-progress"` in JSON mode for hook check events. The existing JSON tests check `change-transition` records. Worth confirming that some test explicitly asserts `not.toContain('hook-progress')`; I did not find one in this file.
- No test for how skipped hook phases render in text (see the MEDIUM finding above).

### Spec Dependency Chain

- Consistent with core:transition-change (`nextForwardStep`) and core:lifecycle-engine. The CLI does no routing.
- core:hook-execution-model order (source.post, then target.pre) holds: `Running post hooks` prints before `Running pre hooks`.
- No contradiction with core:transition-checks on the bus. The `skip` outcome is defined in core, but the CLI rendering spec is silent on it. That is a gap between specs, not a contradiction.

### Summary

Requirements: 17 total, 16 implemented, 1 not implemented (missing-target → next / optional name). Discrepancies: 0 HIGH, 2 MEDIUM, 2 LOW. Missing/weak tests: 4.

---

## 3. skills:workflow-automation

### Requirements Summary

The requirement modified by this change is **Cross-skill artifact review and recovery**. Lifecycle skills must:

- Read `nextAction.command`, `nextAction.targetStep` and `lifecycle.availableTransitions` from structured status dynamically, never from fixed progressions.
- When invoked explicitly, map to their own target, continue if that target is advertised, and stop if it is not.
- Run no hooks for bypassed or disabled steps.
- Invent no optional-step policy.
- Follow the verify/compliance attempt-ownership rules (start, checks, complete; `--delegated --attempt`; repeat work when fingerprints change).
- **Verify scenario:** "an unconditional canonical target recipe fails validation".

### Implementation Status

| Scenario                                                                                                                                               | Status                       | Evidence                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dynamic topology consumption by agent skills                                                                                                           | **Partial**                  | A new "Schema-aware lifecycle routing" section was added to design (tpl:50-68), implement (tpl:31-48), verify (tpl:36-53) and archive (tpl:33-50). The operational steps below those sections still contain fixed recipes (next row) |
| Fixed canonical recipes cannot override structured routing                                                                                             | **Not implemented**          | No validator exists anywhere in `packages/skills/src` or the tests (searched for availableTransitions, recipe, unconditional). The templates still hold unconditional recipes, listed below                                          |
| Disabled verifying selects only the actual target hooks                                                                                                | **Contradicted by template** | specd-verify tpl:85-98: "If in `implementing`" always runs `run-hooks <name> verifying --phase pre` and `transition <name> verifying`. Step 5 (tpl:235-242) always runs `verifying --phase post`                                     |
| Optional implementing bypass follows status routing                                                                                                    | **Contradicted by template** | specd-design tpl:433: "If spec=off: Suggest `/specd-implement <name>`", whatever `nextAction` says. specd-implement tpl:83-94 always enters `implementing`; tpl:312 always recommends `/specd-verify`                                |
| Generated lifecycle guides preserve semantic routing invariants (`done` stays mandatory)                                                               | Implemented in prose         | specd-verify tpl:342-384 (6a done, then 6b archivable); the test for this is a simulation (see Weak tests)                                                                                                                           |
| Explicit design invocation may choose an advertised redesign                                                                                           | Implemented (prose)          | design tpl:59-63                                                                                                                                                                                                                     |
| Explicit skill stops when its target is unavailable                                                                                                    | Implemented (prose)          | "stop before running any hooks" in all four templates                                                                                                                                                                                |
| Skill does not invent optional-step policy                                                                                                             | Partial                      | The routing prose defers to Core. However, implement tpl:76-94 and design tpl:424-438 branch on the `approvals:` line and the state instead of `availableTransitions`                                                                |
| Consume `nextAction.targetStep`                                                                                                                        | **Not implemented**          | None of the four lifecycle templates mentions `targetStep` (only shared.md.tpl does, once). The spec names `nextAction.targetStep` explicitly                                                                                        |
| Independent verify owns its attempt                                                                                                                    | Implemented                  | verify tpl:193-209 (start before checks), :321-331 (complete only after checks and hooks succeed); hooks in step 5 run before complete                                                                                               |
| Full verify shares one attempt with compliance                                                                                                         | Implemented                  | verify tpl:246-260; compliance tpl:123-130                                                                                                                                                                                           |
| Delegated compliance remains change scoped downstream                                                                                                  | Implemented                  | compliance tpl decision table :143-146, mode detection :162                                                                                                                                                                          |
| Delegated mode requires an explicit attempt                                                                                                            | Implemented                  | compliance tpl:163 (exactly one of the flags, or a missing value, means invalid: stop before discovery or report)                                                                                                                    |
| Standalone compliance owns a separate attempt                                                                                                          | Implemented                  | compliance tpl:102-112                                                                                                                                                                                                               |
| Changed inputs require repeated work                                                                                                                   | Implemented                  | verify tpl:207-209, :333-336; compliance tpl:112                                                                                                                                                                                     |
| Diagnostic priority / data extraction / spec read surfaces / outline / canonical plurals / freshness / validation review / traceability / optimization | Implemented (pre-existing)   | shared.md.tpl:43-89 and later                                                                                                                                                                                                        |

### Discrepancies

- **HIGH — nothing enforces "fixed canonical recipes cannot override structured routing".** The scenario requires that "an unconditional canonical target recipe fails validation". There is no protocol validator. The existing tests only check that phrases are present, so they would pass even though the templates contain these unconditional recipes:
  - verify tpl:85-98: `implementing` → verifying pre-hooks, then `transition verifying`
  - verify tpl:235-242: verifying post-hooks, always run
  - verify tpl:342-384: "6a. Transition to done", then "6b … transition archivable"
  - design tpl:81-92 and :388-401: designing and ready
  - design tpl:433: suggests `/specd-implement`
  - implement tpl:83-94: transition implementing
  - implement tpl:312: suggests `/specd-verify`

  The added "Schema-aware lifecycle routing" sections sit next to these recipes and contradict them. An agent following the steps literally will run verifying hooks when `verifying` is disabled, and will enter `implementing` when it is optional and Core advertises a bypass.
  - Possibility A: the code is wrong. Rewrite each operational step so its target is "the target selected from fresh `lifecycle.availableTransitions` / `nextAction.targetStep`", with the hook step names taken from that target. Then add a validator test that fails on an unconditional `changes transition <name> <literal-state>` or `run-hooks <name> <literal-state>` without a routing guard. Exceptions would be the explicit back-routes (designing, implementing on failure).
  - Possibility B: the spec is too strong. "Fails validation" could be relaxed to "is guarded by the routing section". Even then the verify template still conflicts with "Disabled verifying selects only the actual target hooks".

- **HIGH — the verify template breaks the "Disabled verifying" scenario.** verify tpl:85-98 and :235-242 run `verifying` pre and post hooks unconditionally. The only safeguard is the prose at tpl:53 ("never run verifying hooks when verification is disabled"), which the step text directly contradicts. When `verifying` is disabled the change goes implementing → done, and verify has no `implementing → done` branch.
  - Possibility A: the template is wrong. Add a branch on the advertised target.
  - Possibility B: none credible. The spec scenario is explicit.
- **MEDIUM — lifecycle skills do not consume `nextAction.targetStep`.** The spec says skills "MUST consume `nextAction.command`, `nextAction.targetStep`, and `lifecycle.availableTransitions`". The four templates reference only `nextAction.command` and `lifecycle.availableTransitions`. The test simulation uses `targetStep`, but the templates never tell an agent to read it.
  - Possibility A: add `targetStep` to the routing prose.
  - Possibility B: the spec could drop `targetStep` if `command` plus `availableTransitions` is enough. It is not: `/specd-verify` covers several hops.
- **MEDIUM — design and implement completion messages ignore bypass.** Design tpl:433 always suggests `/specd-implement`, and implement tpl:312 always suggests `/specd-verify`. When implementing is optional and bypassable, or verifying is disabled, `nextAction.command` may differ. This conflicts with "default routing SHALL advance directly along the legal path recommended by `nextAction`".
  - Possibility A: these messages should echo `nextAction.command`.
  - Possibility B: they are "explicit selection" suggestions. But they appear on the default path, so B is weak.
- **MEDIUM — approval gating is read from the text `approvals:` line.** implement tpl:76-83, design tpl:426-438 and verify tpl:366-391 branch on `spec=on/off` and `signoff=on/off` from text status instead of on whether the target is in `availableTransitions`. This duplicates Core's routing decision ("Core alone owns availableTransitions and nextAction routing decisions"). The behaviour is equivalent today, but it is the kind of local rule the spec forbids. It also uses `--format text` for a routing decision, while the routing section requires toon.
- **LOW — verify's fixed hop list for "explicitly invoked" is vague.** verify tpl:46-47 maps to "`verifying` or the current verify-owned completion hop". That is underspecified when `verifying` is disabled; it presumably means `done`.

### Test Coverage

- generated-skill-protocol.spec.ts:
  - `keeps schema-aware routing and bypassed-hook suppression in every lifecycle skill copy` (:104): checks that three phrases appear in the templates and in the five installed copies.
  - `all installed copies mandate preferred default recommendation and explicit target validation` (:117): phrase presence.
  - Seven `simulates …` tests (:198-290).
- template-workflow.spec.ts:
  - `routes through advertised schema steps without hooks for disabled or optional intermediates` (:340) and `treats nextAction as preferred default while permitting advertised explicit targets` (:349): phrase presence.
  - `gives verify and compliance explicit attempt ownership` (:257), `routes delegated compliance through every change-scoped downstream decision` (:283; includes the invalid-delegation ordering for "Delegated mode requires an explicit attempt"), `routes design and implement recovery…` (:309).
- I confirmed that all five installed copies (.claude, .agents, .codex, .github, .opencode) contain the new "Schema-aware lifecycle routing" section.

### Missing / Weak Tests

- **Tautological simulation tests (HIGH weakness).** The seven `simulates …` tests in generated-skill-protocol.spec.ts:198-290 exercise `evaluateSkillProtocol`, a function defined inside the test (:144-196). It never reads a template or a generated skill, so these tests would pass with any template content and verify no product behaviour. Specific problems:
  - It models `selectedHooks` as `${target}.pre` only, with no source `.post`. That contradicts the spec's "hooks only for actual source and target".
  - It hard-codes `specd-archive → archiving`.
  - The "disabled verifying" case sets `nextAction.command: '/specd-verify'` with `targetStep: 'done'` and does not compare against the verify template, which would have selected `verifying.pre`.

  These tests do not cover "Generated lifecycle guides preserve semantic routing invariants", "Disabled verifying selects only the actual target hooks", "Optional implementing bypass follows status routing" or "Skill does not invent optional-step policy".

- **No validator test for "Fixed canonical recipes cannot override structured routing".** Nothing fails on an unconditional recipe. A real test would scan operational code blocks for `changes transition <name> <state>` and `run-hooks <name> <state>` and require each to be guarded by routing.
- "Dynamic topology consumption by agent skills": phrase checks only.
- "Changed inputs require repeated work": a single phrase check (`repeat all required verification work`). Adequate for prose.
- "Independent verify owns its attempt": phrase checks; there is no ordering assertion (start before scenario checks, complete after hooks). The `indexOf` ordering style used at template-workflow.spec.ts:335 could be applied here.

### Spec Dependency Chain

- Contradicts its dependency cli:change-transition: the skills use explicit literal targets with `--skip-hooks all` plus `run-hooks` for a fixed step. This is consistent in mechanism but defeats topology-driven targets.
- Consistent with cli:change-status: skills read `lifecycle.availableTransitions` in toon, and that field exists in status.ts:503.
- Partly inconsistent with core:get-status: the templates ignore `nextAction.targetStep`, which Core provides.
- The prose also breaks the spec's own Diagnostic Priority split: implement, design and verify make gate decisions from the `--format text` `approvals:` line (verify tpl:366, design tpl:426), while the routing section requires toon. This is a minor internal inconsistency.

### Summary

Requirements: 13 total, 10 implemented, 2 partial (dynamic consumption, no invented policy), 1 not implemented (recipe validation; `targetStep` consumption counted with it). For the modified Cross-skill requirement, 9 scenarios are implemented, 2 are contradicted by the templates and 1 is unenforced. Discrepancies: 2 HIGH, 3 MEDIUM, 1 LOW. Missing/weak tests: 5, including the tautological simulation suite.

---

## Overall counts (batch C)

| Spec                       | HIGH | MEDIUM | LOW | Missing/weak tests |
| -------------------------- | ---- | ------ | --- | ------------------ |
| cli:change-status          | 0    | 1      | 3   | 2                  |
| cli:change-transition      | 0    | 2      | 2   | 4                  |
| skills:workflow-automation | 2    | 3      | 1   | 5                  |
