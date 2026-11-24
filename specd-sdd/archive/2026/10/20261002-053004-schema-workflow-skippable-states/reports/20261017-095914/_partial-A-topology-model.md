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
