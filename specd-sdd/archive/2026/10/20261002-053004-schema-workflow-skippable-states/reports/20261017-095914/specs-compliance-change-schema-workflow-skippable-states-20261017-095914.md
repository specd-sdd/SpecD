# Specs Compliance Report — change `schema-workflow-skippable-states`

- Mode: delegated (full `/specd-verify`), attempt `verification-attempt-12`
- Date: 2026-10-17/18
- Scope: 30 change specs + global specs (architecture, conventions, testing, error-handling, docs) + depth-1 dependencies
- Batches: A topology/model · B checks · C lifecycle · D schema resolution · E use cases · F CLI/skills

## Baseline evidence

- `pnpm -r test`: all green (core 3073, cli 1116, code-graph 799, skills 93, sdk 77, guide 59, others).
- `pnpm -r typecheck`: green.
- `pnpm -r build`: fails only in `apps/public-web` (MDX compile of generated `isRecord.md`; JSDoc `Record<string, unknown>` in `packages/core/src/domain/services/deep-merge-config.ts:6`, introduced by commit 30d1a06a, outside this change). Out of scope.

## Aggregate counts

| Batch               | HIGH                                                             | MEDIUM            | LOW |
| ------------------- | ---------------------------------------------------------------- | ----------------- | --- |
| A topology/model    | 1 (test gap)                                                     | 2                 | 9   |
| B checks            | 0 → 1 (D-CR-1 reclassified HIGH after orchestrator verification) | 3                 | 9   |
| C lifecycle         | 0                                                                | 5 (+2 LOW-MEDIUM) | 6   |
| D schema resolution | 1                                                                | 2                 | ~16 |
| E use cases         | 0                                                                | 4                 | 12  |
| F CLI/skills        | 1 (spec drift)                                                   | 3                 | 12  |

## Top findings (verified by orchestrator where noted)

1. **HIGH — Embedded built-in checks always pass (B D-CR-1, verified).** Composition `CheckRegistry` is built from `DOMAIN_CHECKS` stubs (`composition-registries.ts:220`; stubs documented "for matcher tests"). `resolveEffectiveBindings` synthesizes bindings from `registry.get()` (`transition-checks.ts:647,695`) and the executor fallback loop does the same (`execute-matching-predicates.ts:266`), so a schema embedding e.g. `impl.linksInScope` at a new coordinate gets a stub that always returns pass (`impl-links-in-scope.ts:48`).
2. **HIGH — Post-archive spec metadata uses workspace default schema (D X1, verified).** `archive-change.ts:605` → `MaterializeSpecMetadata` → `GenerateSpecMetadata.execute` → `_schemaProvider.get()` with no name (`generate-spec-metadata.ts:94`).
3. **HIGH — cli:change-status spec drift (F).** Spec still requires stderr schema-mismatch warning; code emits `SCHEMA_VERSION_DRIFT` under `warnings:` / `schemaWarnings`; test asserts code behavior. Delta must update requirement/scenario.
4. **HIGH (test gap) — Disabled verifying end-to-end through archive (A D-T1 / E #1).** No archive-level test with real reconciler; code path correct.
5. **MEDIUM — run-step-hooks runs `run:` hooks for disabled steps (E #3).** `run-step-hooks.ts:129,177` only check `workflowStep === null`; contradicts get-hook-instructions and design R15.
6. **MEDIUM — LazySchemaProvider resolves default before any named lookup (D X2, verified).** Broken default blocks resolving a change's own schema.
7. **MEDIUM — Single-cascade violated (B D-TC-1/2/3).** Executor re-filters `disabled` by id, fallback loop with own config merge; overlays keep default rows ignoring step `from`/`along`; `seen` dedup + wildcard step-skip rows give wrong config across bypassed steps.
8. **MEDIUM — skippable/bypassFlag read from base bindings (C D-TC2, D-GS2).** `transition-change.ts:651`, `get-status.ts:954-969`.
9. **MEDIUM — Hardcoded verification boundary / recovery command (C D-LE1, D-TC5).** `lifecycle-verdict.ts:974-986`, `lifecycle-guidance.ts:50-55`, `transition-change.ts:746` hardcodes `/specd-verify`.
10. **MEDIUM — Refresh opt-out ignored after hooks (C D-TC1).** `transition-change.ts:379-382`.
11. **MEDIUM — workflow-model scenario expects versioned `get('custom-workflow@1.0.0')` (A D-M1).** Code/change-manifest use name-only + advisory; fix scenario.
12. **MEDIUM — validate exit code/identity-mismatch reporting (F).** Single-spec mismatch exits 1 not 3; JSON code overwritten to `SCHEMA_RESOLUTION_FAILED`.
13. **MEDIUM — skills templates read text `approvals:` (F)** (`specd-design/SKILL.md.tpl:446`); protocol validator weaker than spec.
14. **MEDIUM — missing tests:** get-hook-instructions identity mismatch & post phase; preview-spec error scenarios; schema-std real `schema.yaml` never loaded; CLI fixtures with disabled step / differing custom DAG.

Full per-spec details follow verbatim.

---

# Detailed Findings

---

# Compliance Audit — Batch A (Topology & Model)

Change: `schema-workflow-skippable-states`
Specs: `core:workflow-topology`, `core:workflow-model`, `schema-std:standard-schema`, `core:change-manifest`
Mode: read-only. Merged spec and verify content came from `changes spec-preview`. Code was traced through the graph, then read directly.

Changed parts of the specs (from the deltas):

- `core:workflow-topology`: a new spec. All of it is in scope.
- `core:workflow-model`: modified "Step names reference domain lifecycle states", "Workflow array order is not significant" (renamed from "...is display order and progress axis"), Constraints and Spec Dependencies. Added "Step semantics", "Optional and disabled step declarations", "Workflow step checks and skip-checks declarations" and "Sovereign change schema authority" (position inferred from the delta).
- `schema-std:standard-schema`: modified "Lifecycle Steps and State Transitions" and Spec Dependencies.
- `core:change-manifest`: modified "Schema version".

Requirements the change did not touch were checked only roughly; they are marked "(pre-existing)".

---

## 1. core:workflow-topology

### Requirements Summary

1. Module of pure workflow functions
2. Ordered pipeline construction
3. Forward connectivity by construction
4. Dynamic legal transitions
5. Bypassed step detection
6. Topological forward progression
7. Step enablement and verification boundary

### Implementation Status

| #   | Requirement                          | Status                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pure functions                       | Implemented                                | `packages/core/src/domain/services/workflow-topology.ts:147,161,180,225,246,269` exports the 6 named functions. The helpers `isDrainState`, `buildActivePipeline` and `forwardTargets` (:57,69,110) are not exported. The barrel `domain/services/index.ts:162-171` re-exports only the 6 functions plus the `ApprovalGates` and `PipelineStep` types. There is no `WorkflowTopology` class anywhere in `src` or `test`.                                                                                                                  |
| 2   | Ordered pipeline                     | Implemented                                | `CANONICAL_PIPELINE` (:32-41) fixes the order and the row order is ignored (:94-98). Disabled steps are filtered out and optional steps keep their flag. Bedrock optional/disabled throws (:79-84). The `ready` anchor throws when `approvals.spec` is true (:85-90). Drain states never enter the pipeline. Nothing depends on signoff.                                                                                                                                                                                                  |
| 3   | Connectivity                         | Implemented                                | Holds by construction. There is no reachability guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Legal transitions                    | Implemented, with minor nuances            | Forward targets plus shortcuts across optional steps (:110-134). Backward edges only when `VALID_TRANSITIONS` admits them and the target sits earlier (:200-211). Archive boundary is enforced (:122-127). Drain states return only `VALID_TRANSITIONS` exits, filtered by enablement (:191-193). A disabled source returns `[]` (:185-187). See D-T3 and D-T4.                                                                                                                                                                           |
| 5   | Bypassed steps                       | Implemented                                | :246-259                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Next step                            | Implemented, with an extra drain behaviour | :269-293. Drain states get special handling the spec does not mention (D-T4).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | Enablement and verification boundary | Implemented                                | `isWorkflowStepEnabled` :161-170. It is consulted by reconciliation (`reconcile-change-validity.ts:297`), the lifecycle verdict (`lifecycle-verdict.ts:975`, `lifecycle-evaluation.ts:40`), sign-off (`approve-signoff.ts:107`) and invalidate-verification (`invalidate-verification.ts:78`). Archive does not call it directly; it uses the reconciled verdict (`archive-change.ts:1424`, `verification !== 'not-required'`). `verification.current` skips on `not-required` (`domain/checks/verification-current.ts:36-38`). See D-T2. |

### Discrepancies

- **D-T1 (HIGH, missing end-to-end test; confirms the known lead).** The scenario "Disabled verifying never requires verification evidence end to end" needs a change with `verifying` disabled to go `implementing → done → archivable` and then archive, using the real validity reconciler. No such test exists.
  - `packages/core/test/application/use-cases/reconcile-change-validity.spec.ts:300-316` only checks the reconcile verdict (`not-required`, no `VERIFICATION*` blockers) for a change already in `done`.
  - `approve-signoff.spec.ts:179-206` covers sign-off with no evidence, but through the use-case builder and not the real reconciler on the archive path.
  - `transition-change.spec.ts:3661-3742` covers `implementing → next → done` with verifying disabled. It stops at `done`, and its `countTasks` and validity are stubbed.
  - `archive-change.spec.ts` contains no disabled-verifying or `not-required` case at all.
  - Implementation bug or spec drift? The production code looks correct: archive gates on `verdict.verification`, and the reconciler returns `not-required` when verifying is disabled. So this is a gap in test coverage, not an implementation bug. The only way it is spec drift is if the authors meant the scenario to be covered by unit tests composed together; the scenario explicitly says "no test double for verification validity" and "archive succeeds".
- **D-T2 (LOW, spec wording vs. design).** Requirement 7.1 says every consumer, archive included, "SHALL consult `isWorkflowStepEnabled('verifying', schema)`". Archive (`archive-change.ts:1416-1430`) only reads the reconciled verdict, which consults it indirectly.
  - Spec drift reading: the spec should say "consult it directly or through the reconciled validity verdict".
  - Implementation bug reading: archive would need its own direct check. The current behaviour is equivalent, so the spec wording is the better thing to fix.
- **D-T3 (LOW, spec ambiguity).** Requirement 4.3 admits backward or redesign edges only when "the destination precedes `from`". The code always admits `designing` as redesign (`workflow-topology.ts:205`), including the self-edge `designing → designing` that `VALID_TRANSITIONS` defines (`change-state.ts:33`). The test at `workflow-topology.spec.ts:148` expects `['done','designing']` from `designing`.
  - The spec's own "Bypassed step detection" 4 mentions "(backward or self)", so the self-edge is anticipated but never stated as legal.
  - Spec drift reading: add "the `designing` redesign self-edge is legal". Implementation bug reading: drop the self-edge. Spec drift is more likely.
- **D-T4 (LOW, behaviour the spec does not define).** `nextWorkflowStep` special-cases drain states (:274-287): `pending-*` returns `null`, `signed-off` returns `'archivable'`, and `spec-approved` is treated as `ready`. The spec only defines `archivable`/`archiving` as returning `null`, and it forbids normalizing drain states only for `listWorkflowTransitions`.
  - Edge case: with `implementing` disabled, `nextWorkflowStep('spec-approved')` returns `verifying`. That is not legal, because `listWorkflowTransitions('spec-approved')` only yields `designing` (`implementing` is filtered out and `verifying` is not in `VALID_TRANSITIONS['spec-approved']`). The next step and the legal set disagree.
  - Spec drift reading: document drain-state next-step semantics. Implementation bug reading: make `nextWorkflowStep` return only members of `listWorkflowTransitions`.
- **D-T5 (LOW, weak test).** `workflow-topology.spec.ts:327-337` is named "enforces approval anchors through bypass and next-step queries", but it disables `done`. That is a bedrock violation and throws whatever the approvals are, so it does not show that the functions honour the approval snapshot. Only `:258-268` (`ready` disabled with `spec: true`) does that, and only for `listWorkflowTransitions` and `isWorkflowTransitionLegal`.

### Test Coverage (`packages/core/test/domain/services/workflow-topology.spec.ts` unless noted)

| Scenario                                                                                         | Coverage                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Topology is consumed as named function imports                                                   | Uncovered. No test inspects exports; it only holds structurally.                                                              |
| Pipeline excludes disabled steps and annotates optional ones                                     | Partial. :34 covers optional and :44 covers disabled, separately. The combined schema at :290 checks only the bypassed steps. |
| Noncanonical row order is normalized silently                                                    | Covered :86 (no check that per-row properties attach to their own step).                                                      |
| Reordered rows cannot skip required steps or spec approval                                       | Partial. :112 uses `approvals.spec: false`, while the scenario needs `true`. It never asserts `ready → implementing` only.    |
| Explicit noncanonical bedrock declarations are normalized                                        | Covered :60                                                                                                                   |
| Disabling bedrock state throws                                                                   | Covered :151, :158                                                                                                            |
| Done is mandatory even when signoff is disabled                                                  | Covered :172, :181                                                                                                            |
| Disabled signoff skips its check rather than done                                                | Partial. Check side: `test/domain/checks/approval-signoff.spec.ts:6`. Pipeline side is implicit. No combined test.            |
| Disabling active approval gate anchor throws                                                     | Covered :165                                                                                                                  |
| Drain states are never pipeline steps                                                            | Covered implicitly :17 (exact `toEqual`)                                                                                      |
| Disabling every configurable delivery step keeps the path connected                              | Covered :130                                                                                                                  |
| Disabling implementing and verifying routes ready to done                                        | **Uncovered**                                                                                                                 |
| Shortcut transitions allowed across optional steps                                               | Covered :232                                                                                                                  |
| Shortcut stops at the first non-optional step                                                    | Partial. :232 never asserts that `done` is absent.                                                                            |
| Transitions to disabled steps are prohibited                                                     | Covered :242                                                                                                                  |
| Pipeline order does not invent backward protocol edges                                           | Covered :229                                                                                                                  |
| Backward VALID_TRANSITIONS edges remain legal (`verifying` gives `implementing` and `designing`) | **Uncovered**                                                                                                                 |
| Drain states gain no forward shortcuts                                                           | Covered :343, :352 (exact exit lists; the `isWorkflowTransitionLegal` form is not asserted)                                   |
| Disabled source has no transitions                                                               | Covered :252                                                                                                                  |
| Legal-transition functions honor the supplied approval snapshot                                  | Partial. :258 only; :327 is a false positive (D-T5).                                                                          |
| Detection of intermediate optional steps                                                         | Covered :284                                                                                                                  |
| Immediate step transition returns no bypassed steps                                              | Covered :272                                                                                                                  |
| Backward transition returns no bypassed steps                                                    | Partial. :278 uses `implementing → designing`, not `verifying → designing`; equivalent in substance.                          |
| Next forward step skips disabled states                                                          | Covered :316                                                                                                                  |
| Next forward step enters an enabled optional step                                                | Covered :367                                                                                                                  |
| Terminal states return null                                                                      | Covered :321                                                                                                                  |
| Disabled verifying relaxes verification boundary                                                 | Covered :208                                                                                                                  |
| Disabled verifying never requires verification evidence end to end                               | **Uncovered** (D-T1)                                                                                                          |
| Bedrock states are always enabled                                                                | Covered :199                                                                                                                  |

### Missing Tests

1. An end-to-end test with verifying disabled: real reconciler, through `ArchiveChange` (D-T1).
2. `listWorkflowTransitions('ready')` includes `done` with implementing and verifying disabled, and `listBypassedWorkflowSteps('ready','done')` is `[]`.
3. `listWorkflowTransitions('verifying')` includes `implementing` and `designing`.
4. The reordered-rows test with `approvals.spec: true`, asserting the exact forward targets.
5. The shortcut test asserting `done` is not in the result.
6. An approval-snapshot test for `listBypassedWorkflowSteps` and `nextWorkflowStep` that uses the `ready` anchor rather than a bedrock state.
7. An export-surface test: no `WorkflowTopology` class, helpers not exported.

### Spec Dependency Chain Consistency

- `_global/architecture` ("Pure functions for stateless domain services", "Domain layer is pure"): consistent. The module has no I/O and no class.
- `_global/conventions`: named exports and explicit return types are present. Errors are `SchemaValidationError`, a `SpecdError` subclass: consistent.
- `_global/testing`: the test file sits at the mirrored path `test/domain/services/workflow-topology.spec.ts`: consistent.
- `core:workflow-model`: consistent on bedrock, anchor, connectivity and omission defaults.

---

## 2. core:workflow-model

### Requirements Summary

1. Step names reference domain lifecycle states (modified)
2. Step semantics (added)
3. Optional and disabled step declarations (added)
4. Workflow step checks and skip-checks declarations (added)
5. Sovereign change schema authority (added)
6. Requires-based gating (pre-existing)
7. Task completion gating (pre-existing)
8. Step check declarations (pre-existing)
9. Step availability evaluation (pre-existing)
10. Workflow array order is not significant (modified/renamed)
11. Step-to-state mapping (pre-existing)
12. Hook execution at step boundaries (pre-existing)
13. Two execution modes (pre-existing)
14. Step requires reference artifact IDs (pre-existing; verify modified)

### Implementation Status

| #          | Requirement           | Status                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | Step names            | Implemented                                | `build-schema.ts:719-733`: invalid lifecycle state and drain-only state both throw `SchemaValidationError`. Duplicate rows are rejected at :711-717.                                                                                                                                                                                                                                                                                          |
| 2          | Step semantics        | Implemented (behavioural, owned elsewhere) | The routing outcomes live in the verification and transition use cases. The `VALID_TRANSITIONS` backward edges exist (`change-state.ts:38`).                                                                                                                                                                                                                                                                                                  |
| 3          | Optional/disabled     | Implemented                                | Parsing at `build-schema.ts:699-708`; bedrock checks at :734-745; skip-check evaluation in `evaluate-transition-candidate` and get-status. The anchor is enforced at resolve/validate time when approvals are supplied (`resolve-schema.ts:121-126`, `validate-schema.ts:81-85`), and composition passes `config.approvals` (`composition-resolver.ts:587-594`, `schema-resolution.ts:76-83`, `composition/use-cases/validate-schema.ts:39`). |
| 4          | checks/skipChecks     | Implemented, with one nuance (D-M2)        | `build-schema.ts:798-946` handles unknown checks, coordinate uniqueness, the four locks, and the invalid `from` (:800). skipChecks on a disabled step is rejected at :746-748.                                                                                                                                                                                                                                                                |
| 5          | Sovereign authority   | Implemented, with a wording nuance (D-M1)  | `application/services/resolve-change-schema.ts` resolves the recorded name. A same-name version drift becomes an advisory (:72-80). A provider name mismatch throws `SchemaProviderIdentityMismatchError` (:65).                                                                                                                                                                                                                              |
| 6-9, 11-14 | Pre-existing          | Implemented (rough check)                  | `requires` must reference declared artifacts (`build-schema.ts:950-959`), including step names.                                                                                                                                                                                                                                                                                                                                               |
| 10         | Order not significant | Implemented                                | The axis comes from `resolveWorkflowPipeline` (`transition-checks.ts:169`).                                                                                                                                                                                                                                                                                                                                                                   |

### Discrepancies

- **D-M1 (MEDIUM, conflict inside the spec).** The scenario "Change preserves its recorded schema identity across project reconfigurations" expects `SchemaProvider.get('custom-workflow@1.0.0')`, a reference carrying a version.
  - The code looks schemas up by name only (`transition-change.spec.ts:3740`: `get('custom-sovereign-schema')`) and reports version drift as an advisory (`resolve-change-schema.ts:72-80`).
  - `core:change-manifest` "Schema version" (same change) says the version advisory belongs to `ResolveChangeSchema` after a "sovereign named lookup". That matches the code and contradicts the `@1.0.0` lookup form.
  - Most likely spec drift: the workflow-model scenario should name the lookup by schema name. The other reading, an implementation bug, would mean version-pinned resolution, which nothing else in the change supports.
- **D-M2 (LOW, governance divergence).** The spec says a check with `allowBindingOverride: false` "CANNOT be embedded ... unless already bound by kernel registration".
  - `build-schema.ts:839-842` and :906-909 exempt only plugin (`@`-prefixed) checks that have a matching binding. Built-in locked checks are never embeddable, not even at their own kernel-bound coordinate. Test `build-schema.spec.ts:925-955` puts e.g. `verification.current` on `verifying`; its kernel binding targets `done`, so the test does not exercise the "already bound" case.
  - Spec drift reading: state that built-in Category A/B checks are never embeddable. Implementation bug reading: exempt built-ins at their kernel coordinate.
- **D-M3 (LOW, weak or false-positive tests).**
  - `transition-checks.spec.ts:68-76` ("given implementing omitted from workflow") classifies against `SCHEMA_STD`, which declares `implementing` (`packages/schema-std/schema.yaml` around line 679). So the "omitted" condition is never actually exercised.
  - No test covers the scenarios "Noncanonical row order does not change the axis" or "Disabled steps are excluded from progress axis" (`ready → done` should be forward with verifying disabled) at the `classifyAlong` level.
- **D-M4 (LOW, small wording mismatch between specs).** `schema-std:standard-schema` 4 says optional steps are "skippable when associated task/implementation skip checks pass". `core:workflow-model` says that with no effective step-skip bindings the bypass is unconditional. Not a contradiction, but the standard-schema wording suggests skip checks always exist. Suggest aligning it to "when its effective step-skip checks, if any, pass".

### Test Coverage (changed requirements)

| Scenario                                                                            | Coverage                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid step name rejected                                                          | Covered `build-schema.spec.ts:40`                                                                                                                                                       |
| Drain-state row rejected                                                            | Covered `build-schema.spec.ts:1773-1782`                                                                                                                                                |
| Omitted workflow row does not delete the protocol state                             | Partial. `workflow-topology.spec.ts:214` checks enablement only. No assertion that `workflowStep('implementing')` is null or that `ready → implementing` is legal with the row omitted. |
| implementation-failure / artifact-review-required / drifted forces redesign         | Covered outside this batch (verification use cases); not re-verified here.                                                                                                              |
| Schema parses optional and disabled properties                                      | Covered `build-schema.spec.ts:66-76`, `schema-yaml-parser.spec.ts:37`                                                                                                                   |
| Bedrock states cannot be disabled                                                   | Covered `build-schema.spec.ts:50,58`                                                                                                                                                    |
| Done remains mandatory when signoff is disabled                                     | Covered `workflow-topology.spec.ts:172-188`, `approval-signoff.spec.ts:6`                                                                                                               |
| Active approval anchors cannot be disabled (build/resolve, incl. `schema validate`) | Partial. Resolve side: `resolve-schema.spec.ts:1670-1700`. No `ValidateSchema` test with `approvals.spec: true` (`validate-schema.spec.ts` has no approvals case).                      |
| Disabling every configurable delivery step is valid                                 | Covered `workflow-topology.spec.ts:130`, `resolve-schema.spec.ts:1670+` ("accepts ... when spec gate is off")                                                                           |
| Optional step with no effective skip checks is unconditional                        | Covered `get-status.spec.ts:503`                                                                                                                                                        |
| Skills cannot redefine optionality                                                  | Uncovered. It is a skill-content rule; no automated test.                                                                                                                               |
| Schema builds step checks and skip-checks declarations                              | Covered `build-schema.spec.ts` (skipChecks suite :1337+)                                                                                                                                |
| Unknown check ID throws UnknownCheckError                                           | Covered `build-schema.spec.ts:883,1338`                                                                                                                                                 |
| Duplicate coordinate throws DuplicateCheckBindingError                              | Covered `build-schema.spec.ts:897`, :1372                                                                                                                                               |
| Unknown checks from state is rejected                                               | Covered `schema-yaml-parser.spec.ts:894` (the domain-level check `build-schema.ts:800` is untested)                                                                                     |
| Embedding / override / config / disable lock errors                                 | Covered `build-schema.spec.ts:925-955, 1011, 1100, 1184, 1217, 1429, 1467, 1557, 1566`                                                                                                  |
| skipChecks on disabled step throws                                                  | Covered `build-schema.spec.ts:1603`                                                                                                                                                     |
| Change preserves its recorded schema identity                                       | Partial. `transition-change.spec.ts:3661`, `resolve-change-schema.spec.ts:36,55`, `change-repository.spec.ts:2667` cover it, but none uses the `@1.0.0` form (D-M1).                    |
| LazySchemaProvider caches schemas by reference                                      | Covered `composition/lazy-schema-provider.spec.ts:23`                                                                                                                                   |
| Step-to-step circular dependencies are impossible                                   | Covered `build-schema.spec.ts:1793`                                                                                                                                                     |
| Noncanonical row order does not change the axis                                     | Partial. Pipeline side `workflow-topology.spec.ts:86`. No `classifyAlong` test with shuffled rows.                                                                                      |
| Disabled steps are excluded from progress axis                                      | Partial. Pipeline side `workflow-topology.spec.ts:44`. `ready → done` forward classification is untested.                                                                               |
| Omitted listed step / omitted implementing keeps retry backward                     | False positive (D-M3)                                                                                                                                                                   |

### Missing Tests

1. A `ValidateSchema` test showing `ready` disabled with `approvals.spec: true` fails (project, file and raw modes).
2. `workflowStep(state)` is null for an omitted row, and the hop stays legal.
3. `classifyAlong` with shuffled rows, and with verifying disabled (`ready → done` gives `forward`).
4. Fix the omitted-implementing tests to use a schema that actually omits the row.
5. A domain-level test for an invalid `from` in `buildSchema` (:800).

### Spec Dependency Chain Consistency

- `core:workflow-topology`: consistent.
- `core:change-manifest` and `core:change`: they conflict on the lookup form (D-M1).
- `core:build-schema` and `core:schema-format`: consistent on the validation sites. `buildSchema` has no approvals argument, so the anchor rule depends on `ResolveSchema` and `ValidateSchema` receiving approvals. The spec allows this ("built or resolved with the project approvals").
- `_global/error-handling-conventions`: the error classes are typed `SpecdError` subclasses. The topology error messages (`workflow-topology.ts:80-89`) say what is wrong but not how to fix it. That is LOW under "Actionable Messaging"; no separate finding is counted.

---

## 3. schema-std:standard-schema

### Requirements Summary

Nine requirements: Canonical Schema Definition, DAG Invariants, Proposal, Specs, Verify, Design, Tasks, Cross-Artifact Validations, Metadata Extraction, Lifecycle Steps and State Transitions (modified), and Schema Package Distribution. Only Lifecycle Steps changed.

### Implementation Status

| Requirement                           | Status                       | Evidence                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lifecycle Steps and State Transitions | Implemented                  | `packages/schema-std/schema.yaml:644-725` declares exactly `designing`, `ready`, `implementing`, `verifying` and `archiving`, each with explicit `optional: false` and `disabled: false`. No drain rows. `done`, `archivable` and `drafting` are not declared, so they default to enabled. |
| Schema Package Distribution           | Implemented                  | `package.json` `files: [schema.yaml, templates/]`, no build step.                                                                                                                                                                                                                          |
| Others                                | Pre-existing; not re-audited | —                                                                                                                                                                                                                                                                                          |

### Discrepancies

- **D-S1 (LOW, spec drift).** Requirement item 1 lists `archived` as a protocol-owned lifecycle anchor. `ChangeState` (`change-state.ts:6-18`) has no `archived` state; archiving moves the change out of the active set instead. `core:workflow-model` lists the eight canonical states without `archived`. Most likely spec drift: drop `archived` or call it "the archived outcome". The implementation-bug reading has no support.
- **D-S2 (LOW).** Item 4's `optional` wording (see D-M4).
- **D-S3 (MEDIUM, test gap).** The package has no `test/` directory, and no test anywhere loads the real `schema.yaml` to check its workflow rows. CLI and core `schema validate` tests use mocked raw data (`validate-schema.spec.ts:78,134`, `cli/test/commands/schema-validate.spec.ts:221+`). The changed scenarios ("Standard lifecycle steps and transitions are defined", "Schema supports optional and disabled flags", "Signoff off skips the check but not done") are verified only indirectly, through generic `buildSchema` tests.

### Test Coverage

| Scenario                                             | Coverage                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Standard lifecycle steps and transitions are defined | **Uncovered** against the real `schema.yaml`                             |
| Schema supports optional and disabled flags          | Indirect (`build-schema.spec.ts:66`)                                     |
| Signoff off skips the check but not done             | Indirect (`approval-signoff.spec.ts:6`, `workflow-topology.spec.ts:172`) |
| All pre-existing scenarios                           | Uncovered by tests specific to schema-std (pre-existing gap)             |

### Missing Tests

1. A test that loads `@specd/schema-std/schema.yaml` through `buildSchema` and asserts the workflow rows, the absence of drain rows, and an unchanged `resolveWorkflowPipeline` result under both signoff settings.

### Spec Dependency Chain Consistency

- `core:workflow-model`: consistent apart from D-S1 and D-M4.
- `_global/architecture`: "schema-\* has no specd deps" holds; the package has no dependencies.

---

## 4. core:change-manifest

### Requirements Summary

Manifest structure; Manifest format compatibility; Archive outcome history events; Artifact filenames use expected paths; Filename normalization preserves tracked intent; Schema version (modified); Fingerprint serialization; Verification attempt event serialization; Atomic writes. Only Schema version changed.

### Implementation Status

| Requirement    | Status                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema version | Implemented                  | `infrastructure/fs/change-repository.ts` and `manifest-change-loader.ts` only copy `manifest.schema.{name,version}` (`manifest-change-loader.ts:92,277`, `change-repository.ts:1367,1473`). There is no comparison with the workspace default and no warning. The advisory lives in `application/services/resolve-change-schema.ts:72-80`. A name mismatch raises `SchemaProviderIdentityMismatchError` at the resolution boundary (:65), not in the repository. |
| Others         | Pre-existing; not re-audited | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Discrepancies

- **D-C1 (LOW, missing test).** The scenario "Archiving with schema version mismatch remains allowed" has no archive-level test. `archive-change.spec.ts:334` uses the recorded sovereign schema, but its versions match.
- See D-M1 for the conflict with the workflow-model `@1.0.0` lookup form.

### Test Coverage

| Scenario                                                        | Coverage                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Loading never compares the version with the workspace default   | Covered `test/infrastructure/fs/change-repository.spec.ts:2686`                                                 |
| Same-name version drift is reported only by ResolveChangeSchema | Covered `test/application/services/resolve-change-schema.spec.ts:128` (the repository side is covered by :2686) |
| Schema name differs from workspace default                      | Covered `change-repository.spec.ts:2667`                                                                        |
| Archiving with schema version mismatch remains allowed          | **Uncovered**                                                                                                   |

### Missing Tests

1. An `ArchiveChange` test with recorded version N and resolved version N+1: archive succeeds and the advisory is surfaced.

### Spec Dependency Chain Consistency

- `core:change`, `core:storage`: consistent. The schema field is written once; nothing re-writes `schema`.
- `core:workflow-model`: lookup-form conflict (D-M1).

---

## Summary

**Requirements (all 4 specs): 37 total**

- workflow-topology 7, workflow-model 14, standard-schema 11 (counting each artifact contract as one), change-manifest 9. That is 41 with all artifact contracts counted; the 37 normalises the schema-std artifact contracts into groups.
- Changed or added requirements in scope: 7 (topology) + 6 (model) + 1 (schema-std) + 1 (manifest) = **15**.
  - Implemented: 15.
  - Partial (minor nuance or divergence, behaviour present): 4. These are topology R4/R6 (D-T3, D-T4), model R4 (D-M2) and model R5 (D-M1 wording).
  - Missing: 0.

**Scenarios for changed requirements: about 64**

- Covered: 38
- Partial or indirect: 17
- Uncovered: 9. These are: topology export surface, `ready → done` with implementing and verifying disabled, `verifying` backward edges, the disabled-verifying end-to-end scenario, skills not redefining optionality, standard lifecycle rows against the real `schema.yaml`, archive with version mismatch, plus 2 false-positive along tests counted as uncovered.

**Findings by severity**

- HIGH (1): D-T1, no end-to-end disabled-verifying test through archive with the real reconciler (lead confirmed; `reconcile-change-validity.spec.ts:300` covers status only).
- MEDIUM (2): D-M1, `@version` lookup form conflicts with name-only sovereign lookup; D-S3, nothing tests the real schema-std `schema.yaml`.
- LOW (8): D-T2, D-T3, D-T4, D-T5, D-M2, D-M3, D-M4/D-S2, D-S1, D-C1. That is nine IDs; D-M4 and D-S2 are one issue counted once.

---

# Partial Compliance Report — Batch B (checks)

Change: `schema-workflow-skippable-states`
Specs: `core:check-registry`, `core:transition-checks`
Mode: read-only audit (no code, spec, or workflow state modified)

Key source files:

- `packages/core/src/domain/services/transition-checks.ts` (TT)
- `packages/core/src/domain/services/check-registry.ts` (CR)
- `packages/core/src/domain/services/check-bindings.ts` (CB)
- `packages/core/src/application/services/execute-matching-predicates.ts` (EMP)
- `packages/core/src/application/services/evaluate-transition-candidate.ts` (ETC)
- `packages/core/src/application/checks/workflow-check-registry.ts` (app WCR)
- `packages/core/src/composition/use-cases/workflow-check-registry.ts` (comp WCR)
- `packages/core/src/composition/composition-registries.ts` (COMP)
- `packages/core/src/domain/services/build-schema.ts` (BS)
- `packages/core/src/domain/services/merge-schema-layers.ts` (MSL)

---

## Spec: core:check-registry

### Requirements Summary

1. Open check registry (get/has/list/bindings)
2. Immutability of built-in checks (16 built-ins injected; `@<plugin>.<id>` namespace; `InvalidPluginNameError` only on grammar violation)
3. Canonical namespacing and plugin registration (`register(pluginName, check, defaultBindings?, options?)`, `DuplicateCheckError`)
4. Adapt `CustomCheckDefinition` to internal `Check` (`kind: 'predicate'`, `InvalidCheckKindError`)
5. Binding coordinate identity and duplicate prevention (transition/archive/step-skip; `DuplicateCheckBindingError`)
6. Two-tier governance and confinement locks (check-level confinement, binding-level policy lock, config lock, disable lock, monotonic rule, built-in categories A/B/C, composition fidelity incl. plugin step-skip defaults)
7. Cascading configuration hierarchy (check default -> binding config -> step config, into `ctx.config`)

### Implementation Status

| Requirement                          | Status                           | Evidence                                                                                                                         |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Open check registry                  | Implemented                      | CR:124-164 (`get`, `has`, `list`, `bindings`, plus `getBindings`, `getGovernance`)                                               |
| Immutability of built-ins            | Implemented                      | CR:75-116 constructor injects `DOMAIN_CHECKS`; no unregister/replace API; namespace forced at CR:207                             |
| Canonical namespacing / registration | Implemented                      | CR:188-211, regex CR:18 `^[a-zA-Z0-9_-]+$`                                                                                       |
| CustomCheckDefinition adaptation     | Implemented                      | CR:213-231                                                                                                                       |
| Coordinate identity / duplicates     | Implemented                      | CR:47-58 `coordinateKey`, CR:283-301                                                                                             |
| Two-tier governance                  | Partial                          | See D-CR-1, D-CR-2, D-CR-3, D-CR-4                                                                                               |
| Category A/B/C init                  | Implemented (governance)         | CR:79-104; CB:29-227 explicit binding locks                                                                                      |
| Composition fidelity                 | Implemented                      | COMP:220-236 forwards all four governance fields; comp WCR:74-82 forwards plugin `step-skip` bindings into transition base table |
| Cascading config                     | Implemented, with duplicate site | TT:603-611 single-pass cascade; second merge site at EMP:282-285 (see D-TC-2)                                                    |

### Discrepancies

**D-CR-1 (MEDIUM) — Synthesized/embedded Category C built-ins run domain stubs, so they always pass.**
`createCompositionRegistryView` builds the `CheckRegistry` from `DOMAIN_CHECKS` (COMP:220-223). Domain built-ins such as `deps.consistent`, `workspace.readOnly`, `impl.linksInScope`, `spec.overlap` have stub `execute` bodies that always pass ("Domain stub execute. Application `create*` owns I/O": `packages/core/src/domain/checks/deps-consistent.ts` ~L98-107, `workspace-read-only.ts`, `impl-links-in-scope.ts`, `spec-overlap.ts:76-82`). When a schema embeds a Category C check at a coordinate not covered by a base binding (allowed by governance, for example `deps.consistent` on `verifying.checks` or `workspace.readOnly` on `implementing.skipChecks`), `resolveEffectiveBindings` synthesizes a binding with `registry.get(chk.id)` (TT:647, TT:695), and the EMP fallback does the same (EMP:266). Both return the domain stub, not the composed `create*` instance from app WCR:75-112. The embedded check then passes silently.

- Possibility A (implementation bug): synthesis should take the check instance from the composed base bindings (same id) and fall back to `registry.get` only for plugin checks. This is the likely reading, because the spec permits "project schemas to declare them on workflow steps" (Category C) and that only makes sense if the check is real.
- Possibility B (spec drift): the spec would have to say that Category C embedding only re-configures existing coordinates. That contradicts check-registry req 6.6 and transition-checks "Registry bindings… Category C … permitting project schemas to bind them to workflow steps".
- No test covers embedding a Category C built-in at a new coordinate and checking that its real failure surfaces.

**D-CR-2 (LOW) — `applyBindingSpecs` defaults `allowConfigOverride` to `true` and does not inherit it from governance.**
TT:526 sets `allowConfigOverride: spec.allowConfigOverride ?? true`, while `allowBindingOverride` and `allowDisable` inherit from `governanceOf` (TT:524-527). transition-checks says: "When a binding (built-in or plugin) omits a governance field, it SHALL inherit the check-level governance value; binding construction MUST NOT substitute a permissive default". check-registry req 6.5 lists `allowConfigOverride` as a governance lock. Two things limit the impact today. First, `buildSchema` checks the check-level lock independently before the binding lock (BS:871, BS:938). Second, synthesized bindings inherit correctly (TT:664, TT:705). The effective `CheckBinding.allowConfigOverride` is still wrong for plugin default bindings when `allowConfigOverride: false` is set at check level and omitted on the binding, and built-in Category A/B bindings report `allowConfigOverride: true`.

- Possibility A (bug): use `spec.allowConfigOverride ?? governanceOf?.(spec.id)?.allowConfigOverride ?? false` (or `true` only when no governance exists).
- Possibility B (spec drift): the requirement names only `allowBindingOverride` in its example; the spec could say explicitly that config lock inheritance is enforced at validation time only. The current wording ("a governance field") covers all three locks.
- Test gap: `check-bindings.spec.ts:59` asserts inheritance only for `allowBindingOverride` and `allowDisable`.

**D-CR-3 (LOW) — Schema layer merge identity is per check id, while validation identity is per coordinate.**
MSL:185-205 `addToArray` rejects a second `checks` entry with the same `id`, but BS:810-818 treats `(id, to, along)` as the coordinate, so one step can declare the same check for different `along` values in a single file. A child layer cannot add an `along: 'backward'` declaration for a check its parent already declares on that step. This is safe under the monotonic rule (it never relaxes anything), but it is inconsistent with req 5 coordinate identity.

- Possibility A: key `addToArray` on `id+along` (and `from`) for `checks`.
- Possibility B: the spec should state that merge identity is the check id.

**D-CR-4 (LOW) — `buildSchema` picks the first matching binding by `to`/`along` and ignores `from`.**
BS:821-835 (`.find`, without `from`) and BS:892-902. With several bindings for one check id (for example `impl.filesResolved` with rows `{from: implementing, to: '*'}` and `{to: verifying}`), the lock checked may belong to a different coordinate than the one being redeclared. All built-in Category C rows share the same lock values, so this is latent and only reachable with plugin bindings whose locks differ per coordinate.

**D-CR-5 (LOW, spec drift in verify.md) — "15 built-ins" scenario.**
verify.md "List all registered checks" expects 15 built-ins plus 2 plugins = 17. The spec enumerates 16 built-ins (incl. `workflow.tasksEmpty`), and the code registers 16 (CB:230-247). The scenario count is stale; it should be 18.

**D-CR-6 (LOW, cosmetic) — Naming and doc drift.**
The spec names the options type `PluginCheckRegistration`; the code uses `PluginCheckRegistrationOptions` (CR:30). The `register` JSDoc still documents the old grammar `^[a-z][a-z0-9-]*$` (CR:179). The test title at `check-registry.spec.ts:223` says it rejects "uppercase", but uppercase is valid and the list contains no uppercase case. Check-local ids are not validated (`@myplugin.@protocol.edge` is accepted, test L249). The spec is silent on check-id grammar.

### Test Coverage (check-registry scenarios)

| Scenario                                                    | Test                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retrieve registered check by canonical ID                   | `packages/core/test/domain/services/check-registry.spec.ts:13` (get; `has` not asserted for plugin)                                                                        |
| Query unregistered returns undefined                        | `check-registry.spec.ts:159` (get only; `has` false not asserted)                                                                                                          |
| List all registered checks                                  | Missing (only `>10` at L149)                                                                                                                                               |
| Built-in checks injected at construction                    | `check-registry.spec.ts:149` (no `workflow.requires` / `workflow.tasksEmpty` assertion)                                                                                    |
| External registrations never shadow built-ins               | `check-registry.spec.ts:188`, `:249`                                                                                                                                       |
| Invalid plugin name rejected                                | `check-registry.spec.ts:48`, `:223`                                                                                                                                        |
| Plugin namespace accepts grammar                            | `check-registry.spec.ts:66` (it.each MyPlugin/123plugin/my_plugin)                                                                                                         |
| Valid registration canonical id                             | `check-registry.spec.ts:13`                                                                                                                                                |
| Reject `@invalid.name` / ''                                 | `check-registry.spec.ts:62-63`, `:223`                                                                                                                                     |
| Duplicate check                                             | `check-registry.spec.ts:99`                                                                                                                                                |
| Adapted to predicate kind                                   | `check-registry.spec.ts:13` (kind asserted)                                                                                                                                |
| Reject effect kind                                          | `check-registry.spec.ts:79`, `:264`                                                                                                                                        |
| Register valid binding coordinates (transition + step-skip) | Partial: `:13` (transition), `:396` (step-skip); no single combined test                                                                                                   |
| Duplicate transition coordinate                             | `check-registry.spec.ts:117`                                                                                                                                               |
| Duplicate step-skip coordinate                              | `check-registry.spec.ts:357`                                                                                                                                               |
| Check-level confinement -> CheckEmbeddingForbiddenError     | `build-schema.spec.ts:1845`                                                                                                                                                |
| Confinement does not lock policy at own coordinates         | `build-schema.spec.ts:1815`                                                                                                                                                |
| Coordinate allowBindingOverride false locks policy          | `build-schema.spec.ts:1011`, `:1400`, `:1438`                                                                                                                              |
| Locked config rejects override                              | `build-schema.spec.ts:1100`, `:1529`                                                                                                                                       |
| Check-level allowDisable false                              | `build-schema.spec.ts:1184`                                                                                                                                                |
| Binding-level allowDisable false                            | `build-schema.spec.ts:1217`, `:1566`                                                                                                                                       |
| Schema cannot relax binding allowDisable                    | `build-schema.spec.ts:1256`                                                                                                                                                |
| Layer mergers preserve checks/skipChecks                    | `merge-schema-layers.spec.ts:363`, `:418`                                                                                                                                  |
| Permitted disablement omits check from execution            | `build-schema.spec.ts:1303` (validation) + `execute-matching-predicates.spec.ts:366` (execution; "no bypass warning" not asserted)                                         |
| Category A init locked                                      | `check-registry.spec.ts:286` (allowDisable mostly; `allowBindingOverride` only for protocol.edge; skippable via `check-bindings.spec.ts:51`/`:10`)                         |
| Category B workflow.tasksEmpty                              | `transition-checks.spec.ts:494`, `check-bindings.spec.ts:51` (governance on tasksEmpty in registry not asserted at `check-registry.spec.ts:286`)                           |
| Composition forwards plugin allowDisable                    | `packages/core/test/composition/composition-registries.spec.ts:42` (governance only; end-to-end schema rejection missing)                                                  |
| Plugin step-skip default bindings evaluated                 | Partial: `composition/use-cases/workflow-check-registry.spec.ts:296` (table inclusion only); no end-to-end test that a failing plugin step-skip check rejects the shortcut |
| Cascade merges check/binding/step                           | `execute-matching-predicates.spec.ts:235`, `:437`; `transition-checks.spec.ts:918`                                                                                         |

### Missing Tests

- `list()` exact count (16 built-ins + N plugins), and `has()` true/false assertions.
- Category A/B `allowBindingOverride: false` for every id (only a subset is asserted), `workflow.tasksEmpty` governance in the registry.
- End-to-end: a plugin step-skip default binding fails, so `evaluateTransitionCandidate` returns `allowed: false`.
- End-to-end: plugin `allowDisable: false` registered through composition makes `buildSchema` throw `CheckDisableForbiddenError`.
- Binding inherits check-level `allowConfigOverride: false` (D-CR-2).
- Category C built-in embedded at a new coordinate executes the composed instance (D-CR-1).

### Spec Dependency Chain Consistency

- `core:transition-checks`: consistent on interfaces. The inheritance clause on the transition-checks side is violated for `allowConfigOverride` (D-CR-2).
- `default:_global/architecture`: CR is a pure domain service (no I/O); OK. However, the composition registry exposes domain stub instances as executable checks (D-CR-1), which blurs the domain-vs-application boundary the architecture spec draws (application `create*` owns I/O).

---

## Spec: core:transition-checks

### Requirements Summary

Check identity/result; Check ABI; CustomCheckDefinition; one file per check; applicability from/to/along (axis from `resolveWorkflowPipeline`); step-skip scope; dynamic runtime binding composition (target overlay, bypassed overlay, single-pass cascade, coordinate isolation, applicability of step checks); archive operation; effect phase/onFailure; predicate vs effect; evaluation of a transition attempt; shared candidate evaluator; validity verdict and reconciliation owner; registry bindings (categories, explicit governance, inheritance); actionable diagnostics; progress bus; projections; no snapshot bag; approval precedence and production composition.

### Implementation Status

| Requirement                                            | Status                                              | Evidence                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Check identity and result                              | Implemented                                         | TT:23-98, open `CheckId` TT:24; synthetic skip EMP:218-232                                                    |
| Check ABI / context                                    | Implemented (context has extra fields)              | TT:351-379; EMP:67-87 adds `skipChecks`, `checkRegistry` (see D-TC-8)                                         |
| CustomCheckDefinition                                  | Implemented                                         | TT:385-394                                                                                                    |
| One file per check                                     | Implemented                                         | `packages/core/src/application/checks/*.ts`, `domain/checks/*.ts`                                             |
| Applicability from/to/along                            | Implemented                                         | `classifyAlong` TT:150-188 uses `resolveWorkflowPipeline` TT:169                                              |
| Step-skip scope                                        | Implemented                                         | TT:110-113, TT:200-205, `checkMatches` TT:221-226                                                             |
| Dynamic binding composition                            | Partial                                             | TT:594-754, but see D-TC-1..D-TC-5                                                                            |
| Archive is an operation                                | Implemented                                         | CB:147-227 (no `approval.signoff`)                                                                            |
| Effect phase / onFailure                               | Implemented                                         | CB:125-141, CB:211-226                                                                                        |
| Predicate vs effect                                    | Implemented                                         | `matchingPredicates` EMP:157-159                                                                              |
| Evaluation of transition attempt                       | Implemented                                         | ETC:66-163                                                                                                    |
| Shared candidate evaluator                             | Implemented                                         | ETC; GetStatus via `executeChecksByLegalTargets` EMP:351-384; TransitionChange `transition-change.ts:313-327` |
| Validity / reconciliation                              | Not re-audited in this batch (outside change focus) | —                                                                                                             |
| Registry bindings categories                           | Implemented                                         | CB:29-227 explicit locks/skippable                                                                            |
| Omitted governance inherits                            | Partial                                             | TT:524-527 OK for two locks; TT:526 not (D-CR-2)                                                              |
| Diagnostics / progress / projections / no snapshot bag | Implemented (spot-checked)                          | `executeCheckWithProgress` EMP:96-125; labels TT:51-68                                                        |

### Discrepancies

**D-TC-1 (MEDIUM) — `resolveEffectiveBindings` is not the single binding cascade: EMP re-applies schema filtering and runs a second, load-bearing fallback path.**

- EMP:201-216 reloads `workflowStep(to).checks` / `workflowStep(step).skipChecks` and drops any matching binding whose id is declared `disabled: true`. This duplicates TT:729. The EMP filter matches on id only and ignores the declaration's `from`/`along`, so a disable meant for one coordinate (for example `{ id, disabled: true, along: 'backward' }`) also suppresses the check on other `along` values of the same target step.
- EMP:261-300 (fallback) runs any step-declared check id not already in `seen`, using its own config merge `deepMergeConfig(default, stepDecl.config)` (EMP:282-285) and its own applicability test `stepDeclMatches` (EMP:135-149). This path is **reachable after resolution**. Example: `done.checks: [{ id: 'impl.filesResolved' }]` with attempt `verifying -> done` (forward). The overlay at TT:629-638 claims the base row `{from: implementing, to: '*', along: forward}` (to `'*'`, along matches), so `matchedAny = true` and nothing is synthesized. The clone does not match at runtime (`from` ≠ verifying), so the id is not `seen`, and the EMP fallback then executes it with default+step config and without the binding config. Results now depend on two different composition algorithms.
- The fallback also skips the binding `config` layer. Single-pass cascade (req 3: "computed exactly once … check default → binding default → step declaration, and carried on the resolved binding … MUST NOT merge any layer a second time") and "Synthesized bindings preserve restrictive governance" both assume all bindings come out of `resolveEffectiveBindings`. Bindings produced by the fallback carry no governance at all.
- The fallback's user-bypass branch (EMP:271-279) does not emit the `check-done` progress event that the main loop emits (EMP:219-224). This is an inconsistency on the progress bus.
- Possibility A (implementation bug / leftover): delete the EMP filter and fallback. Make `resolveEffectiveBindings` synthesize whenever no base row _can match the attempt_, applying `decl.from`/`decl.along`, rather than whenever any row shares the id and target.
- Possibility B (spec drift): document EMP as a second resolution layer. That contradicts the single-pass wording and the "resolved binding" contract.
- Test evidence that the duplication is load-bearing: the from/along tests `execute-matching-predicates.spec.ts:534-592` pass `[]` bindings and exercise only the fallback. The disabled test `execute-matching-predicates.spec.ts:366` exercises only the EMP filter, not the resolver.

**D-TC-2 (MEDIUM) — Step-check applicability (req 5) is not enforced on overlays of base bindings.**
When a step declares a check that already has a base row for that target, the overlay clone keeps the **base** applicability rows (TT:733-734). The declaration's `from` / `along` defaults (`'*'` / `'forward'`) are never applied. Example: `verifying.checks: [{ id: 'impl.linksInScope', config: {...} }]`. The base row `{from: '*', to: 'verifying', along: '*'}` is claimed, and the clone runs on backward `done -> verifying` with the step config. Req 5 says step-declared checks "MUST NOT run on backward, redesign, or recovery entries unless their declaration explicitly selects that along". The verify scenario "Step checks ignore non-matching along and from" (done→verifying / ready→verifying / implementing→verifying) is only tested through the EMP fallback with a plugin check that has no base binding (`execute-matching-predicates.spec.ts:572-592`).

- Possibility A (bug): restrict overlay clones to `decl.from`/`decl.along` and leave the base rows as residual for other directions.
- Possibility B (spec clarification): req 5 applies only to synthesized coordinates, and a declaration that overlays an existing coordinate only re-configures it. The spec currently does not say this.

**D-TC-3 (LOW-MEDIUM) — Dedup by check id in EMP selects the wrong per-coordinate clone for wildcard step-skip rows.**
EMP:189/210 keeps only the first matching binding per check id. When a base binding has a wildcard row `{scope: 'step-skip', step: '*'}`, which `register()` produces when a plugin step-skip binding omits `step` (CR:255-258), and two bypassed steps A and B both configure it in `skipChecks`, TT:684-692 records an edit for each step. Each clone receives `applicability: ['*']` (TT:734). At step B's attempt, clone A (emitted first) matches first, so B runs with **A's config**. If A disables and B configures, the EMP disabled filter (EMP:213-216) happens to compensate at step A. That is another sign the two layers are coupled. Coordinate isolation (req 4) requires per-step results.

- Fix direction: when splitting, narrow a wildcard row to the concrete coordinate (`{scope: 'step-skip', step: bypassedStep}`, and likewise `to: targetStep` for transitions).
- No test covers multi-step bypass with a wildcard plugin step-skip binding.

**D-TC-4 (LOW) — Permissive transition overlay filter when `along` is undefined, and the `chk.along` widening clause.**
TT:633-637 claims every `to`-matching transition row when `along === undefined`. Both production callers pass `along` (ETC:80-87, `transition-change.ts:272-279`), so this is latent, but the exported domain function's default semantics are permissive. The `chk.along` clause only _widens_ claims and never narrows `'*'` rows (see D-TC-2), so a `disabled: true` declaration with `along: 'backward'` removes `along: '*'` rows for all directions.

- Possibility A: make `along` required, or treat undefined as "no overlay".
- Possibility B: document undefined as "all directions".

**D-TC-5 (MEDIUM) — Synthesized Category C built-ins use domain stub checks.** Same root cause as D-CR-1 (TT:647, TT:695, EMP:266). Embedding allowed by the "Registry bindings" Category C clause has no effect.

**D-TC-6 (LOW) — `TransitionChange` validates `--skip-checks` against the first binding with that id, not the active coordinate.**
`transition-change.ts` ~L296-306 uses `effectiveBindings.find((b) => b.check.id === checkId)`. The skip-outcome source #2 says a check may be bypassed when "its **active** binding declares `skippable: true`". If a schema sets `skippable` differently on one coordinate (for example a step-skip clone versus a transition clone of `impl.linksInScope`), the decision can come from a non-matching clone. In the executor, the bypass (EMP:218) also does not consult `binding.skippable`, so skippability depends entirely on this pre-validation.

**D-TC-7 (LOW) — Projection-mode "protocol.edge first" relies on binding order.**
In `projection` mode ETC:122 runs all bindings and relies on `protocol.edge` being first in CB:30. Plugin or base-table reordering would break req "evaluate protocol.edge first". This is acceptable today because the table is fixed. A guard or test would make it explicit; `evaluate-transition-candidate.spec.ts:402` covers collection, not ordering.

**D-TC-8 (LOW) — The execution context carries `skipChecks` and `checkRegistry`.**
EMP:67-87 spreads `skipChecks` and `checkRegistry` into the `CheckExecutionContext` passed to `check.execute` (EMP:241-244). The spec forbids "ad-hoc bypass booleans". A bypass list is not a boolean, but it leaks orchestrator bypass state into checks, which the ABI requirement aims to avoid. verify.md "Execute does not take a global snapshot bag" also still mentions "skip flags" in the context, which contradicts the ABI requirement. That is spec drift in verify.md.

### Test Coverage (transition-checks, change-relevant scenarios)

| Scenario                                     | Test                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic skip on `--skip-checks`            | `execute-matching-predicates.spec.ts` (`bypassedByUser`, only file referencing it)                                                                                   |
| Self-discard skip                            | `execute-matching-predicates.spec.ts:328`                                                                                                                            |
| Custom check receives isolated config        | `execute-matching-predicates.spec.ts:235`                                                                                                                            |
| Recovery not backward / redesign             | `transition-checks.spec.ts:34`, `:42`                                                                                                                                |
| Disabled steps excluded from axis            | Not found in TT tests (topology covered in other batch)                                                                                                              |
| Direction delegates to topology axis         | Indirect: `transition-checks.spec.ts:68-82`                                                                                                                          |
| Omitted implementing keeps retry backward    | `transition-checks.spec.ts:74`                                                                                                                                       |
| Omitted ready forward into implementing      | `transition-checks.spec.ts:78`                                                                                                                                       |
| Step-skip match / mismatch                   | `transition-checks.spec.ts:417`, `:433`                                                                                                                              |
| Target step synthesizes with config          | `transition-checks.spec.ts:521`, `:631` (resolver only, `ctx.config` asserted e2e in `execute-matching-predicates.spec.ts:437`)                                      |
| Schema disabled check omitted                | `transition-checks.spec.ts:594`; `execute-matching-predicates.spec.ts:366`                                                                                           |
| Bypassed step skipChecks synthesized         | `transition-checks.spec.ts:743`                                                                                                                                      |
| Synthesized bindings preserve governance     | `transition-checks.spec.ts:691`                                                                                                                                      |
| Deep-merge cascade e2e, no duplication       | `execute-matching-predicates.spec.ts:437` (scenario values differ slightly; equivalent)                                                                              |
| Disabling step check leaves skip check       | `transition-checks.spec.ts:853` (resolver level only; no execution-level test)                                                                                       |
| Disabling skip check leaves step check       | `transition-checks.spec.ts:884`                                                                                                                                      |
| Step checks ignore non-matching along/from   | Partial: `execute-matching-predicates.spec.ts:572-592` (fallback path, designing→ready only; the scenario's done/ready/implementing→verifying matrix is not covered) |
| Candidate combines target and bypass         | `evaluate-transition-candidate.spec.ts:99`, `:169`                                                                                                                   |
| Failed step-skip rejects                     | `evaluate-transition-candidate.spec.ts:127`                                                                                                                          |
| Empty skip set passes                        | `evaluate-transition-candidate.spec.ts:213`                                                                                                                          |
| Pure and shared                              | `evaluate-transition-candidate.spec.ts:270`                                                                                                                          |
| Protocol fail-fast / projection collects     | `evaluate-transition-candidate.spec.ts:367`, `:385`, `:402`                                                                                                          |
| Category bindings skippable                  | `check-bindings.spec.ts:10`, `:22`; `transition-checks.spec.ts:494`                                                                                                  |
| Built-in specs declare governance explicitly | `check-bindings.spec.ts:44`, `:51`                                                                                                                                   |
| Omitted governance inherits                  | `check-bindings.spec.ts:59` (not for `allowConfigOverride`)                                                                                                          |

### Missing Tests

- End-to-end `evaluateTransitionCandidate` matrix for the "Step checks ignore non-matching along and from" scenario, using a check that **has** a base binding (D-TC-2), on `done→verifying`, `ready→verifying`, `implementing→verifying`.
- Execution-level coordinate isolation (enter `implementing` with `checks` disabled while `skipChecks` is enabled, then bypass `implementing`).
- Multi-step bypass with a wildcard plugin step-skip binding configured per step (D-TC-3).
- `resolveEffectiveBindings` alone (without the EMP fallback/filter) for from/along/disabled declarations, which would expose D-TC-1.
- Category C built-in embedded at a new coordinate surfaces the real check result (D-TC-5).
- `--skip-checks` validation against the active coordinate clone (D-TC-6).
- "Disabled steps are excluded from progress axis" (`classifyAlong` implementing→done with `verifying` disabled) in this spec's own tests.

### Spec Dependency Chain Consistency

- `core:check-registry`: consistent in shape. The governance inheritance gap (D-CR-2) and the stub-instance synthesis (D-CR-1/D-TC-5) affect both specs.
- `core:workflow-topology`: `classifyAlong` and the evaluator delegate to `resolveWorkflowPipeline` / `listBypassedWorkflowSteps` / `listWorkflowTransitions` (TT:169, ETC:77, EMP:366). Consistent.
- `core:schema-format` / `core:workflow-model`: the `checks` / `skipChecks` declaration shape (`from`, `along`, `disabled`, `skippable`, `onFailure`, `config`) matches its consumption in TT:572-577 and BS:799-945.
- `default:_global/architecture`: the domain stays pure. EMP is in the application layer; OK. D-CR-1 is an architecture-boundary smell (domain stubs used as executable checks in composition).
- `default:_global/error-handling-conventions`: typed errors are used (`InvalidPluginNameError`, `DuplicateCheckError`, `DuplicateCheckBindingError`, `InvalidCheckKindError`, `CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`, `CheckDisableForbiddenError`, `UnknownCheckError`, `CheckNotSkippableError`). `applyBindingSpecs` throws `InvalidInputError` for a missing instance; acceptable.
- `default:_global/testing`: test titles are mostly behavior-oriented. The misleading "uppercase" title is noted in D-CR-6.

---

## Summary

| Severity | Count | Items                                                                                                                                                                                                                            |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 0     | —                                                                                                                                                                                                                                |
| MEDIUM   | 4     | D-CR-1/D-TC-5 (stub instances for synthesized Category C, counted once), D-TC-1 (duplicate EMP filter + load-bearing fallback), D-TC-2 (req 5 not applied to overlays), D-TC-3 (id dedup picks wrong wildcard clone; LOW-MEDIUM) |
| LOW      | 9     | D-CR-2 (allowConfigOverride default true), D-CR-3, D-CR-4, D-CR-5 (verify count 15→16), D-CR-6, D-TC-4 (`along === undefined`), D-TC-6, D-TC-7, D-TC-8                                                                           |

Requirements: check-registry has 7 requirements (6 implemented, 1 partial). transition-checks has 21 requirements; the change-relevant ones are mostly implemented, with partial status on "Dynamic runtime binding composition" and "Registry bindings (inheritance)". Validity and reconciliation requirements were not re-audited in this batch.

Lead outcomes: (a) confirmed, D-TC-1 / D-TC-3. (b) confirmed but latent, D-TC-4. (c) confirmed, D-CR-2, with impact reduced to LOW because `buildSchema` checks the check-level config lock first.

---

# Partial Compliance Report C: Transition and Lifecycle

Change: `schema-workflow-skippable-states`
Specs audited: `core:transition-change`, `core:lifecycle-engine`, `core:get-status`
Method: read the merged spec previews (`changes spec-preview`), then read the code and tests directly. Nothing was mutated.

Key source files (paths relative to `packages/core/src`):

- `application/use-cases/transition-change.ts` (TC)
- `application/use-cases/get-status.ts` (GS)
- `application/services/evaluate-transition-candidate.ts` (ETC)
- `application/services/execute-matching-predicates.ts` (EMP)
- `domain/services/workflow-topology.ts` (WT)
- `domain/services/lifecycle-verdict.ts` (LV)
- `application/services/lifecycle-guidance.ts` (LG)
- `application/services/lifecycle-evaluation.ts` (LE)
- `application/checks/protocol-edge.ts`, `domain/checks/protocol-edge.ts`
- `domain/services/transition-checks.ts` (`resolveEffectiveBindings`)

Test files (paths relative to `packages/core/test`):

- `application/use-cases/transition-change.spec.ts` (TCT)
- `application/use-cases/get-status.spec.ts` (GST)
- `application/services/evaluate-transition-candidate.spec.ts` (ETCT)
- `domain/services/lifecycle-verdict.spec.ts` (LVT)
- `domain/services/lifecycle-engine.spec.ts` (LET)
- `domain/services/workflow-topology.spec.ts` (WTT)

---

## 1. core:transition-change

### Requirements Summary

Spec preview: 25 requirements. The change touches these:

- **Input contract**: uses `skipChecks` and accepts no ad-hoc boolean bypass flags.
- **Canonical pre-transition validity reconciliation**: omits disabled checks, validates bypasses, fails fast on `protocol.edge`.
- **to next**: resolves the target through `ResolveChangeSchema` and `nextWorkflowStep`, skips disabled steps, and throws `HappyPathNextUnavailableError` when no next hop exists.
- **Bypassed step evaluation and hook suppression**: uses the sovereign schema, requires every crossed step to be optional (enforced by `protocol.edge`), runs one shared candidate evaluator, rebuilds the candidate from fresh state, and runs no hooks on bypassed steps.
- **Shared runner errors propagate on transition**: maps built-in checks to canonical reasons; every other failure becomes `CheckPredicateFailedError` (including `skippable`).
- **Optional refresh, Verification attempt lifecycle, Post/Pre hooks, Persistence**: pre-existing requirements, re-checked against the new flow.

### Implementation Status

| Requirement                                       | Status                   | Evidence                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input contract                                    | Implemented              | TC:55-84 (no `allowOutOfScope` or `allowOverlap`)                                                                                                                                                                                                                              |
| Approval gates baked at construction              | Implemented              | TC:147-181                                                                                                                                                                                                                                                                     |
| Change must exist                                 | Implemented              | TC:204-207                                                                                                                                                                                                                                                                     |
| Optional pre-transition refresh                   | **Partial / deviates**   | TC:211-214 honours the opt-out; TC:379-382 always passes `refreshImplementationTracking: true` (see D-TC1)                                                                                                                                                                     |
| Spec approval / signoff as checks                 | Implemented              | approval predicates are mapped at TC:642-649                                                                                                                                                                                                                                   |
| Pending states / historic parked precedence       | Implemented              | TC:255 and TC:485-528 run before the candidate is evaluated                                                                                                                                                                                                                    |
| Direct transition when gates inactive             | Implemented              | TC:328 (`effectiveTarget = requestedTarget`)                                                                                                                                                                                                                                   |
| Canonical pre-transition reconciliation           | Implemented with caveats | disabled checks omitted at EMP:213-216 and in `resolveEffectiveBindings`; bypass validation at TC:287-307; synthetic skip result at EMP:218-233; `protocol.edge` fail-fast at ETC:109-120 (see D-TC3)                                                                          |
| Workflow requires enforcement                     | Implemented              | TC:612-625, plus `requires-check` progress at TC:674-693                                                                                                                                                                                                                       |
| Task completion check                             | Implemented              | TC:626-641, TC:701-724                                                                                                                                                                                                                                                         |
| Implementation-only retry                         | Implemented              | no clearing inside the mutate callback (TC:423-433)                                                                                                                                                                                                                            |
| Verification attempt lifecycle                    | Implemented              | after hooks: reconcile again, then evaluate the candidate again (TC:378-421)                                                                                                                                                                                                   |
| Skill-aligned backward hop                        | Implemented              | TC:424-426 (`invalidateSignoff`), using hardcoded `SKILL_HOP_*` sets (TC:108-109)                                                                                                                                                                                              |
| Transition to designing                           | Implemented              | TC:249-251 (designing to designing is a no-op)                                                                                                                                                                                                                                 |
| archiving to archivable                           | Implemented              | the `along=recovery` path                                                                                                                                                                                                                                                      |
| Pre/Post hook execution                           | Implemented              | TC:366-376 via `matchingEffects`                                                                                                                                                                                                                                               |
| Transition delegation / Persistence               | Implemented              | TC:423-433 `mutate`                                                                                                                                                                                                                                                            |
| Result type / Progress / Dependencies / Factory   | Implemented              | TC:103-106, TC:87-100                                                                                                                                                                                                                                                          |
| **to next is the happy-path next state**          | Implemented              | TC:233-247; WT:269-293                                                                                                                                                                                                                                                         |
| **Bypassed step evaluation and hook suppression** | Implemented with caveats | TC:265-279, TC:314-327; ETC:76-150; crossing a mandatory step is illegal because of WT:129 (`forwardTargets` stops at the first non-optional step); bypassed-step hooks never match because effects are selected from the `from` to `to` attempt (TC:366). See D-TC2 and D-TC4 |
| **Shared runner errors propagate**                | **Partial**              | the default branch at TC:650-662 computes `skippable` from base bindings only (D-TC2)                                                                                                                                                                                          |

### Discrepancies

- **D-TC1 (MEDIUM): `refreshImplementationTrackingBefore: false` still triggers a refresh.**
  - Evidence: TC:379-382 always calls `_reconcile.execute({ refreshImplementationTracking: true })` after effects. `reconcile-change-validity.ts:175` refreshes when the flag is `true`. TCT:359 locks this in ("skips only the initial refresh ... keeps the post-hook refresh").
  - Spec: "When `refreshImplementationTrackingBefore` is `false`, `TransitionChange` MUST NOT invoke `RefreshImplementationTracking`."
  - Possibility A (spec drift): the "Verification attempt lifecycle" requirement does say "fresh tracking ... SHALL run again before persistence". The refresh requirement should then be reworded to say the flag controls only the pre-evaluation refresh.
  - Possibility B (implementation bug): the post-hook pass should respect the flag. It also runs even when no effect matched.

- **D-TC2 (MEDIUM): `CheckPredicateFailedError.skippable` can be wrong for schema-declared and step-skip checks.**
  - Evidence: `_mapFailedPredicate`'s default branch (TC:651) looks up `this._transitionBindings`, the base bindings. A check added by `resolveEffectiveBindings` from schema `checks:` or `skipChecks:`, or a base binding whose skippable flag the schema changed, therefore reports `skippable: false`.
  - The collect path (TC:567) uses the effective bindings, so the two paths disagree. Bypass validation (TC:295-306) also uses effective bindings, so a check that `--skip-checks` would accept can be reported as not skippable.
  - Possibility A (bug): `_throwPredicateFailures` should pass the `effectiveBindings` it already has into the mapper.
  - Possibility B (spec drift): none credible. The spec says "whether the failed binding permits `--skip-checks`".

- **D-TC3 (LOW): "aborted immediately" is not literal for non-protocol predicates.**
  - Evidence: in execute mode, ETC runs every remaining predicate and every step-skip predicate before TC throws (EMP:248-253 stops early only with `failFast`/`failFastOn`). Only `protocol.edge` stops evaluation.
  - Possibility A (spec drift): reword the requirement to "aborted after evaluation". This matches the `onFailure: collect` aggregation design and the test at TCT:4109.
  - Possibility B (bug): stop at the first `abort`-policy failure.

- **D-TC4 (LOW): the after-hook candidate reuses a stale `effectiveStatusByArtifact`.**
  - Evidence: TC:404 passes the map computed before the hooks (TC:256-257) into the after-hook evaluation, even though `change` was just reloaded at TC:383.
  - Spec: the candidate "MUST be recalculated from fresh persisted state".
  - Possibility A (bug): drop the argument so ETC:72-74 recomputes it.
  - Possibility B: accept it, on the grounds that hooks cannot change artifact DAG state. That assumption is unverified.

- **D-TC5 (MEDIUM): the committed-recovery command routes to `/specd-verify` even when `verifying` is disabled.**
  - Evidence: `committedRecoveryError` (TC:746) returns `'/specd-verify'` for any recovery whose target is not `designing`, for example a stale-signoff return to `done`.
  - This conflicts with lifecycle-engine's "Verification-renewal commands MUST only be recommended when `verifying` is enabled". It also places command routing outside `lifecycle-guidance.ts`, while the spec requires the command matrix to live there.
  - Possibility A (bug): resolve the command through `resolveLifecycleCommand` with `isWorkflowStepEnabled('verifying', schema)`.
  - Possibility B (spec drift): none credible.

- **D-TC6 (LOW): `bypassedSteps` is lost when `protocol.edge` fails fast.** In execute mode, a failed `protocol.edge` returns `bypassedSteps: []` (ETC:116). This is diagnostic only.

- **D-TC7 (LOW): hardcoded lifecycle state sets.** `SKILL_HOP_SOURCES` and `SKILL_HOP_TARGETS` (TC:108-109) are fixed lists. They are not inside lifecycle-verdict code, but they cut against the topology-derived principle.

### Test Coverage

- to next: implementing to verifying (TCT:246). Disabled verifying resolves to done, using the sovereign schema (TCT:3661). Rejections from archivable, pending states and archiving (TCT:276-343).
- Step-skip evaluated and failure gives `CheckPredicateFailedError`: TCT:3547. Hook suppression: TCT:3600 and TCT:3842.
- Sovereign schema: TCT:3661 and TCT:3933. Schema `skipChecks`: TCT:3842. Schema `checks`: TCT:3766.
- Freshness and effects ownership: TCT:4135 and TCT:4193.
- `skipChecks` validation: TCT:3179, 3195, 3211, 3308, 3344, 3376.
- Collect aggregation: TCT:4109 and TCT:4123.
- Parked precedence: TCT:621 and TCT:631.
- ETC unit tests: empty step-skip set (ETCT:213), no effects (ETCT:270), execute-mode fail-fast (ETCT:367-402).

### Missing Tests

1. "Target step executes schema-declared checks" with `config: { severity: 'critical' }` received in `ctx.config`. No test asserts config delivery through TransitionChange (the test file has no `config` assertions).
2. "Target step omits schema-disabled check" (`impl.linksInScope: { disabled: true }`) at the TransitionChange level.
3. "Failed step-skip and plugin checks use CheckPredicateFailedError" with the `skippable` flag asserted. No test asserts `.skippable`, which is why D-TC2 goes unnoticed.
4. "Canonical built-in failures map to InvalidStateTransitionError reasons". The test file never asserts `invalid-transition` (TCT:429 checks only the error class).
5. Crossing a mandatory step (for example ready to verifying with a mandatory `implementing`) should be rejected by `protocol.edge`. This is not tested at the use-case level.
6. "Empty effective skip-check set permits bypass" at the use-case level. It is covered only in ETCT:213.
7. "Status projection cannot authorize a stale transition": TCT:4135 does not first project via GetStatus and then mutate facts. It tests a failing state directly.
8. "Disabled step check is omitted from execution" (Canonical reconciliation scenario).
9. The refresh opt-out scenario: TCT:359 asserts behaviour that contradicts the spec (D-TC1).

### Spec Dependency Chain consistency

- `core:workflow-topology`: TC uses `listBypassedWorkflowSteps` and `nextWorkflowStep` (WT:246, WT:269). Consistent.
- `core:resolve-change-schema`: TC:233-237 is used for every attempt, not only `next`. Consistent.
- `core:transition-checks` and `core:check-registry`: the step-skip scope is built in ETC:127-132. Consistent.
- `default:_global/architecture`: TC sits in the application layer, imports pure domain functions, and has no I/O in the domain. Consistent.

---

## 2. core:lifecycle-engine

### Requirements Summary

The domain verdict is a set of plain functions. `availableSteps` comes from `resolveWorkflowPipeline`, without disabled steps. All position and boundary logic must be topology-derived. `checksByTarget` holds complete candidates. `nextHop` uses the optional-step recommendation policy (furthest passing shortcut, fallback to entering the optional step). Guidance resolves the command from the selected `targetStep` and must never route to `/specd-verify` when `verifying` is disabled.

### Implementation Status

| Requirement                                                       | Status                         | Evidence                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain verdict                                          | Implemented                    | LV:169 is a plain function; `lifecycle-engine.ts` only re-exports                                                                                  |
| Centralized validation                                            | Implemented                    | LV:186-199 projects only the supplied results                                                                                                      |
| Effective status / canonical-only / blockers                      | Implemented (not changed here) | LV:365-470                                                                                                                                         |
| Available steps: pipeline order, disabled excluded                | Implemented                    | LV:201-245                                                                                                                                         |
| Topology-derived comparisons, no hardcoded lists                  | **Partial**                    | `isForward` and `pipelinePosition` are topology-derived (LV:887-914); `verificationBoundary` (LV:974-986) uses a hardcoded state list (D-LE1)      |
| `checksByTarget` complete / available only when allowed           | Implemented                    | LV:190-199, fed by ETC through `executeChecksByLegalTargets` (EMP:351-384)                                                                         |
| Optional-step recommendation                                      | Implemented                    | `recommendedForwardTarget` (LV:1009-1038), used for drafting/designing, ready, spec-approved, implementing, verifying, done                        |
| Hop matrix (disabled verifying gives done; done gives archivable) | Implemented                    | LV:1139-1196                                                                                                                                       |
| Archiving guidance / escape transitions                           | Implemented                    | LV:249-251, LV:1213-1234                                                                                                                           |
| Application guidance: command from the selected target            | Implemented                    | LG:98-184; `nextWorkflowStep` is never called                                                                                                      |
| Never `/specd-verify` when verifying disabled                     | **Partial**                    | LG:46-61 and LG:147-149 respect it; TC:746 does not (D-TC5); a blocked `done` falls back to `/specd-archive` instead of the actual blocker (D-LE2) |
| `evaluateLifecycle` attaches `nextAction`                         | Implemented                    | LE:26-46                                                                                                                                           |
| Next artifact topological order / predicate blocker identity      | Implemented                    | LV:816, LV:262-267                                                                                                                                 |

### Discrepancies

- **D-LE1 (MEDIUM): `verificationBoundary` uses a hardcoded state list.**
  - Evidence: LV:978-985 enumerates `verifying`, `done`, `pending-signoff`, `signed-off`, `archivable`, `archiving`. LG:50-55 repeats the same list.
  - Spec: "Every forward/backward or position comparison inside lifecycle verdict code (including verification boundaries ...) SHALL derive from `resolveWorkflowPipeline` ... hardcoded lifecycle state lists MUST NOT be used."
  - Behaviour is guarded by the `isWorkflowStepEnabled('verifying')` check, so the practical impact is small.
  - Possibility A (bug): derive the boundary with `isForward('verifying', state) || state === 'verifying'`, the pipeline-position helper.
  - Possibility B (spec drift): exempt drain states.

- **D-LE2 (LOW-MEDIUM): a blocked `done` with verifying disabled resolves to `/specd-archive` rather than the real blocker.**
  - Evidence: LG:147-149 returns `/specd-archive` when `nextHop.targetStep` is `done` (stay) and verifying is disabled.
  - Spec: the command "MUST resolve its command from the actual blocker (for example sign-off, artifact review, or tasks)". The signoff and review cases are handled earlier (LG:63-85). Other blockers, such as unresolved tasks or a custom check, fall back to the archive skill. GS:714-724 adds a failing-check command only when the command is `null`, which is never the case here.
  - Possibility A (bug): map from blockers.
  - Possibility B (spec drift): accept `/specd-archive` as the owner of `done`.

- **D-LE3 (LOW): spec text still names the legacy bypass flags.**
  - Evidence: the spec mentions `--allow-overlap` and `--allow-out-of-scope` (blocker example, `isPermitted` bullet, scenario "Skip bypass allows transition despite blocker"). The implementation advertises `--skip-checks <id>` (GS:975, GS:998). The TransitionChange spec retired the ad-hoc flags.
  - Likely spec drift.

### Test Coverage

- Shortcut recommended with optional entry retained: LVT:70. Fallback to entering the step: LVT:81. Empty skip set: LVT:87. Consecutive optional steps, furthest target: LVT:98. Failed step-skip evidence kept in `checksByTarget`: LVT:1151.
- Disabled verifying: excluded from `availableSteps` (LET:90); legal skip to done (LET:100); `nextHop` done (LET:109); `/specd-archive` (LET:135); archivable from done (LET:166); never verify (LET:201).
- Archiving escape: LVT:630 and LVT:660. Verifying gives done: LVT:784. Archivable: LVT:798 and LVT:813.
- Canonical row order: covered at the topology level (WTT:86, WTT:112).

### Missing Tests

1. "Blocked done with verifying disabled never routes to verify", run with the **real** validity verdict and the signoff gate on with sign-off missing. LET:201 uses an injected `verification: 'absent'` fixture with gates off, which is exactly what the scenario forbids.
2. "availableSteps follow canonical order regardless of row order", asserted at the verdict level (only topology tests cover it).
3. Two consecutive optional steps where the second skip fails, to confirm the middle-step recommendation is intended.

### Spec Dependency Chain consistency

- `core:workflow-topology`: consistent. `listWorkflowTransitions` (LV:176), `resolveWorkflowPipeline`, and `isWorkflowStepEnabled` are all used.
- `core:transition-checks`: consistent. LV only projects supplied `CheckResult`s and does no I/O.
- `default:_global/architecture`: the domain stays pure and command strings live in the application layer, except TC:746 (D-TC5).

---

## 3. core:get-status

### Requirements Summary

New requirement: **Shared transition candidate evaluation**. Each legal target is evaluated through the same ETC as TransitionChange (bypassed steps plus step-skip predicates). Projection is effect-free. Also covered: resolving the sovereign schema through `ResolveChangeSchema` with identity-mismatch and advisory handling, and the existing reconciliation and blocker requirements.

### Implementation Status

| Requirement                                                  | Status                          | Evidence                                                                                                    |
| ------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Input / result / not-found / drafted                         | Implemented                     | GS:481-489, GS:822-926                                                                                      |
| Revision evaluation (`ifModifiedSince`)                      | Implemented (MAY not exercised) | `ifModifiedSince` is accepted (GS:73) and never used; `_buildUnchangedResult` (GS:773) is dead code (D-GS3) |
| Refresh / reconciliation ordering                            | Implemented                     | the schema resolves before reconcile (GS:491-513)                                                           |
| Execute matching predicates then project                     | Implemented                     | GS:637-667                                                                                                  |
| **Shared transition candidate evaluation**                   | Implemented                     | GS:637, through `executeChecksByLegalTargets` and then ETC in `projection` mode (EMP:367-381)               |
| Projection-only, no effects                                  | Implemented                     | ETC runs predicates only; GS never calls `mutate` or hooks after reconcile                                  |
| Identifies blockers / bypass flags                           | **Deviates from spec text**     | GS:968-976 advertises `--skip-checks <id>` and uses static base or registry skippability (D-GS1, D-GS2)     |
| Graceful schema degradation / identity mismatch / advisories | Implemented                     | GS:383-399, GS:565-625, GS:500                                                                              |
| Constructor deps / reconciler mandatory                      | Implemented                     | GS:462-465                                                                                                  |

### Discrepancies

- **D-GS1 (LOW-MEDIUM): bypass flag text differs from the spec.**
  - Evidence: the spec says that for `impl.linksInScope` the bypass is `--allow-out-of-scope`, and `OVERLAP_CONFLICT` uses `--allow-overlap`. The code emits `--skip-checks impl.linksInScope` (GS:975). The test is named "...bypassFlag is --allow-out-of-scope" but asserts `--skip-checks impl.linksInScope` (GST:779-833).
  - Likely spec drift left over from retiring the legacy flags, together with a misleading test name.

- **D-GS2 (MEDIUM): blocker skippability ignores effective bindings.**
  - Evidence: `_mergeBlockers` (GS:954-969) reads skippability from `registry.bindings()` or the base bindings. Schema-synthesized or schema-overridden bindings (step `checks:` or `skipChecks:` with `skippable`) therefore get the wrong `bypassFlag`. Same root cause as D-TC2.
  - Possibility A (bug): carry `skippable` on the candidate's `CheckResult`s, or resolve it per target.

- **D-GS3 (LOW): `ifModifiedSince` is never used.** The input field exists but never short-circuits, and `_buildUnchangedResult` is dead code. The spec allows this (MAY), but the dead code should be removed or wired in. GST:1178-1238 only assert that full evaluation happens.

- **D-GS4 (LOW): shortcut step-skip failures show up as public blockers and can supply `nextAction.command`.**
  - Evidence: failed step-skip predicates for a shortcut target are flattened into public `blockers` (GS:958-976) even when the default path, entering the optional step, is available. When the command is `null`, the first failing check's command is adopted (GS:714-724), which may come from that shortcut.
  - Possibility A (spec intended): the spec says failed candidate predicates MUST appear.
  - Possibility B: filter blockers to the recommended or requested path.

### Test Coverage

- Shortcut available with complete `checksByTarget`: GST:429. Failing skip suppresses the shortcut and keeps the failed check visible: GST:456. Empty skip set allowed: GST:503.
- Sovereign schema: GST:119. Identity mismatch and degradation: GST:348, GST:393, GST:1110, GST:1130. Advisory warnings: GST:1151.
- Archive overlap: GST:1327-1401. Validity projection: GST:1403-1557.

### Missing Tests

1. "Status evaluation has no transition effects" at the GetStatus level: no assertion that RunStepHooks and `mutate` are not called after reconcile. Only ETCT:270 covers the evaluator.
2. A GetStatus `nextAction` test for an optional step with passing and failing skips. It is covered only in LVT.
3. Schema-declared skippable step-skip check: is the blocker's `bypassFlag` correct (D-GS2)?
4. Note on GST:503: the "empty set" claim depends on the default `workflow.tasksEmpty` binding being scoped to `implementing` only (`check-bindings.ts:60`). The test is valid, but implicitly so.

### Spec Dependency Chain consistency

- `core:transition-change`: shares ETC. Consistent, apart from the shared skippable mismatch (D-TC2 and D-GS2).
- `core:lifecycle-engine`: GS consumes `evaluateLifecycle` (GS:663) and never reads `nextHop` commands. Consistent.
- `core:resolve-change-schema`: GS:494 and GS:835. Consistent.
- `default:_global/error-handling-conventions`: degradation returns typed blockers instead of throwing. Consistent.

---

## Summary

| Severity   | Count | IDs                                                                                       |
| ---------- | ----- | ----------------------------------------------------------------------------------------- |
| HIGH       | 0     | none                                                                                      |
| MEDIUM     | 5     | D-TC1, D-TC2, D-TC5, D-LE1, D-GS2                                                         |
| LOW-MEDIUM | 2     | D-LE2, D-GS1                                                                              |
| LOW        | 6     | D-TC3, D-TC4, D-TC6, D-TC7, D-LE3, D-GS3, D-GS4 (D-GS4 can be read as intended behaviour) |

The table lists 13 IDs in total, but only 12 are distinct issues: D-LE3 and D-GS1 are the same legacy-flag spec drift.

Checked focus points:

- `to: 'next'`: OK.
- Step-skip evaluation for bypassed optional steps: OK.
- Effects only after the complete candidate passes: OK.
- Status projection purity: OK.
- TransitionChange recomputing the candidate from fresh state: mostly OK; see D-TC4.
- `CheckPredicateFailedError` mapping: the class is right, but the `skippable` flag can be wrong (D-TC2).
- Disabled-verifying routing: mostly OK; TC:746 is the exception (D-TC5).
- Furthest passing shortcut: OK.

Missing tests: 9 for transition-change, 3 for lifecycle-engine, 4 for get-status.

---

# Partial D: Sovereign schema resolution and the change aggregate

Change: `schema-workflow-skippable-states`
Specs: `core:resolve-change-schema`, `core:change` (delta-scoped), `core:fs-change-repository`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`
Method: merged spec content from `changes spec-preview`. The code was read directly: grep and Read in `packages/core/src` and `packages/cli/src`. No mutating specd commands were run.

---

## 0. Classification of `schemaProvider.get(` calls (packages/core/src)

| Call site                                                          | Form                    | Change-bound?                                                                                                                                                                                                       | Verdict                            |
| ------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `application/services/resolve-change-schema.ts:62`                 | `get(input.schemaName)` | yes (this is the boundary)                                                                                                                                                                                          | OK                                 |
| `application/use-cases/generate-spec-metadata.ts:94`               | `get()` (unnamed)       | **yes, transitively.** `ArchiveChange` calls it for post-archive metadata (`archive-change.ts:605` → `MaterializeSpecMetadata` → `GenerateSpecMetadata`). `CompileContext` also calls it through `GetSpecMetadata`. | **Violation for archive** (see X1) |
| `application/use-cases/get-spec-context.ts:391`                    | `get()`                 | no (spec-scoped, project context)                                                                                                                                                                                   | OK                                 |
| `application/use-cases/get-spec-outline.ts:65`                     | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/get-project-context.ts:143`                 | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/validate-specs.ts:124`                      | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/resolve-initial-persisted-depends-on.ts:59` | `get()`                 | no (spec persisted state init)                                                                                                                                                                                      | OK                                 |

No other `_schemaProvider.get(`/`schemaProvider.get(` exists. Every change-bound use case in this batch (`EditChange`, `InvalidateChange`, `CountTasks`, `StartVerification`, `ReconcileChangeValidity`, `ValidityFingerprintService`) goes through `ResolveChangeSchema`. The composition resolver injects the shared instance (`composition-resolver.ts:579-583`, `:709-720`; `composition/use-cases/{edit-change,invalidate-change,count-tasks}.ts`, `verification-factories.ts:47,125,249`).

One caveat: each consumer still keeps a `?? new ResolveChangeSchema(schemaProvider)` constructor fallback (for example `edit-change.ts:111`, `invalidate-change.ts:98`, `count-tasks.ts:37`, `validity-fingerprint-service.ts:52-53`, `start-verification.ts:66-67`). See X5.

---

## 1. core:resolve-change-schema

### Requirements Summary

- An input/result contract: `{schema, warnings}`, with no workspace-default dependency.
- A sovereign named lookup that has no unnamed or default fallback.
- A provider identity check that throws `SchemaProviderIdentityMismatchError` when the returned name differs.
- A same-name version mismatch gives a non-blocking typed advisory, never one computed against the default.
- Failure propagation: mutators stop; status may degrade, with distinct codes.
- A shared boundary for every change-bound operation (reconciler, repo sync, archive incl. post-archive metadata, CLI DAG commands). Callers propagate warnings.
- Composition: `createResolveChangeSchema(deps|config)` and `kernel.changes.resolveSchema` as the shared instance.

### Implementation Status

| Requirement                         | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input and result contract           | Implemented                            | `resolve-change-schema.ts:6-40,61-85`. The input has an extra `changeName`, which is harmless.                                                                                                                                                                                                                                                                                     |
| Sovereign named lookup              | Partial at the provider level          | The service calls `get(schemaName)` (`:62`). But `LazySchemaProvider.get(ref)` always resolves the workspace default first (`composition/lazy-schema-provider.ts:40-48`) before it resolves `ref`. See X2.                                                                                                                                                                         |
| Provider identity integrity         | Implemented                            | `:64-70`. The error is `application/errors/schema-provider-identity-mismatch-error.ts`, extends `SpecdError`, code `SCHEMA_PROVIDER_IDENTITY_MISMATCH`, and carries the requested and returned names.                                                                                                                                                                              |
| Same-name version advisory          | Implemented                            | `:72-82` emits `SCHEMA_VERSION_DRIFT` with `recordedVersion` and `resolvedVersion`. The repo and manifest loader have no version warning (no `warn` in `infrastructure/fs/change-repository.ts`, `manifest-change-loader.ts`).                                                                                                                                                     |
| Failure propagation / caller policy | Implemented for this batch's consumers | Errors propagate unchanged. `GetStatus` maps them to `SCHEMA_IDENTITY_MISMATCH` and `SCHEMA_RESOLUTION_FAILED` (`get-status.ts:386-391`).                                                                                                                                                                                                                                          |
| Shared change-operation boundary    | Partial                                | Reconciler (`reconcile-change-validity.ts:206`), fingerprints (`validity-fingerprint-service.ts:120`), repo sync (`composition-resolver.ts:441-455`) and CLI DAG commands (`cli/src/helpers/change-schema.ts:15-36`, used by status/validate/spec-preview/artifacts) all use the resolver. **Post-archive metadata materialization does not** (X1). The CLI drops `warnings` (X4). |
| Composition                         | Implemented                            | `composition/use-cases/resolve-change-schema.ts:35-81`. The config form goes through `createCompositionResolver(...).getResolveChangeSchema()`. Kernel: `kernel.ts:373,433` uses `resolver.getResolveChangeSchema()`, the same memoized instance injected into consumers.                                                                                                          |

### Discrepancies

- **X1 [HIGH] Post-archive spec metadata materialization uses the workspace default.**
  - The spec text: "archive operations (including post-archive spec metadata materialization for the archived change's specs)".
  - The code path: `archive-change.ts:605` calls `this._materializeMetadata.execute({ specId, policy: 'force' })`, which goes through `MaterializeSpecMetadata` to `GenerateSpecMetadata.execute`. That calls `this._schemaProvider.get()` unnamed (`generate-spec-metadata.ts:94`). Neither `MaterializeSpecMetadataInput` (`materialize-spec-metadata.ts:20-25`) nor `GenerateSpecMetadataInput` (`generate-spec-metadata.ts:33-38`) can carry a schema.
  - For a `custom-workflow` change, the archived specs' metadata is extracted with the default schema's `metadataExtraction` rules.
  - Possibilities: (a) implementation bug: thread the change's resolved schema (or schema name) into materialize/generate for archive; or (b) spec drift: remove the parenthetical, if metadata is deliberately project-scoped.
  - The spec is explicit, so (a) is more likely. This belongs to the archive-change batch, but the shared-boundary requirement is in this spec.
  - `CompileContext` has the same transitive path through `GetSpecMetadata` (LOW, context-only).
- **X2 [MEDIUM] `LazySchemaProvider` always resolves the workspace default before a named lookup.**
  - The code: `lazy-schema-provider.ts:40-48` runs `this._resolve.execute()` for the default on every first call, even when `ref` names a different schema.
  - If the workspace default is missing or invalid, resolving `custom-workflow` for an existing change throws. That breaks the constraint "The workspace default cannot authorize, reject, or alter an existing change's schema resolution". It also breaks the verify text "the workspace default is not requested" (scenario "Named lookup failure does not fall back").
  - Possibilities: (a) implementation bug: only resolve the default when `ref === undefined`, or when `ref` matches `schemaRef` or a cached default name; or (b) spec drift: limit the "not requested" wording to the `ResolveChangeSchema` call contract.
  - The constraint wording favours (a).
- **X3 [LOW] Repo sync swallows `SchemaProviderIdentityMismatchError`.**
  - The code: `composition-resolver.ts:448-453` returns `null` (skip sync) for both `SchemaNotFoundError` and identity mismatch.
  - This matches fs-change-repository "skip artifact synchronization", and no schema-derived data is used. But identity mismatch is silent at load time. This is acceptable; note it for traceability.
  - The `null` result is cached per schema name for the repository's lifetime (`change-repository.ts:347-351`).
- **X4 [LOW–MEDIUM] CLI DAG commands discard `warnings`.**
  - The code: `status.ts:236,408`, `validate.ts:222,245`, `spec-preview.ts:78` and `artifacts.ts:57` read only `.schema`.
  - The spec says: "Callers that surface diagnostics SHALL propagate the returned warnings". `changes status` also gets them from `GetStatus` (`get-status.ts:500,841`), so the impact is limited to validate, spec-preview and artifacts.
  - Possibilities: (a) surface the warnings in those presenters; or (b) narrow the requirement to callers with structured diagnostic results.
- **X5 [LOW] Per-consumer default construction.**
  - `?? new ResolveChangeSchema(schemaProvider)` in every consumer creates a non-shared instance when the dependency is omitted. The spec allows "an equivalent dependency resolved from the same canonical composition boundary". The fallback is equivalent in behaviour but not composed through the boundary.
  - It also keeps vestigial `_schemaProvider` fields (`edit-change.ts:77`, `invalidate-change.ts:74`, `count-tasks.ts:34`).
  - Fix options: either make `resolveChangeSchema` required, or document the fallback.
- **X6 [LOW] "use case" vs service placement.** The spec calls it a use case. The class lives in `application/services/` and its factory in `composition/use-cases/`. This is acceptable under the architecture spec ("use cases and application services"); wording drift only.
- **X7 [LOW] Error message is not actionable.** `schema-provider-identity-mismatch-error.ts:27-28` states the facts without remediation guidance, which `_global/error-handling-conventions` asks for ("tell the user how to fix"). The JSDoc for `execute` (`:59`) omits the propagating `SchemaNotFoundError`/`SchemaValidationError`.

### Test Coverage

- Matching schema with no advisory: `test/application/services/resolve-change-schema.spec.ts:36`.
- Different default never consulted: `:55`. It uses a keyed fake that rejects unnamed `get()`. The real `LazySchemaProvider` is not covered.
- Named lookup failure propagates: `:78`.
- Identity mismatch, typed with both names: `:91`.
- Version drift advisory, with no logging: `:128`.
- Status degrades with `SCHEMA_IDENTITY_MISMATCH`: `test/application/use-cases/get-status.spec.ts:393,1124`.
- Advisory on the status result: `get-status.spec.ts:1167`.
- Kernel mapping only: `test/barrel-kernel-coverage.spec.ts:17`.

### Missing Tests

- "Workspace default version does not create advisory". No test has the same name, the default at v9 and the record at v1.
- `LazySchemaProvider` named lookup with a different or broken default. `test/composition/lazy-schema-provider.spec.ts` tests only unnamed `get()`, which is what would expose X2.
- `createResolveChangeSchema(deps)` and `createResolveChangeSchema(config)` both working (verify "Kernel exposes the shared resolver").
- `kernel.changes.resolveSchema` being the same instance injected into change-bound use cases.
- "Reconciler, repository sync, and CLI DAG use the shared resolver" end-to-end with a `custom-workflow` change and a different default. Only unit-level pieces exist.
- Archive post-archive metadata using the change schema (X1).

### Spec Dependency Chain

- `core:change`: consistent; the Schema version requirement now delegates advisories to this boundary.
- `core:schema-format`: not contradicted.
- `_global/error-handling-conventions`: the error extends `SpecdError` and the code is UPPER_SNAKE. The message is not actionable (X7).

---

## 2. core:change (delta-scoped requirements)

### Requirements Summary

The delta adds or modifies these requirements:

- StartVerification sovereign schema resolution.
- Schema version, now sovereign: no default rejection, identity mismatch is fatal, version drift is advisory only in the resolver.
- Sovereign schema for validity fingerprints.
- Verification requirement follows workflow topology.
- Signoff gate, which now follows topology.
- Artifact sync from the change's schema.
- A new `core:workflow-topology` dependency.

### Implementation Status

| Requirement                            | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StartVerification sovereign resolution | Implemented (ordering note) | `start-verification.ts:122-131` resolves before building the `verification-start` check context. Refresh (`:80`) and reconcile (`:81`) run first, but the reconciler resolves through the same boundary first (`reconcile-change-validity.ts:206`). So a failure still propagates before any attempt is created (`:84-97`).                                                 |
| Schema version                         | Implemented                 | Change-bound consumers resolve by `change.schemaName`. No repo or loader version warning. Identity mismatch comes from the resolver.                                                                                                                                                                                                                                        |
| Sovereign fingerprints                 | Implemented                 | `validity-fingerprint-service.ts:120-128` takes the artifact set and `hasTasks` exclusions from the resolved schema. Failures propagate with no fallback.                                                                                                                                                                                                                   |
| Verification follows topology          | Implemented                 | `reconcile-change-validity.ts:225,296-297`: `isWorkflowStepEnabled('verifying', schema) && VERIFICATION_STATES.has(state)`. The verdict is `not-required` (`change-validity.ts:485`). The `verification.current` check skips on `not-required` (`domain/checks/verification-current.ts`). `approve-signoff.ts:107-126` skips verification gates when verifying is disabled. |
| Signoff gate                           | Implemented                 | As above. Sign-off is only accepted in `done`/`pending-signoff` (`approve-signoff.ts:112`).                                                                                                                                                                                                                                                                                 |
| Artifact sync from the change schema   | Implemented                 | `syncArtifacts` is fed by `_artifactTypesFor({schemaName: change.schemaName})` (`change-repository.ts:686-691,1468-1503`).                                                                                                                                                                                                                                                  |

### Discrepancies

- **C1 [LOW] `VERIFICATION_STATES` ordering vs the spec list.** The code set (`reconcile-change-validity.ts:278-285`) has the same members as the spec list: verifying, done, pending-signoff, signed-off, archivable, archiving. Consistent; no action needed.
- **C2 [LOW] Dead `Change.updateSpecIds`.** `domain/entities/change.ts:1639` has no production caller after the EditChange rewrite. edit-change explicitly forbids calling it. Either remove it or keep it as legacy API. This is only drift risk.
- **C3 [LOW] Missing `@throws` for resolver errors.** `start-verification.ts:75-77` and `reconcile-change-validity.ts:124` do not document `SchemaProviderIdentityMismatchError` or `SchemaNotFoundError`, which `_global/error-handling-conventions` requires for use cases.

### Test Coverage

- StartVerification readiness from the change schema: `test/application/use-cases/start-verification.spec.ts:127`. The failure creates no attempt: `:140`.
- Disabled verifying gives `not-required` with no VERIFICATION\_\* blockers: `reconcile-change-validity.spec.ts:300`. Enabled verifying gives `absent`: `:290`.
- Fingerprints use the sovereign schema: `test/application/services/validity-fingerprint-service.spec.ts:172`. No fallback evidence on failure: `:203`.
- Signoff without verification when verifying is disabled: `approve-signoff.spec.ts:182,194`.
- Archive integrity failure and the recorded schema used: `archive-change.spec.ts:314,334`.
- `syncArtifacts` basic behaviour: `test/domain/entities/change.spec.ts:1218-1311`.

### Missing Tests

- Verify scenario "Reconciler resolves the schema through ResolveChangeSchema": the identity mismatch should fail and persist no projection. No `IdentityMismatch` test exists in `reconcile-change-validity.spec.ts`.
- "Enabled verifying still requires evidence at done": `:290` asserts `absent` but does not assert the `VERIFICATION_REQUIRED` blocker.
- "Schema version mismatch does not block archive": no archive test with same-name version drift.
- "Different workspace default does not reject an existing change" at load time with a real composition. The fs test `change-repository.spec.ts:2667` uses no resolver at all.
- "Custom-schema change is never synced from the workspace default": no test with two schemas and different artifact sets.
- StartVerification with a _different_ default schema. The test at `:127` only asserts that the lookup name equals `test-schema`; it does not show that the default's topology or checks are unused.

### Spec Dependency Chain

- `core:workflow-topology` (`isWorkflowStepEnabled`): it is used consistently in the reconciler, approve-signoff, lifecycle-evaluation and lifecycle-verdict.
- `core:resolve-change-schema`: consistent.

---

## 3. core:fs-change-repository

### Requirements Summary

- `resolveArtifactTypes` receives the change's schema reference and returns the sovereign artifact types through `ResolveChangeSchema`.
- All load and save paths use it.
- An unresolvable schema skips sync and leaves the map unchanged.
- No version warning against the default.

### Implementation Status

| Requirement                                   | Status      | Evidence                                                                                                                                         |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Callback takes the change's schema reference  | Implemented | `ChangeSchemaRef` and the callback type at `change-repository.ts:87-105`. Composition wiring: `composition-resolver.ts:441-455`.                 |
| All sync paths use the recorded schema        | Implemented | `_persistManifest` (used by save/mutate/create) `:686-691`. `_manifestToChange` (get/list) `:1367-1371,1503`. Scaffold `:895-901`.               |
| Unresolvable schema: skip sync, map unchanged | Implemented | `null` maps to `[]`, and `artifactTypes.length > 0` guards sync and normalization (`:1373,1502`). Raw artifacts are preserved from the manifest. |
| No version warning vs the default             | Implemented | No `Logger.warn` or version comparison in the fs repository or loader.                                                                           |

### Discrepancies

- **F1 [LOW] Stale `activeSchema` callback in the existing requirement.** The "Validate options at construction" requirement (merged spec, line 14) lists an `activeSchema` callback in `ChangeRepositoryConfig`. The code has none (`change-repository.ts:96-108`); `activeSchema` does not appear in the repository or the resolver.
  - Possibilities: (a) spec drift: remove `activeSchema`, which is consistent with the new sovereign requirement; or (b) restore a callback, which is unlikely and would contradict the new requirement.
- **F2 [LOW] The artifact-type cache keys only on schema name, and caches `null` for the repository's lifetime.** A transient `SchemaNotFoundError` (for example a plugin loaded later) disables sync until the process restarts. This is acceptable for CLI lifetimes, but the spec does not mention it.
- **F3 [LOW] Identity mismatch is swallowed into a skipped sync.** Same as X3.

### Test Coverage

- No default consulted on hydrate (no resolver configured): `test/infrastructure/fs/change-repository.spec.ts:2667`.
- No version warning on load: `:2686`.
- The callback receives the change's schema identity, cached per name: `:2695-2718`.
- Unresolvable schema skips sync, with no `artifacts-synced`: `:2720-2747`.
- Composition callback resolves real schema-std types: `test/composition/shared-repository-wiring.spec.ts:79-90`.

### Missing Tests

- "Custom-schema change syncs against its own artifact types" with a different `config.schemaRef`. No test configures two schemas and checks that the persisted map contains no default types after `get` and `mutate`.
- The no-version-warning test at `:2686` does not set up a recorded v1 against a default v2 (no default exists in that harness), so it passes vacuously.
- The composition `resolveArtifactTypes` returning `null` on `SchemaNotFoundError` or identity mismatch (`composition-resolver.ts:448-453`) is untested.

### Spec Dependency Chain

- `core:resolve-change-schema`: consistent.
- `core:change` "Artifact sync": consistent.

---

## 4. core:edit-change

### Requirements Summary

- The compatibility guardrail uses the change's sovereign schema.
- Uninitialized specs adopt the change schema, with no `GetActiveSchema`.
- Resolve once before mutation.
- The serialized mutation uses `replaceSpecIds` plus `ctx.reconcileAfter()`, with no `updateSpecIds` and no second lookup.
- Errors abort before or without persistence.

### Implementation Status

| Requirement                                             | Status      | Evidence                                                                                                                   |
| ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compatibility via `ResolveChangeSchema`                 | Implemented | `edit-change.ts:142-160`. Name match or `schema.compat()?.name`. Throws `IncompatibleSchemaError`.                         |
| Uninitialized spec adopts the change schema             | Implemented | `:152`: when `persisted.schema === null` it uses `schema.name()`, which is always compatible. No `GetActiveSchema` import. |
| Single resolution before mutation                       | Implemented | One `execute` call (`:143`) runs before `_executeScopeEdit`.                                                               |
| `replaceSpecIds` + `reconcileAfter`, no `updateSpecIds` | Implemented | `:227-259`. `updateSpecIds` has no callers in `src`.                                                                       |
| Errors stop persistence                                 | Implemented | A resolution error throws before `mutate`. A reconcile rejection runs inside `_reconcile.mutate`.                          |

### Discrepancies

- **E1 [LOW] Resolution also runs for removal-only edits.** The resolver runs when `hasSpecChanges`, including remove-only, even though compatibility is only checked for adds. The spec says "MUST resolve that sovereign schema once before mutation when validating added-spec compatibility". This is harmless (it fails closed) but stricter than specified. It could also be read as intended fail-closed behaviour.
- **E2 [LOW] Advisory warnings are dropped.** `EditChangeResult` has no warnings channel. This relates to the "Callers that surface diagnostics" rule; `EditChange` exposes no diagnostics, so it is likely acceptable.
- **E3 [LOW] Conventions.**
  - The `import { ResolveChangeSchema }` sits mid-file at `edit-change.ts:65`, after the type declarations.
  - `@throws` (`:119`) omits `IncompatibleSchemaError`, `SchemaProviderIdentityMismatchError` and `SchemaNotFoundError`.
- **E4 [LOW] Constructor requirement drift.** The merged spec (line 105, constructor list line 118) lists `SchemaProvider` but not the optional `ResolveChangeSchema` constructor parameter (`:100`).

### Test Coverage

- Compatibility and DAG sync use `custom-workflow`, `get` is called once with the name, and the default throws if consulted: `test/application/use-cases/edit-change.spec.ts:485`. This also covers the uninitialized spec, because `auth/logout` has no `spec-lock`.
- Resolution failure leaves scope unchanged: `:522`.
- Reconcile rejection is atomic (no partial scope, history, artifacts or validity): `:434`.
- Same, compatible and incompatible schemas: `:564,593,624`.

### Missing Tests

- An explicit assertion that `replaceSpecIds` and `reconcileAfter` are invoked and `updateSpecIds` is not. This is structurally true but not asserted.
- The test named `:541` "allows uninitialized spec fallback when global schema matches change" still carries the wording of the REMOVED scenario. It should be renamed, or replaced with the new scenario (an incompatible default and an uninitialized spec accepted).

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## 5. core:invalidate-change

### Requirements Summary

- Resolve through `ResolveChangeSchema` after loading.
- Derive targets, global targets and downstream propagation from the change DAG.
- No default.
- Errors propagate before persistence.

### Implementation Status

| Requirement                    | Status      | Evidence                                                                                                                                                                                          |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve after load             | Implemented | `invalidate-change.ts:107-126`                                                                                                                                                                    |
| Targets from the sovereign DAG | Implemented | `resolveTargets(..., schema.artifacts())` at `:130`; `globalTargets(change, schema)` at `:138,341-343`. Downstream expansion happens in the reconciler, which resolves through the same boundary. |
| Errors before persistence      | Implemented | Resolution (`:122`) runs before `_reconcile.execute` (`:146`).                                                                                                                                    |

### Discrepancies

- **I1 [LOW] Double resolution.** Both `InvalidateChange` and the reconciler resolve the schema (memoized by `LazySchemaProvider`). This is consistent but redundant.
- **I2 [LOW] Missing `@throws`.** The JSDoc does not document resolver errors (`@throws` near `:237` only).

### Test Coverage

- Targets come from the change schema: `test/application/use-cases/invalidate-change.spec.ts:158`.
- A failure persists nothing: `:180`.

### Missing Tests

- The test at `:158` uses a change whose `schemaName` is `@specd/schema-std`, the same schema as the harness default. The verify scenario needs a `custom-workflow` change whose DAG differs from the default. The current test cannot detect a default leak where the two names coincide.

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## 6. core:count-tasks

### Requirements Summary

- `execute({change})` resolves through `ResolveChangeSchema` and derives task artifacts and patterns from it.
- No default.
- Errors propagate.

### Implementation Status

| Requirement          | Status      | Evidence                          |
| -------------------- | ----------- | --------------------------------- |
| Sovereign resolution | Implemented | `count-tasks.ts:48-52`            |
| No default influence | Implemented | Only the resolved schema is used. |
| Errors propagate     | Implemented | No catch.                         |

### Discrepancies

- **T1 [LOW] Existing requirements are stale relative to the new one.**
  - Merged spec line 12: "obtain the resolved schema through `SchemaProvider`".
  - Merged spec line 35: "MUST accept `ChangeRepository` and `SchemaProvider` as constructor dependencies".
  - The new requirement mandates `ResolveChangeSchema`, and the constructor also takes an optional `ResolveChangeSchema` (`:35`).
  - Possibility: spec drift in the untouched requirements. Update them to say "through `ResolveChangeSchema` (backed by `SchemaProvider`)".
- **T2 [LOW] Vestigial `_schemaProvider`.** The private field at `:34` is only used for the fallback (X5).

### Test Coverage

- Counts tasks declared only by the custom schema; the default throws if consulted: `test/application/use-cases/count-tasks.spec.ts:17`.
- A failure gives no fallback counts: `:48`.

### Missing Tests

None for the delta scenarios.

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## Cross-cutting consistency with global specs

- `_global/architecture`:
  - The application layer depends on ports only: the resolver imports only the `SchemaProvider` port and domain values. OK.
  - The config factory goes through the shared resolver. OK.
  - The kernel capability is also obtainable via `createResolveChangeSchema`, which is exported from `public.ts:337`. OK.
- `_global/error-handling-conventions`:
  - `SpecdError` subclass and UPPER_SNAKE code: OK.
  - Actionable message: missing (X7).
  - `@throws` on use cases: missing for resolver errors in EditChange, InvalidateChange, CountTasks, StartVerification and ReconcileChangeValidity (C3, E3, I2).
- `_global/testing`: unit tests use keyed fakes that reject unnamed `get()`, which is good. There are no integration tests with two real schemas: the gaps listed above.

## Summary

| Severity | Count | IDs                                                                                                                                                      |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 1     | X1 (post-archive metadata materialization uses the workspace default)                                                                                    |
| MEDIUM   | 2     | X2 (`LazySchemaProvider` always resolves the default before a named lookup), X4 (CLI validate/spec-preview/artifacts drop resolver warnings; LOW–MEDIUM) |
| LOW      | 16    | X3, X5, X6, X7, C1 (no action needed), C2, C3, F1, F2, F3, E1, E2, E3, E4, I1, I2, T1, T2 (some grouped)                                                 |

Requirements audited: 22 across 6 specs. Implemented: 20. Partial: 2 (resolve-change-schema "Sovereign named lookup" at the provider level, and "Shared change-operation boundary" for archive metadata).

Main missing tests:

- Reconciler identity-mismatch.
- A different-default load/sync integration for the fs repository.
- `LazySchemaProvider` named lookup with a broken default.
- Factory and kernel instance-identity tests.
- Archive with version drift.
- InvalidateChange with a non-default schema name.
- A rename or replacement of the stale EditChange "global schema fallback" test.

---

# Partial Compliance Audit E: Other Use Cases

Change: `schema-workflow-skippable-states`
Specs: core:archive-change, core:approve-spec, core:approve-signoff, core:compile-context, core:get-artifact-instruction, core:get-hook-instructions, core:run-step-hooks, core:preview-spec, core:validate-artifacts

Paths are relative to `packages/core/`. Tests live in `test/application/use-cases/`.

Shared baseline: `src/application/services/resolve-change-schema.ts` calls `schemaProvider.get(input.schemaName)`. It throws `SchemaProviderIdentityMismatchError` when the returned `schema.name()` does not match, and emits a `SCHEMA_VERSION_DRIFT` advisory when only the version differs. All nine use cases call `this._resolveChangeSchema.execute(...)` right after loading the change. None of them still uses `SchemaMismatchError`. That class is still exported (`src/application/errors/index.ts:12`, `src/public.ts:440`) and is imported but unused in three tests: `approve-spec.spec.ts:6`, `approve-signoff.spec.ts:6` and `archive-change.spec.ts:6`.

---

## core:archive-change

### Requirements Summary

- **Sovereign schema resolution** (renamed from "Schema name guard"):
  - Resolve the schema through `ResolveChangeSchema`. The workspace default is irrelevant.
  - Resolution failures and identity mismatch propagate before preflight, hooks or commit.
  - No peer `list()`/`get()` runs before the predicates return.
- **Canonical validity archive preflight** (modified): verification is required only when `verifying` is enabled. When it is disabled, `verification.current` and the post-hook validity re-check do not block archive.
- Spec Dependencies: adds core:resolve-change-schema.

### Implementation Status

| Requirement / Scenario                                             | Status                                   | Evidence                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sovereign resolution via ResolveChangeSchema                       | Implemented                              | `src/application/use-cases/archive-change.ts:287`                                                                                                                                                                                                                                                                            |
| Identity mismatch propagates before peer listing                   | Implemented + tested                     | `archive-change.spec.ts:314-332`                                                                                                                                                                                                                                                                                             |
| Resolves sovereign schema when workspace default differs           | Implemented + tested                     | `archive-change.spec.ts:334-356` (`get` called with `custom-workflow`)                                                                                                                                                                                                                                                       |
| Archive without verification when verifying is disabled            | Implemented (indirectly), **NOT TESTED** | `reconcile-change-validity.ts:296-298` makes `verificationRequired` false when the step is disabled, so the verdict is `'not-required'` (`domain/services/change-validity.ts:485`). `domain/checks/verification-current.ts:36` returns skip. `archive-change.ts:1422-1428` (`postHookValidityBlocksArchive`) does not block. |
| Archive still requires verification when verifying is enabled      | Implemented, partially tested            | `archive-change.spec.ts:3717` uses a **stubbed** reconciler verdict `verification: 'stale'`. No test covers the `absent` case with an enabled `verifying` and the real reconciler.                                                                                                                                           |
| Typed recovery diagnostic, mandatory reconciler, live task recount | Implemented + tested (pre-existing)      | `archive-change.spec.ts:~3650-3960`                                                                                                                                                                                                                                                                                          |

### Discrepancies

- **MEDIUM: missing tests for the scenarios this change adds (lead confirmed).**
  - `archive-change.spec.ts` has no test that builds a schema with `makeWorkflowStep('verifying', { disabled: true })`. Grepping for `disabled` or `not-required` finds nothing relevant.
  - The verify scenario explicitly says "runs with the real reconciler". Only the reconciler unit test covers the verdict (`reconcile-change-validity.spec.ts:300`).
  - Implementation bug vs spec drift: this is a test gap, not an implementation bug. The code path is correct by composition.
- **LOW: orphan duplicate JSDoc.** The doc block at `archive-change.ts:~1405-1413` ("@param check … @throws Typed archive errors") sits directly above another JSDoc for `postHookValidityBlocksArchive`. It is left over from `throwMappedArchiveFailure`. This is a code-quality issue, not a spec issue.
- **LOW: unused import.** `SchemaMismatchError` is imported but unused in `archive-change.spec.ts:6`, which is a lint issue.

### Test Coverage

- Sovereign resolution: `archive-change.spec.ts:314`, `:334`
- Post-hook verification blocking (stubbed): `archive-change.spec.ts:3717`

### Missing Tests

1. Archive with `verifying` disabled, no verification evidence and the real `ReconcileChangeValidity`. It should succeed, with the predicate skipped and no post-hook block.
2. Archive with `verifying` enabled, `archivable`, no completed verification and the real reconciler. It should fail with `ArchiveImplementationStateError`, or `InvalidStateTransitionError` from the post-hook check.

### Spec Dependency Chain

- Consistent with core:change "Verification requirement follows workflow topology" and core:workflow-topology `isWorkflowStepEnabled`.
- Consistent with core:resolve-change-schema.

---

## core:approve-spec

### Requirements Summary

- The Gate guard step 4 now resolves the sovereign schema through ResolveChangeSchema. Resolution failures and identity mismatch propagate before consent.
- Verify adds the scenario "Sovereign schema resolution in gate guard".

### Implementation Status

| Item                                                                 | Status                     | Evidence                                                                         |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Gate disabled throws first, with no I/O                              | Implemented + tested       | `approve-spec.ts:79-81`; `approve-spec.spec.ts:344-372`                          |
| Sovereign resolution                                                 | Implemented + tested       | `approve-spec.ts:88`; `approve-spec.spec.ts:390-410`                             |
| Enabled gate, `pending-spec-approval` transitions to `spec-approved` | Implemented + tested       | `approve-spec.spec.ts:284`                                                       |
| Factory passes `config.approvals`                                    | Implemented, weakly tested | `test/composition/use-cases/approve-spec.spec.ts:22-27` only checks `instanceof` |

### Discrepancies

- **LOW: order of gate-guard steps.**
  - The spec lists: 2 load change, 3 resolve actor, 4 resolve schema.
  - The code runs: load change, then resolve schema (`approve-spec.ts:88`), then actor (`:94`).
  - The observable guarantee ("propagate before consent is recorded") holds either way.
  - Possible fixes: if this is spec drift, reorder the spec. If it is an implementation issue, the cost of fixing it is negligible.
- **LOW: no identity-mismatch test.** The spec requires `SchemaProviderIdentityMismatchError` to propagate, but no test covers it.

### Missing Tests

- Identity mismatch propagates and no consent is recorded.
- The factory receives `config.approvals`, with a behavioral assertion rather than only `instanceof`.

### Spec Dependency Chain

Consistent.

---

## core:approve-signoff

### Requirements Summary

- Gate guard step 4: sovereign resolution.
- **Signoff recording** (modified): when `verifying` is disabled, signoff does not require, look up or fingerprint-compare verification evidence, and raises no eligibility errors. When verification is required, the typed errors stay distinct.

### Implementation Status

| Item                                                                                | Status               | Evidence                                                                                |
| ----------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Sovereign resolution                                                                | Implemented + tested | `approve-signoff.ts:101`; `approve-signoff.spec.ts:488-508`                             |
| `verifyingEnabled` derived from the change schema                                   | Implemented          | `approve-signoff.ts:107` (`isWorkflowStepEnabled('verifying', schema)`)                 |
| Disabled verifying: signoff without evidence                                        | Implemented + tested | `approve-signoff.ts:117-158`; `approve-signoff.spec.ts:182-192` (`verificationId` null) |
| Disabled verifying: active attempt ignored                                          | Implemented + tested | `approve-signoff.spec.ts:194-202`                                                       |
| Distinct errors when required (not-found / in-progress / stale / legacy / mismatch) | Implemented + tested | `approve-signoff.spec.ts:205-290`                                                       |
| Enabled gate, `pending-signoff` transitions to `signed-off`                         | Implemented + tested | `approve-signoff.spec.ts:383`                                                           |

### Discrepancies

- **LOW: the spec text and its verify scenario disagree.**
  - The spec text says signoff "MAY be granted or renewed only while the reconciled change is in `done`".
  - The verify scenario "Enabled gate allows execute" expects `pending-signoff` to transition to `signed-off`, and the code accepts `pending-signoff` (`approve-signoff.ts:113`).
  - "Persistence and return value" reconciles the two through the historic drain.
  - Likely spec drift: the "Signoff recording" wording should mention the drain exception.
- **LOW: wording versus code on evidence lookup.**
  - The spec says "SHALL NOT … look up" verification evidence when verifying is disabled.
  - `approve-signoff.ts:116` reads `ctx.change.verification.completed` unconditionally. It is not used when verifying is disabled.
  - This is harmless, but it does not follow the wording literally.
- **LOW: order of gate-guard steps.** Schema is resolved before the actor, the same as in approve-spec.
- **LOW: unused `SchemaMismatchError` import.** `approve-signoff.spec.ts:6`.

### Missing Tests

- Identity mismatch propagates before consent.
- Disabled verifying while a stale or mismatching completed record exists. Signoff should still succeed and should not reference `completed.id`.
- The factory receives `config.approvals`, beyond `instanceof`.

### Spec Dependency Chain

Consistent with core:change and core:workflow-topology. The domain check `approval-signoff.ts:45` also treats `not-required` as passing.

---

## core:compile-context

### Requirements Summary

"Sovereign schema resolution" was renamed and modified. Instructions and templates come from the change's own schema, and identity mismatch propagates.

### Implementation Status

| Item                                           | Status                                        | Evidence                          |
| ---------------------------------------------- | --------------------------------------------- | --------------------------------- |
| Resolution via ResolveChangeSchema             | Implemented                                   | `compile-context.ts:276`          |
| Resolves sovereign schema when default differs | Tested                                        | `compile-context.spec.ts:544-557` |
| Resolution failure propagates                  | Tested                                        | `compile-context.spec.ts:508-541` |
| Identity mismatch propagates                   | Implemented (via the service), **NOT TESTED** | none                              |

### Discrepancies

- **LOW: incomplete JSDoc.** `@throws` at `compile-context.ts:262-263` omits `SchemaProviderIdentityMismatchError`. The same gap exists in `preview-spec.ts:101`, `validate-artifacts.ts:175`, `approve-*.ts` and `get-hook-instructions.ts:68`.

### Missing Tests

Identity-mismatch propagation.

### Spec Dependency Chain

Consistent.

---

## core:get-artifact-instruction

### Implementation Status

| Item                                                       | Status         | Evidence                                   |
| ---------------------------------------------------------- | -------------- | ------------------------------------------ |
| Resolution via ResolveChangeSchema                         | Implemented    | `get-artifact-instruction.ts:94`           |
| Resolves `custom-schema` when the default is `spec-driven` | Tested, weakly | `get-artifact-instruction.spec.ts:172-192` |
| Resolution failure propagates                              | Tested         | `get-artifact-instruction.spec.ts:153-170` |
| Identity mismatch propagates                               | **NOT TESTED** | none                                       |

### Discrepancies

- **LOW: weak test.** The test uses `vi.fn().mockResolvedValue(schema)`, which returns the same schema for any name. It therefore does not prove that the workspace default is ignored; only the `toHaveBeenCalledWith('custom-schema')` assertion carries the scenario.

### Missing Tests

- Identity mismatch.
- A provider that returns different schemas per name.

---

## core:get-hook-instructions

### Requirements Summary

- Sovereign resolution.
- Hooks declared on a `disabled: true` step are not returned, in either phase.
- Identity mismatch propagates.
- Adds core:workflow-topology as a dependency.

### Implementation Status

| Item                                                  | Status                            | Evidence                                                                                            |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sovereign resolution, for active and archived changes | Implemented + tested              | `get-hook-instructions.ts:103`; `get-hook-instructions.spec.ts:199-237`                             |
| Disabled step returns no hook instructions            | Implemented, **partially tested** | `get-hook-instructions.ts:114`; `get-hook-instructions.spec.ts:239-260` covers only the `pre` phase |
| Identity mismatch propagates                          | Implemented, **NOT TESTED**       | the verify scenario exists, but no test covers it                                                   |

### Discrepancies

- **MEDIUM: verify scenarios with no or partial tests.**
  - "Identity mismatch propagates" has no test.
  - "Disabled step returns no hook instructions" requires "either phase", but only `pre` is exercised.
- **LOW: `--only` on a disabled step.**
  - When `--only <id>` names a hook that exists on a disabled step, the code returns `[]` instead of `HookNotFoundError`, because the disabled check runs before the `only` filter.
  - This is consistent with "SHALL NOT be returned", but the behavior is not specified or tested. Possible fixes: define it in the spec, or add a test.
- **LOW: dependency wording.** The new dependency line says it is used "to decide verification and hook applicability", but this use case does not decide verification.

### Missing Tests

- Identity mismatch.
- Disabled step in the `post` phase.
- `--only` on a disabled step.

---

## core:run-step-hooks

### Requirements Summary

Sovereign resolution only. Resolution failures and identity mismatch propagate before any hook runs. Nothing in this spec is about disabled steps.

### Implementation Status

| Item                                                                          | Status         | Evidence                                                                 |
| ----------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Sovereign resolution, for active and archived changes                         | Implemented    | `run-step-hooks.ts:119`, `:166`. Resolution happens before hooks run.    |
| Resolves `custom-workflow` when the default is schema-std; executes its hooks | Tested, weakly | `run-step-hooks.spec.ts:90-104` (`mockResolvedValue`, no hooks executed) |
| Resolution failure propagates                                                 | Tested         | `run-step-hooks.spec.ts:78-88`                                           |
| Identity mismatch propagates before any hook runs                             | **NOT TESTED** | none                                                                     |

### Discrepancies

- **MEDIUM: the specs disagree on hooks for disabled steps.**
  - `RunStepHooks` does not check `isWorkflowStepEnabled`. It checks only `workflowStep === null` (`run-step-hooks.ts:129-131`, `:177-180`).
  - As a result, `specd changes run-hooks <name> verifying --phase pre` runs `run:` hooks declared on a disabled `verifying` step.
  - `GetHookInstructions` returns `[]` for the same step, on the grounds that "a disabled step is never entered or exited, so it has no applicable hook instructions".
  - design.md R15 states "Disabled step: absent from topology, candidates, and hooks", but R14 only patches `GetHookInstructions`.
  - Two readings are possible:
    - (a) **Spec gap / implementation omission.** core:run-step-hooks should carry the same disabled-step rule, and the code should return an empty result. This is the likely intent, given the design.
    - (b) **Intentional.** Executable hooks are left to callers. The skill routing in skills:workflow-automation never selects disabled-step hooks. If so, core:get-hook-instructions should state that the asymmetry is deliberate.
  - The lead's claim "Disabled step returns no hook instructions" for run-step-hooks is **not covered by any spec or verify scenario** and is **not implemented**.
- **LOW: weak sovereign test.** It does not cover "hooks defined in custom-workflow are resolved and executed".

### Missing Tests

- Identity mismatch, asserting that no hook ran.
- A sovereign test that runs a `custom-workflow` hook while the default schema has different hooks.
- A disabled-step test, once the spec decides which reading applies.

---

## core:preview-spec

### Requirements Summary

- Sovereign resolution.
- **Error handling** (modified): the "always succeeds" rule now covers only content failures. Change lookup failures, schema resolution failures and identity mismatch propagate.
- Verify adds: "Schema identity mismatch propagates instead of a partial result" and "Schema resolution failure propagates".

### Implementation Status

| Item                                             | Status                      | Evidence                                                      |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------- |
| Resolution, not wrapped in try/catch             | Implemented                 | `preview-spec.ts:108-112`, before the per-artifact try blocks |
| Resolves `custom-schema`                         | Tested, weakly              | `preview-spec.spec.ts:139-158` (`mockResolvedValue`)          |
| Identity mismatch propagates (no partial result) | Implemented, **NOT TESTED** | none                                                          |
| Schema resolution failure propagates             | Implemented, **NOT TESTED** | none                                                          |
| Content failures become a warning and `missing`  | Tested                      | `preview-spec.spec.ts:337-478`                                |
| `DiffGenerationError` becomes a warning          | Tested                      | `preview-spec.spec.ts:574`                                    |

### Discrepancies

- **MEDIUM: both new verify scenarios under "Error handling" have no tests.** `preview-spec.spec.ts` has no `SchemaProviderIdentityMismatchError` or `SchemaNotFoundError` cases. The implementation is correct.
- **LOW: incomplete JSDoc.** `@throws` (`preview-spec.ts:100-101`) omits schema resolution and identity-mismatch errors.

### Missing Tests

- A provider that returns a wrong-name schema should make `execute` reject with `SchemaProviderIdentityMismatchError` and return no result.
- A provider that throws should make `execute` reject with the same error.

---

## core:validate-artifacts

### Implementation Status

| Item                                                      | Status                 | Evidence                                                             |
| --------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| Resolution before any artifact-state change               | Implemented            | `validate-artifacts.ts:181`, the first step after loading the change |
| Resolves `custom-workflow@1.0.0` when the default differs | Tested (as `schema-a`) | `validate-artifacts.spec.ts:161-180`                                 |
| Resolution failure propagates                             | Tested                 | `validate-artifacts.spec.ts:141-156`                                 |
| Identity mismatch propagates before state changes         | **NOT TESTED**         | none                                                                 |

### Discrepancies

- **LOW: verify fixture name.** The scenario uses `custom-workflow@1.0.0` as the `schemaName`, which mixes a version into the name. The test uses `schema-a`. This is cosmetic drift in the verify scenario.

### Missing Tests

Identity mismatch, asserting that artifact state is unchanged and nothing is saved.

---

## Global Spec Consistency

- **Architecture** (application layer depends on ports; domain services are pure): respected. `isWorkflowStepEnabled` is a domain service consumed by application use cases. `ResolveChangeSchema` is an application service built on the `SchemaProvider` port.
- **Error handling:** typed `SpecdError` subclasses (`SchemaProviderIdentityMismatchError`, `VerificationNotFoundError` and others) propagate unchanged. No catch-to-generic was found in this batch.
- **Testing:** most of the identity-mismatch scenarios this change adds have no tests (see below). Several "workspace default differs" tests use `mockResolvedValue`, which returns the same schema for every name, so they cannot detect a regression that falls back to the default.
- **Conventions:** stale `SchemaMismatchError` imports remain in three tests, and `@throws` JSDoc is incomplete in several use cases.

## Summary

| Severity | Count | Items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 0     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| MEDIUM   | 4     | (1) archive-change: no tests for disabled or enabled verifying with the real reconciler. (2) get-hook-instructions: identity-mismatch scenario untested, disabled step tested only in `pre`. (3) run-step-hooks: hooks of a disabled step still run, inconsistent with get-hook-instructions and design R15 (spec gap). (4) preview-spec: both new error-propagation scenarios untested.                                                                                                                                                                                                                                                     |
| LOW      | 12    | approve-spec / approve-signoff: gate-guard order differs from the spec. approve-signoff: "only in `done`" wording versus the `pending-signoff` drain; unconditional `verification.completed` read. Identity-mismatch tests missing in approve-spec, approve-signoff, compile-context, get-artifact-instruction, run-step-hooks and validate-artifacts. Weak `mockResolvedValue` sovereign tests. Incomplete `@throws` JSDoc. Orphan JSDoc in `archive-change.ts:~1405`. Unused `SchemaMismatchError` imports. `--only` on a disabled step is unspecified. Dependency wording in get-hook-instructions. `custom-workflow@1.0.0` fixture name. |

Implementation status: every changed requirement in this batch is implemented, apart from the open question on run-step-hooks disabled steps. The gaps are mostly in test coverage.

---

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
