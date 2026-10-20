# Partial compliance audit F: CLI and skills

Change: `schema-workflow-skippable-states`
Specs in this batch: `cli:change-status`, `cli:change-transition`, `cli:change-validate`, `cli:change-spec-preview`, `cli:change-artifacts`, `skills:workflow-automation`

Method: I read the merged specs with `changes spec-preview` and checked them against the working-tree code (`git diff HEAD`). I read the code under `packages/cli/src/commands/change/*` and `packages/cli/src/helpers/change-schema.ts` (a new, untracked file), plus the skill templates and tests. Tests I ran:

- CLI: 151 passed, 0 failed (status, transition, validate, spec-preview, artifacts, check-progress-presenter)
- Skills: 50 passed, 0 failed (template-protocol, generated-skill-protocol, template-workflow)

Scope: I audited mainly the delta-touched requirements. For requirements that did not change, I only checked for regressions.

---

## cli:change-status

### Requirements Summary

Delta changes:

- **Lifecycle projections come from GetStatus checks.** The pipeline appears in canonical order. Optional steps get an `[optional]` tag in text and an `optional` flag on structured `availableSteps`. Disabled steps are left out. Bypass paths appear in `availableTransitions`.
- **Artifact DAG.** It comes from the change's own schema via `ResolveChangeSchema`. When resolution fails, the DAG is omitted and the `SCHEMA_RESOLUTION_FAILED` / `SCHEMA_IDENTITY_MISMATCH` blocker is shown.
- **Dependencies.** `core:lifecycle-engine` and `core:resolve-change-schema` were added.

Requirements that did not change but were affected:

- **Schema version warning.** The spec says a stderr `warning:` is printed. The code no longer does this.

### Implementation Status

| Requirement / scenario                                 | Status                                                                                        | Evidence                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Projections come from GetStatus, no local filter       | Implemented                                                                                   | status.ts:304-313, 512-525 pass `lifecycle.*` through unchanged                             |
| `[optional]` in text                                   | Implemented, on the `extras:` line                                                            | status.ts:307-313                                                                           |
| `optional` on structured `availableSteps` and `--help` | Implemented, but only emitted when defined                                                    | status.ts:515-525; help at status.ts:108,111                                                |
| Disabled steps omitted (CLI does not re-add)           | Implemented by pass-through. Core builds `availableSteps` from `resolveWorkflowPipeline`      | core lifecycle-verdict.ts:201-235                                                           |
| Canonical order                                        | Pass-through of Core order                                                                    | (Core concern)                                                                              |
| Bypass paths in `availableTransitions`                 | Pass-through                                                                                  | status.ts:305                                                                               |
| DAG from the change schema                             | Implemented                                                                                   | status.ts:235-237, 404-411 via `resolveChangeSchemaForCli` (helpers/change-schema.ts:15-35) |
| Unresolvable schema: DAG omitted, blocker shown        | Implemented indirectly. Guarded by `lifecycle.schemaInfo !== null`, and blockers are rendered | status.ts:235, 262-271                                                                      |
| Schema version warning on stderr                       | **Removed.** Replaced by `schemaWarnings` (`SCHEMA_VERSION_DRIFT`) on stdout                  | diff of status.ts (old lines 201-210 deleted); status.ts:285-293                            |
| Drafted JSON empties hops                              | Implemented                                                                                   | status.ts:193-194, 147                                                                      |

### Discrepancies

1. **HIGH: Schema version warning requirement contradicts the code.** The merged spec still requires `warning: change was created with schema <recorded> but active schema is <current>` on stderr. It also keeps the "Schema mismatch" verify scenario, which expects a `warning:` on stderr. The implementation removed that warning and now prints `warnings:` / `! SCHEMA_VERSION_DRIFT: …` to stdout and `schemaWarnings` in JSON. The test at status.spec.ts:715-728 asserts the opposite of the spec: `expect(stderr()).not.toContain('active schema')`.
   - (a) Spec drift, which is likely: the design moved version advisories to `ResolveChangeSchema`'s `schemaWarnings`. The cli:change-status delta should modify "Schema version warning" and its scenario, and should document `schemaWarnings` in the JSON contract. The current spec does not mention `schemaWarnings` at all.
   - (b) Implementation bug: if the stderr contract must hold, the warning has to be restored.
2. **LOW: Spec contradicts itself on independent schema resolution.** "Schema version warning" still says "The CLI command MUST NOT resolve the schema independently". The new DAG paragraph allows `ResolveChangeSchema` "directly or through GetStatus", and the code resolves directly (status.ts:236, 408). Resolve this by removing the old sentence.
3. **LOW: No dedicated pipeline line.** The `[optional]` annotation is on the `extras:` line, which is actually the full pipeline from `availableSteps`. The spec says "Show the pipeline". The label `extras:` is misleading.
   - Option (a): rename the line to `pipeline:`.
   - Option (b): have the spec name the line.
4. **LOW: `optional` is only emitted when Core provides it.** `optional` is spread conditionally (status.ts:519). The `--help` text declares `optional: boolean`, which is non-optional. `LifecycleStepVerdict.optional?` is optional in Core (lifecycle-verdict.ts:161). The casts `step as typeof step & { optional?: boolean }` (status.ts:309, 516) are redundant. The legacy top-level `availableSteps` is always `[]` for active changes, so it is not affected.
5. **LOW: The DAG path can fail outright.** The text and JSON DAG paths call `resolveChangeSchemaForCli` with no catch. If GetStatus resolved the schema (`schemaInfo` set) but the second resolution throws, status fails instead of omitting the DAG. This is unlikely, but a double resolution happens on every call.

### Test Coverage

- `[optional]` text and JSON: status.spec.ts:1527-1611
- DAG uses `resolveSchema`: status.spec.ts:752-768. This test is weak because the mock `resolveSchema` delegates to `getActiveSchema` (helpers.ts:298-304), so it does not show that a _different_ DAG is rendered.
- `schemaWarnings` text and JSON: status.spec.ts:715-750
- Drafted JSON: status.spec.ts:74-140
- Transitions follow GetStatus: status.spec.ts:1117-1170

### Missing Tests

- Disabled `verifying` absent from text and JSON (scenario "Pipeline follows canonical order and omits disabled steps"). No test uses a `disabled` fixture.
- "Artifact DAG comes from the change's schema" with a `custom-workflow` DAG that differs from the workspace default.
- Unresolvable schema: DAG omitted and `SCHEMA_RESOLUTION_FAILED` / `SCHEMA_IDENTITY_MISMATCH` blocker shown. No CLI test has `schemaInfo: null` with those blockers.
- The "Schema mismatch" scenario as written: no test exists, and the code contradicts it.

### Spec Dependency Chain

- Consistent with `core:get-status`: Core emits `SCHEMA_RESOLUTION_FAILED` / `SCHEMA_IDENTITY_MISMATCH` (get-status.ts:388-399).
- The JSON contract does not list `schemaWarnings` or `blockers[].details`, although the code emits both (status.ts:444-448).
- `cli:entrypoint` conventions are respected.

---

## cli:change-transition

### Requirements Summary

- **Command signature.** Exactly one of `<step>` or `--next`, enforced with usage errors (exit 1).
- **`--next`.** Passes `to: 'next'` with no local from→to table. Core skips disabled steps, an optional step remains the `next` target, and rejections exit 1 with an explanation.
- **Skipped checks and hooks.** They render as `⊘ … (skipped: reason)`. The re-check is shown only when a hook ran.

### Implementation Status

| Requirement / scenario                                                                  | Status                                                                   | Evidence                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Missing name                                                                            | Implemented (Commander)                                                  | test transition.spec.ts:56-66                                                        |
| Neither step nor `--next`                                                               | Implemented                                                              | transition.ts:203-205                                                                |
| Both                                                                                    | Implemented                                                              | transition.ts:199-201                                                                |
| `to: 'next'` passed through, no table                                                   | Implemented                                                              | transition.ts:372-389                                                                |
| Core resolves via `nextWorkflowStep`; unavailable means `HappyPathNextUnavailableError` | Implemented                                                              | core transition-change.ts:239-246                                                    |
| `--next` rejection exits 1 with explanatory `error:`                                    | Implemented. `HappyPathNextUnavailableError` is now a repair-guide error | transition.ts:95,103,408-416; messages in happy-path-next-unavailable-error.ts:30-43 |
| `--skip-checks` and legacy aliases                                                      | Implemented                                                              | transition.ts:345-359                                                                |
| Skip rendering `⊘` with reason                                                          | Implemented                                                              | \_check-progress-presenter.ts:69-73,156-158                                          |
| Re-check shown only when hooks ran, labelled                                            | Implemented                                                              | \_check-progress-presenter.ts:123-137,143-150                                        |
| No `hook-progress` stream                                                               | Implemented                                                              | transition.ts:232                                                                    |

### Discrepancies

1. **LOW: Skip reason can be wrong.** `skipReason` returns `--skip-hooks` for _any_ skipped hook check whenever _any_ hook phase was skipped (\_check-progress-presenter.ts:70). With `--skip-hooks target.pre`, a `hook.post` that is skipped because no hooks are configured would still be labelled `--skip-hooks`. This is a minor implementation imprecision; the spec only says the reason must be shown.
2. **LOW: Structured failure record can show `to: "next"`.** In structured mode the failure record uses `to: requestedTarget` (transition.ts:426). For `--next` failures that value is the literal `'next'`, not a state. The spec does not forbid it.
3. **INFO:** The `invalid state` validation (transition.ts:207-209) is not in the spec, but it does not conflict with it.

### Test Coverage

- Usage errors: transition.spec.ts:44-80
- `--next` passes through: transition.spec.ts:82-106
- `--next` does not follow the optional shortcut in `nextAction`: transition.spec.ts:108-135
- `ready --next` with the spec gate on: transition.spec.ts:254-278, 372-412
- `signed-off --next`: transition.spec.ts:414
- `--next` failures in pending-spec-approval, pending-signoff, archivable: transition.spec.ts:831-906
- `HappyPathNextUnavailableError` repair guide: transition.spec.ts:1663
- Skip-checks and aliases: transition.spec.ts:1400-1508
- Presenter skip and re-check: check-progress-presenter.spec.ts:39-105 (a new, untracked file)

### Missing Tests

- "Next flag skips disabled step": no CLI test, which is expected because it is a Core concern. Confirm it exists in core `transition-change` / `workflow-topology` tests (batch outside F).
- A transition-command-level test that `--skip-hooks all` renders `⊘ Running … hooks` end-to-end. Coverage is only at the presenter unit level.
- The archive stream (`change-archive`) now shares the re-check suppression presenter. There is no archive regression test for it (out of batch).

### Spec Dependency Chain

- Consistent with `core:transition-change` (`'next'` handled in Core) and `core:lifecycle-engine`.
- Consistent with the `cli:entrypoint` exit-code conventions: usage errors exit 1, hook failure exits 2.

---

## cli:change-validate

### Requirements Summary

- **Artifact model.** The `--all` DAG, `--artifact` resolution and artifact scopes come from the change's own schema.
- **Unresolvable schema.** Exit 3 with an `error:` message, and the identity mismatch is "reported as such".

### Implementation Status

| Requirement / scenario                                       | Status      | Evidence                                                                     |
| ------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| `--all` walks the change-schema DAG                          | Implemented | validate.ts:506-559                                                          |
| `--artifact` resolved against the change schema              | Implemented | validate.ts:327-333                                                          |
| Inline diff uses the change schema                           | Implemented | validate.ts:245                                                              |
| Unresolvable schema exits 3 (`--all` and `--artifact` paths) | Implemented | validate.ts:215-227                                                          |
| Unresolvable schema exits 3 (single spec, no `--artifact`)   | **Partial** | resolution happens only inside `ValidateArtifacts`, so `handleError` decides |
| Identity mismatch reported as such                           | **Partial** | the message passes through, but the structured `code` is overwritten         |

### Discrepancies

1. **MEDIUM: Exit 3 is not guaranteed in single-spec mode.** `specd changes validate <name> <spec>` without `--artifact` never calls `resolveValidateSchema`. Schema failures then go through `handleError` (handle-error.ts:180-197):
   - `SchemaNotFoundError` gives exit 3.
   - `SchemaProviderIdentityMismatchError` (code `SCHEMA_PROVIDER_IDENTITY_MISMATCH`) falls into "all other SpecdError, exit 1".

   This breaks "When the change's schema cannot be resolved, the command SHALL exit with code 3" and "Error cases: schema cannot be resolved, exits with code 3".
   - Fix (a), in the implementation: map `SCHEMA_PROVIDER_IDENTITY_MISMATCH` to exit 3 in `handleError`, or resolve up front in all modes.
   - Fix (b), in the spec: narrow the requirement.

2. **LOW: Structured code overwritten.** `resolveValidateSchema` calls `cliError(message, format, 3, 'SCHEMA_RESOLUTION_FAILED')` (validate.ts:226), which replaces the original code. An identity mismatch is therefore not reported as such in JSON/TOON: the message survives, but the `code` and metadata (expected/actual names) do not.
3. **LOW: Spec says `error:` but exit 3 prints `fatal:`.** The spec says "exit with code 3 and an `error:` message". `cliError` with exit 3 prints `fatal:` (handle-error.ts:43), which follows `cli:entrypoint` ("System errors (exit code 3) … `fatal:` prefix", specs/cli/entrypoint/spec.md:44). This is spec drift within this change: the delta should say `fatal:` or "an error message". The test (change-validate.spec.ts, "exits 3 …") only checks the message text, not the prefix.
4. **LOW, pre-existing, out of delta: crash on change-scoped `--artifact` with no specIds.** If `--artifact <change-scoped>` is used with no specPath and the change has zero specIds, `finalSpecPath!` is `undefined` and gets passed to `parseSpecId` (validate.ts:336-355). The placeholder `specIds[0]` lookup through `changes.list` is also unnecessary, because `specPath` is omitted for change-scoped artifacts.

### Test Coverage

- `--all` uses `resolveSchema`, not `getActiveSchema`: change-validate.spec.ts (new block "change validate — change schema resolution", first test)
- Exit 3 on resolution failure in `--all`: same block, second test

### Missing Tests

- "Artifact ID is resolved against the change schema" (`--artifact` with an id only in `custom-workflow`)
- Exit 3 in single-spec mode, and in `--artifact` mode
- Identity mismatch reporting (code and message)
- The `error:` / `fatal:` prefix assertion

### Spec Dependency Chain

- Conflicts with `cli:entrypoint` on the exit-3 prefix (see discrepancy 3).
- Consistent with `core:resolve-change-schema`.

---

## cli:change-spec-preview

### Requirements Summary

`--artifact` resolution, the scope check and the filename lookup use the change's own schema. Resolution failures and identity mismatches must be reported with a non-zero exit code.

### Implementation Status

| Requirement                                           | Status                              | Evidence              |
| ----------------------------------------------------- | ----------------------------------- | --------------------- |
| Change schema used for `--artifact`                   | Implemented                         | spec-preview.ts:76-83 |
| Failures exit non-zero                                | Implemented (exit 1 via `cliError`) | spec-preview.ts:81-82 |
| Without `--artifact`, schema handled by `PreviewSpec` | Delegated to Core                   | —                     |

### Discrepancies

1. **LOW: Exit codes inconsistent across commands.** Schema failures here exit 1 (`cliError` default). For the same condition, validate exits 3 and `handleError` maps `SchemaNotFoundError` to 3. The spec only requires non-zero, so this is compliant, but the commands disagree. The identity-mismatch structured `code` is also lost (it becomes `CLI_ERROR`).

### Test Coverage

- Resolution failure exits 1 with `error: schema is broken`: spec-preview.spec.ts (new block at the end, around line 669)

### Missing Tests

- "--artifact resolves against the change schema" (positive `custom-workflow` case)
- "Identity mismatch is reported as an error" (a `SchemaProviderIdentityMismatchError` fixture)

### Spec Dependency Chain

Consistent with `core:preview-spec` and `core:resolve-change-schema`.

---

## cli:change-artifacts

### Requirements Summary

The listed artifacts, their order and their `delta` flags come from the change's own schema. Resolution and identity failures exit non-zero.

### Implementation Status

| Requirement                                    | Status                                                                      | Evidence                |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| Delta flags and outputs from the change schema | Implemented                                                                 | artifacts.ts:57-64      |
| Order and listing                              | Uses the `artifactStatuses` order from GetStatus plus the change-schema map | artifacts.ts            |
| Failure exits non-zero                         | Via `handleError`: `SchemaNotFound` exits 3, identity mismatch exits 1      | handle-error.ts:180-197 |

### Discrepancies

None blocking. The spec requires only a non-zero exit, which holds.

### Test Coverage

- Delta metadata from the change schema, `getActiveSchema` not called: change-artifacts.spec.ts:263-296

### Missing Tests

- "Listing follows the change schema" (exact artifacts and declared order of `custom-workflow`)
- Resolution failure and identity mismatch exiting non-zero

### Spec Dependency Chain

Consistent.

---

## skills:workflow-automation

### Requirements Summary

- **Routing.** Skills consume `nextAction` / `availableTransitions` dynamically. An explicit target may be followed if it is advertised.
- **No fixed recipes or invented policy.** No fixed lifecycle recipes, and no invented optional-step policy.
- **Hooks.** Hooks run only for the actual source and target. `specd-verify` suppresses `verifying` hooks when that step is disabled.
- **Approval gating.** Read from structured status.
- **Attempt ownership.** Ownership for verify and compliance, including delegated compliance with `--attempt`.
- **Validator.** An automated validator runs over the real templates and every installed copy, and routing tests must use real templates.

### Implementation Status

| Requirement / scenario                                  | Status                                 | Evidence                                                                       |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Dynamic routing, explicit-target rule                   | Implemented                            | e.g. specd-verify/SKILL.md.tpl:44-60; same block in design, implement, archive |
| Routed blocks with `<target>` / `<source>` placeholders | Implemented                            | verify tpl:100-129, 256, 326-340                                               |
| Disabled `verifying` hook suppression                   | Implemented in prose and routed blocks | verify tpl:52-53, 93-97                                                        |
| Attempt ownership and delegated `--attempt`             | Implemented                            | asserted in generated-skill-protocol.spec.ts:29-60                             |
| Approval gating from structured status                  | **Partial**                            | design tpl:446 tells the agent to read text `approvals:`                       |
| Validator over templates and copies                     | Implemented                            | template-protocol.spec.ts:40-111, all 5 copies present                         |
| Routing tests use real templates                        | Implemented                            | template-workflow.spec.ts:340-357; generated-skill-protocol.spec.ts:104-133    |

### Discrepancies

1. **MEDIUM: Design template parses the text `approvals:` line.** specd-design/SKILL.md.tpl:446 says "Run `changes status <name> --format text` and check the **state:** and **approvals:** fields". This contradicts "Approval gating SHALL be read from structured status (`lifecycle.approvals` and `availableTransitions`), not from parsing text output" and the "Approval gating comes from structured status" scenario. The routed block that follows (line 454) does read `lifecycle.approvals` from toon, so the instructions are mixed. specd-implement/SKILL.md.tpl:85 (`approvals.spec=on`) is ambiguous in the same way.
   - Fix (a): change the template to toon only. This is the template bug reading.
   - Fix (b): have the spec allow text for the state check.

   The validator has no rule for approval parsing, so this goes undetected.

2. **MEDIUM: The validator is weaker than the spec requires.**
   - (i) Anything inside `<!-- route: target -->` blocks is exempt (template-protocol.spec.ts:44-52). The validator does not check that a routed block is actually conditioned on `nextAction` or `availableTransitions`, so a literal fixed recipe wrapped in route markers passes. The validator's own test at :83-93 accepts `transition <name> implementing` inside a routed block.
   - (ii) `FIXED_COMPLETION` only matches ``run `/specd-(implement|verify|archive)`` (case-insensitive). Phrasings such as "Next: `/specd-verify`" or "continue with `/specd-implement`" are not caught.
   - (iii) A missing installed copy passes silently (`if (!existsSync(installed)) return`, :103-104), but the spec says "every installed generated copy". All copies are present today.

   Either strengthen the validator (implementation gap), or accept marker-based routing as the contract and record that in the spec (spec drift).

3. **LOW: Verify template still writes out the fixed sequence.** specd-verify/SKILL.md.tpl (around line 84) says "Lifecycle advancement (`implementing` → `verifying` → `done` → `archivable`) remains a separate authorized action". Fifteen lines earlier the same template says "Do not encode a mandatory `implementing → verifying → done → archivable` sequence". This is descriptive, not a recipe, but it can mislead agents when `verifying` is disabled.
4. **LOW: Fixed `/specd-design` redirects remain.** Examples: verify tpl:342 ("Tell the user to run `/specd-design <name>`"), implement tpl:363, archive tpl:62,294. The spec allows redirecting to `specd-design` for authoring or recovery, so these are acceptable. Still, the "Completion messages SHALL suggest the command from `nextAction.command`" wording could be read to cover them. Clarify in the spec.

### Test Coverage

- Validator positive and negative cases, real templates and 5 copies: template-protocol.spec.ts:66-111
- Phrase parity across copies: generated-skill-protocol.spec.ts:29-133
- Disabled/optional routing phrases: template-workflow.spec.ts:340-347
- Explicit-target rule: template-workflow.spec.ts:349-357
- Attempt ownership: template-workflow.spec.ts:257-307

### Missing Tests

- Approval gating: an assertion that no lifecycle template tells the agent to read the text `approvals:` field.
- A validator check that routed blocks contain only `<target>` / `<source>` placeholders, or appear next to an `availableTransitions` / `nextAction` condition.
- Wider fixed-completion detection.
- Failing when an installed copy is missing.

### Spec Dependency Chain

- Consistent with `cli:change-status` and `cli:change-transition`: the skills use `--next`-free explicit targets from `nextAction`.
- Consistent with `core:get-status`.

---

## Global specs consistency

- **`_global/architecture`**: the CLI stays a thin adapter, and the new `helpers/change-schema.ts` delegates to the Core `resolveSchema` use case. Consistent.
- **`_global/error-handling-conventions` / `cli:entrypoint`**: there are inconsistent exit codes for schema-resolution failures across commands:

  | Command      | Exit code                            |
  | ------------ | ------------------------------------ |
  | validate     | 3                                    |
  | spec-preview | 1                                    |
  | artifacts    | 3 or 1, depending on the error class |

  The validate spec also says `error:` where the entrypoint convention requires `fatal:`.

- **`_global/docs`**: the new helper and functions have JSDoc. No conflict.
- **`_global/testing`**: tests are colocated and the suites pass. Several new spec scenarios have no test (listed above).

---

## Out-of-scope observations

- **public-web build failure.** The JSDoc in `packages/core/src/domain/services/deep-merge-config.ts:6` (`@returns True if value is a Record<string, unknown>`) produces generated API doc `.generated/api/core/functions/isRecord.md`. Its unescaped `<string, unknown>` breaks the MDX compile in `apps/public-web`.
  - **Rules checked:**
    - `_global/docs` "JSDoc on all symbols" (specs/\_global/docs/spec.md:183-190) requires JSDoc content but has no MDX-safety or escaping rule.
    - The docs website-compatibility rule (spec.md:36) covers only `docs/guide/`, not generated API docs.
    - `_global/continuous-integration` (spec.md:29-31) requires `pnpm build`, but says "`typecheck` and `build` MUST skip `@specd/public-web`".
  - **Conclusion:** no current global spec rule is violated. CI as specified would not catch this; only `pnpm -r build` would. This is a gap: either the API-doc generator should escape generics, or `_global/docs` should gain a rule that JSDoc must be MDX-safe (wrap types in backticks).
- **Shared presenter.** `_check-progress-presenter.ts` is shared with `change archive` (`change-archive` stream). The new re-check suppression also changes archive text output without an archive test.

---

## Summary counts

| Spec                       | HIGH  | MEDIUM | LOW         | Missing-test groups |
| -------------------------- | ----- | ------ | ----------- | ------------------- |
| cli:change-status          | 1     | 0      | 4           | 4                   |
| cli:change-transition      | 0     | 0      | 2 (+1 info) | 3                   |
| cli:change-validate        | 0     | 1      | 3           | 4                   |
| cli:change-spec-preview    | 0     | 0      | 1           | 2                   |
| cli:change-artifacts       | 0     | 0      | 0           | 2                   |
| skills:workflow-automation | 0     | 2      | 2           | 4                   |
| **Total**                  | **1** | **3**  | **12**      | **19**              |
