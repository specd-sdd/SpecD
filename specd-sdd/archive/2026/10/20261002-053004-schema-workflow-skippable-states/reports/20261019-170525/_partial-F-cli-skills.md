# Batch F partial audit (attempt 15) - CLI & skills

Paths relative to repo root. Read-only audit.

## cli:change-status

### Requirements Summary

Pipeline from GetStatus in Core canonical order, `[optional]` annotation + `optional` on availableSteps (documented in --help), disabled steps never re-added, bypass paths from Core; DAG from change's sovereign schema; schemaWarnings; drafted read-only; display-state fallback; blockers with labels; review header without file lists.

### Implementation Status

- Pipeline order preserved as Core reports (no local filter/sort): packages/cli/src/commands/change/status.ts:304-313 (text `extras:` with `[optional]` at :309-310), JSON `lifecycle.availableSteps` incl. `optional` :515-525. Disabled steps never injected. OK
- --help documents `optional: boolean` on availableSteps: status.ts:108,111. OK
- DAG via `resolveChangeSchemaForCli` (change.schemaName/version, not workspace default): status.ts:236,408; helpers/change-schema.ts:14-37; renderDag uses dag.roots/childrenOf and `visited` set to render each node once :579-604. OK
- schemaWarnings text `warnings:` (:285-293) and JSON (:444); no stderr warning. OK
- Drafted: command null (:147), `availableTransitions: []`, `availableSteps: []` (:193-194), no artifactDag (:189), `(none - change is drafted)` (:178). OK
- Display status fallback displayStatus -> effectiveStatus -> state: :384,393,483,490, DAG :611. OK
- Blocker labels `! CODE - label: msg` :265-269; JSON label/checkId :449-450. OK
- review header w/o affected files :274-283; overlap peers :367-379. OK

### Discrepancies

- LOW: no test asserts the --help text documents `optional` on `availableSteps` (test/commands/change/status.spec.ts:65-72 only checks overlapDetail and schema.artifactDag). Code compliant (status.ts:108,111).
- LOW (carried): scenario "Pipeline display annotates optional steps and omits disabled steps" third bullet (bypass paths in availableTransitions) is purely Core-projected; CLI renders `transitions:` verbatim (status.ts:304-306) - correct per spec ("CLI MUST NOT filter").

### Test Coverage (test/commands/change/status.spec.ts)

- Pipeline canonical order + omit disabled (text and JSON): covered :1527-1570 (RESOLVED prior MEDIUM 1; asserts `ready, implementing [optional], done`, no verifying, JSON order). `optional` in JSON entries asserted in :1572-1655 (`optional: true`).
- Optional annotation: covered :1572. Disabled omission: covered :1527.
- Drafted JSON empties / nextAction null: covered :74-106; text drafted :108-139.
- Lifecycle from GetStatus (no verifying, nextAction): :1117,:1144.
- DAG from change schema: :752; schema advisories: :715,730,741; different-default-not-drift: :730 (covered).
- Overlap/review/drift/labels/hasTasks/task counts/display fallback: covered (:786-:990,:1044,:246,:324,:1207-1323).
- Convergent node not repeated: :1075 (weak-to-covered; renderDag visited set).
- Drafted JSON "Core leaks hops" :74 covers availableTransitions/availableSteps.

### Missing Tests

- --help documents availableSteps.optional (LOW).

### Summary

Reqs 20/20 compliant; scenarios all covered; 0 HIGH, 0 MEDIUM, 2 LOW. Prior MEDIUM (1) RESOLVED.

## cli:change-transition

### Requirements Summary

`<step>` xor `--next`; `--next` passes `to:'next'` to Core (no local table, no shortcut policy); disabled steps skipped by Core; HappyPathNextUnavailableError -> exit 1 with error; check progress presenter with skip markers and conditional re-check; repair guide; skip-checks translation; GetStatus refresh=false; structured stream records.

### Implementation Status

- Mutual exclusion / required messages: transition.ts:194-210 (cliError exit 1 before any kernel call, :338). OK
- `--next` -> `to: 'next'` verbatim, no local resolution or shortcut evaluation: :372-373, :381-387. OK
- HappyPathNextUnavailableError mapped to repair guide + exit 1: :95,:103,:408-416 (writes `error:` to stderr first, :133). OK
- skipChecks translation (+legacy aliases, dedupe): :345-359,:386. OK
- GetStatus refreshImplementationTracking:false pre (:363-366) and in repair guide (:409-412); no direct refresh calls. OK
- No approval flags passed: :381-387. OK
- Skip rendering / re-check: \_check-progress-presenter.ts (skip marker `⊘ ... (skipped: reason)`, hookRan gating, `Re-checking after hooks` once). OK
- JSON stream `change-transition`, complete record ok/failure: :394-405,:418-433. OK
- Bypass/command lines in repair guide: :157-169. OK

### Discrepancies

- LOW: presenter labels every hook-check skip as `--skip-hooks` whenever any `--skip-hooks` phase is given (transition.ts:377 `skipHooks: skipHookPhases.size > 0`; presenter skipReason). With e.g. `--skip-hooks source.post`, a `hook.pre` that Core skipped for "no hooks configured" would be mislabeled `--skip-hooks` instead of Core's reason. Spec says reason e.g. `--skip-hooks`... "not applicable". Interpretation A (spec): label should reflect actual cause; B: acceptable approximation. Not a scenario failure (scenario only uses `all`).
- LOW (carried): no CLI-level test for `--next` past a disabled step; CLI correctly delegates (`to:'next'`), behaviour is Core's (nextWorkflowStep). Scenario "Next flag skips disabled step" has only delegation evidence (transition.spec.ts:82-106 asserts `to:'next'`).

### Test Coverage (test/commands/change/transition.spec.ts, check-progress-presenter.spec.ts)

- skip-checks CSV / aliases / dedupe: :1400-1510 covered. Mutual exclusion & missing: :56,:68 covered.
- `--next` -> to:'next': :82; optional shortcut not taken: :108-135 covered (strong).
- `--next` failure states (pending-spec-approval, pending-signoff, archivable): :832-905 covered; HappyPathNextUnavailable repair guide: :1663 covered.
- Skipped hooks rendered as skipped / re-check only when hooks ran: presenter spec :39,:46,:62,:76 covered (unit level); end-to-end `--skip-hooks all` text rendering via command: weak (only phases forwarding :909).
- Repair guide, mandatory vs skippable bypass, refresh=false, structured complete records, hook failure context: covered (:748,:1509,:1541,:457,:539,...).
- Next skips disabled step: weak (delegation only).

### Missing Tests

- CLI `--next` with disabled step (LOW; Core-owned semantics).

### Summary

Reqs 14/14 compliant; 0 HIGH, 0 MEDIUM, 2 LOW.

## cli:change-validate

### Requirements Summary

Artifact model/DAG from change's sovereign schema; unresolvable schema exit 3 with `fatal:` in every mode; identity mismatch keeps `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; advisories rendered; --all topological walk; output formats.

### Implementation Status

- Schema resolve helper maps failure to `cliError(msg, fmt, 3, code)` -> prefix `fatal` for exit 3 (handle-error.ts:45): validate.ts:221-237. OK
- Single-spec mode resolves schema first regardless of --artifact: validate.ts:400 (so exit 3 holds even without --artifact). OK
- Core-raised mismatch (validate.execute rejecting) mapped: handle-error.ts:178-186 (exit 3 + code, diff +3 lines). OK
- --all uses `schema.artifactDag().topologicalOrder()`, change-scoped without specPath, spec-scoped per specId: :101-158. Advisories text :204-205, JSON `schemaWarnings` :212. OK
- Unknown artifact ID, mutual exclusion messages: :323-329. OK

### Discrepancies

- LOW: batch with `specIds.length === 0` returns "no specIds declared" with exit 0 before schema resolution (validate.ts:91-99), so an unresolvable schema is not exit 3 in that edge. Spec: "in every mode". Edge, not scenario-tested.
- LOW: when `--artifact` absent and `specPath` given, schema is resolved twice (validate.ts:400 and in loadInlineDiffReview :254) - efficiency only.
- Scenario 'Unresolvable change schema' now reads `fatal:` (prior LOW) - code prints `fatal:` (handle-error.ts:45). RESOLVED/consistent.

### Test Coverage (test/commands/change-validate.spec.ts)

- Schema from change not default: covered :728. Exit 3 unresolvable (--all): :753 (asserts exit 3 + message; does not assert `fatal:` -> weak on prefix; `fatal:` asserted in :781 and :799).
- Single-spec unresolvable without --artifact: weak - :799 mocks validate.execute rejecting with identity mismatch, not resolveSchema rejecting; code path :400 untested directly.
- Identity mismatch code in JSON: covered :781.
- Advisories text/JSON: covered for single-spec :815,:831; for `--all` (scenario "Version advisories are rendered", `--all`): weak - no `--all` advisory test (validate.ts:204,212 untested).
- Batch scenarios: :460-:664 covered. Unknown artifact: covered via use-case mock (existing).

### Missing Tests

- `--all` renders/serializes SCHEMA_VERSION_DRIFT advisory (LOW-MEDIUM weak: same helper tested in single mode).
- single-spec exit 3 when resolveSchema rejects without --artifact (LOW).

### Summary

Reqs 11/11 compliant; 0 HIGH, 0 MEDIUM, 3 LOW (+2 weak scenarios).

## cli:change-spec-preview

### Requirements Summary

`--artifact` resolution/scope/filename from the change's sovereign schema; schema resolution failure and identity mismatch -> non-zero error; merged/diff/JSON modes; error handling; artifact filtering errors.

### Implementation Status

- Schema via `resolveChangeSchemaForCli` (never workspace default): packages/cli/src/commands/change/spec-preview.ts:81-98. OK
- Resolution failure -> exit 3 `fatal:` with `SCHEMA_RESOLUTION_FAILED`, mismatch -> `SCHEMA_PROVIDER_IDENTITY_MISMATCH`: :87-97. Without `--artifact`, `PreviewSpec` raises mismatch -> handleError exit 3 (handle-error.ts:178-186). OK
- Unknown artifact / non-spec scope / not in change -> `error:` exit 1: :100-121. OK
- Labels :141-150, header :163/:179, chalk colours :166-174, diff omitted when none :160, JSON passthrough :184, warnings to stderr :76-78. OK

### Discrepancies

- LOW (carried): version advisories are rendered only when `--artifact` is given (spec-preview.ts:80-86,131-133); without it no resolver call is made in the CLI. Spec "Artifact names from the change's schema" only requires resolution for `--artifact`; no scenario demands advisories here. Not a violation.
- LOW: with `--artifact`, the schema is resolved after `preview.execute` (:69 vs :84), so an unknown artifact still pays for a full preview first. Efficiency only.

### Test Coverage (test/commands/change/spec-preview.spec.ts)

- Minimal/diff/labels/filtering/JSON/no-preview/not-found/spec-not-in-change/warnings: covered :91-:411, :416-:672.
- `--artifact` resolves against change schema: covered :674-:703 area (resolveSchema mock); unresolvable exit 3: :675; identity-mismatch code: :704; advisories on stderr: :735. Covered.
- Non-existent artifacts / scope / not in change: :572,:602,:636 covered.

### Summary

Reqs 8/8 compliant; 0 HIGH, 0 MEDIUM, 2 LOW.

## cli:change-artifacts

### Requirements Summary

Per-file rows in schema order; drift-aware display state; `hasDrift`/`displayStatus` in JSON; artifacts listing, order and `delta` flags from the change's sovereign schema; "Schema resolution failures and SchemaProviderIdentityMismatchError SHALL be reported as errors with a non-zero exit code."

### Implementation Status

- Rows/display state/JSON: packages/cli/src/commands/change/artifacts.ts:88-152 (displayStatus, hasDrift), text :163-176, JSON :180-188. OK
- Order: follows `GetStatus.artifactStatuses` (Core, schema-declared). OK
- Schema read for `delta` flags via `resolveChangeSchemaForCli` (change identity, not default): :59. OK
- NON-COMPLIANT: the resolver call is wrapped in a bare `catch { /* skip delta entries */ }` (artifacts.ts:58-71). Any resolution failure, including `SchemaProviderIdentityMismatchError`, is swallowed: exit code 0, no error, delta rows silently omitted (GetStatus itself reports resolution problems as blockers rather than throwing, so nothing else raises). This contradicts the requirement "Artifact listing from the change's schema" (spec: errors with non-zero exit code).

### Discrepancies

- MEDIUM: artifacts.ts:69-71 swallows schema resolution failure / identity mismatch. Interpretation A (spec is right): must rethrow (except ChangeNotFoundError) and exit 3 as validate/spec-preview do (handle-error.ts:178-186 already maps the mismatch to exit 3). Interpretation B (code is right: listing is still useful when schema is broken): then the spec sentence must be weakened to "SHALL be reported as advisories" and the command should at least print a warning. Currently neither holds. Previous audit rated this LOW; it is an explicit requirement sentence with no implementation and no test, so MEDIUM.
- LOW: artifact-level summary row for multi-file artifacts: `displayStatus` derived from `a.displayStatus` (:117) only in the zero-file case; spec's "summary row derives from file-level display states" is satisfied trivially (no multi-file summary row exists). Not a violation.

### Test Coverage (test/commands/change-artifacts.spec.ts)

- Text/JSON columns, drift display (`complete-with-drift`), hasDrift/displayStatus, not found, missing name: covered :43-:262.
- Listing follows change schema: covered :265 (asserts getActiveSchema not consulted).
- Advisories text/json: :323,:334 (extra, not required by spec).
- MISSING: no test for resolution failure or identity mismatch producing a non-zero exit (grep for Mismatch/mockRejected on resolveSchema returns nothing in this file).

### Missing Tests

- Schema resolution failure / `SchemaProviderIdentityMismatchError` -> non-zero exit (MEDIUM, goes with the fix).

### Summary

Reqs 5 compliant, 1 non-compliant; 0 HIGH, 1 MEDIUM, 1 LOW.

## skills:workflow-automation

### Requirements Summary

Plural canonical commands; routing from `nextAction` / `lifecycle.availableTransitions`; no hooks for bypassed/disabled steps; explicit skill target handling; no fixed chains/completion messages; approvals from structured status; verify/compliance attempt ownership; automated template protocol validator over templates and installed copies; spec read surfaces; outlines; traceability; context optimisation.

### Implementation Status

- specd-verify routing: packages/skills/templates/skills/specd-verify/SKILL.md.tpl:43-62 (explicit-invocation mapping, "stop before running any hooks", "never run verifying hooks when verification is disabled or bypassed"), :91-136 entry only `If verifying is in lifecycle.availableTransitions`, hooks/transition inside `<!-- route: target -->` blocks with `<target>/<source>` placeholders (:96-111,:123-130,:254-259,:326-338,:371-417,:460). OK
- Prior MEDIUM 2 (fixed-chain prose): verify tpl :59-62 now says "never substitute a fixed state sequence"; the old arrow chain is gone; remaining arrows are `designing` -> `ready` -> human approve (:51-52, spec-consent recovery, not a delivery chain) and `verifying` -> `verifying` not a hop (:136). implement tpl :45 "never fall back to a fixed `ready -> implementing -> verifying` sequence" is a prohibition (regex needs a second arrow; passes). RESOLVED.
- Installed copies re-synced: all five (.claude/.agents/.codex/.github/.opencode)/skills/specd-verify/SKILL.md contain the reworded paragraph (grep count 1 each); copies are git-ignored, and the validator test asserts existence and content for all of them.
- Validator: packages/skills/test/template-protocol.spec.ts:13-78 (literal-transition, literal-hook, fixed-completion, routed-literal-target, text-approvals-read, new `fixed-chain` rule :27-29,:77), runs over templates and 5 copies x 4 skills (:131-146) plus shared.md.tpl check (:148-153). Spec lists three rules; extra rules are stricter, consistent.
- specd-new state table (specd-new/SKILL.md.tpl:143-153) keys suggestions off `nextAction.targetStep`, so it follows Core routing; it is outside the validator's four-skill scope (spec scope = design/implement/verify/archive). Consistent with spec; LOW note.
- Approvals from structured status: `text-approvals-read` rule + no `approvals:` line parsing in templates (validator passes). OK
- shared.md.tpl: no fixed delivery-state hook list (test :148). OK

### Discrepancies

- LOW: scenario "Skill does not invent optional-step policy" and the "empty effective skip-check set needs no invented condition / done remains mandatory regardless of signoff configuration" bullets of "Generated lifecycle guides preserve semantic routing invariants" have no explicit template sentence or test asserting them (templates simply defer to `availableTransitions` as sole source of legal targets, verify tpl :44-45; no template inspects tasks or `optional`). Behaviour compliant by absence; tests weak (generated-skill-protocol.spec.ts:119-139 only check preferred-default / explicit target / stop-before-hooks phrases).
- LOW: `specd-compliance` / `specd` / `specd-fasttrack` templates are outside the validator; spec limits it to four lifecycle skills, so no violation.

### Test Coverage

- Template protocol validator rules incl. fixed-chain: covered (template-protocol.spec.ts:90-160; local run PASS).
- Current templates and installed copies pass: covered (:131-146).
- Specd-verify skips verifying hooks when disabled: covered by template-workflow.spec.ts:340-347 (phrase) + validator (no literal verifying hook).
- Explicit invocation/stop when target absent; installed copies parity: generated-skill-protocol.spec.ts:104-139, template-workflow.spec.ts:349-356.
- Attempt ownership/delegated compliance: template-workflow.spec.ts:257,283; generated-skill-protocol.spec.ts:91.
- Routing tests on real templates (no in-test routing function): template-workflow.spec.ts only has helper `complianceDecision` (:12) which parses real template content; OK.
- Weak: optional-step policy non-invention; `done` mandatory regardless of signoff (LOW).
- Focused runs: skills template-protocol/generated-skill-protocol/template-workflow all PASS; CLI status/transition/validate/artifacts/spec-preview/presenter specs all PASS.

### Summary

Reqs: all compliant; 0 HIGH, 0 MEDIUM, 2 LOW. Prior MEDIUM 2 RESOLVED.

## Batch F totals

- HIGH 0, MEDIUM 1 (new/escalated: cli:change-artifacts bare catch swallows schema resolution failure and identity mismatch, artifacts.ts:58-71, no test), LOW ~12.
- Prior MEDIUM 1 (status canonical order/omit disabled tests): RESOLVED (status.spec.ts:1527-1570).
- Prior MEDIUM 2 (verify fixed-chain prose + installed copies + validator rule): RESOLVED.
- Prior LOW `fatal:` wording in change-validate scenario: RESOLVED (handle-error.ts:45; spec text updated).
- Carried LOW: spec-preview advisories only with --artifact; specd-new table outside validator; no CLI test for --next past disabled step.
- New LOW: hook-skip reason label approximation (`--skip-hooks` for any hook skip when any phase flag is passed); validate --all with zero specIds skips schema resolution; `--all` advisory path untested; single-spec exit-3 path (no --artifact) untested directly.

BATCH VERDICT: FAIL
